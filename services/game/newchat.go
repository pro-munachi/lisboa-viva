package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed chat_rooms.json
var chatRoomsJSON []byte

var chatRooms = loadChatRooms(chatRoomsJSON)
var chatUUID = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func loadChatRooms(data []byte) map[string]struct{} {
	var names []string
	if err := json.Unmarshal(data, &names); err != nil || len(names) == 0 {
		panic("invalid bundled chat room roster")
	}
	rooms := make(map[string]struct{}, len(names))
	for _, name := range names {
		if len(name) > 160 || (name != "lisbon:city" && !strings.HasPrefix(name, "lisbon:hotspot:")) {
			panic("invalid bundled chat room name")
		}
		if _, duplicate := rooms[name]; duplicate {
			panic("duplicate bundled chat room name")
		}
		rooms[name] = struct{}{}
	}
	return rooms
}

func validChatRoom(room string) bool {
	_, allowed := chatRooms[room]
	return allowed
}

type chatInput struct {
	Room     string `json:"room"`
	Body     string `json:"body"`
	ClientID string `json:"clientId"`
}

func normalizeChatInput(input chatInput) (chatInput, error) {
	if !validChatRoom(input.Room) {
		return input, apiError("invalid_room")
	}
	input.Body = strings.TrimSpace(input.Body)
	if !utf8.ValidString(input.Body) || utf8.RuneCountInString(input.Body) < 1 || utf8.RuneCountInString(input.Body) > 1000 {
		return input, apiError("invalid_message")
	}
	for _, character := range input.Body {
		if unicode.IsControl(character) && character != '\n' && character != '\t' {
			return input, apiError("invalid_message")
		}
	}
	if !chatUUID.MatchString(input.ClientID) || input.ClientID == "00000000-0000-0000-0000-000000000000" {
		return input, apiError("invalid_client_id")
	}
	input.ClientID = strings.ToLower(input.ClientID)
	return input, nil
}

type chatQuery struct {
	Room  string
	After *int64
	Limit int
}

func parseChatQuery(raw string) (chatQuery, error) {
	query := chatQuery{Limit: 50}
	values, err := url.ParseQuery(raw)
	if err != nil {
		return query, apiError("invalid_query")
	}
	for key, value := range values {
		if (key != "room" && key != "after" && key != "limit") || len(value) != 1 {
			return query, apiError("invalid_query")
		}
	}
	query.Room = values.Get("room")
	if !validChatRoom(query.Room) {
		return query, apiError("invalid_room")
	}
	if values.Has("after") {
		text := values.Get("after")
		after, err := strconv.ParseInt(text, 10, 64)
		if err != nil || after < 0 || strconv.FormatInt(after, 10) != text {
			return query, apiError("invalid_cursor")
		}
		query.After = &after
	}
	if values.Has("limit") {
		text := values.Get("limit")
		limit, err := strconv.Atoi(text)
		if err != nil || limit < 1 || limit > 50 || strconv.Itoa(limit) != text {
			return query, apiError("invalid_query")
		}
		query.Limit = limit
	}
	return query, nil
}

type chatAuthor struct {
	ID       string `json:"id"`
	Handle   string `json:"handle"`
	UserType string `json:"userType"`
}

type chatMessage struct {
	ID     string     `json:"id"`
	Room   string     `json:"room"`
	Body   string     `json:"body"`
	SentAt string     `json:"sentAt"`
	Author chatAuthor `json:"author"`
}

type chatPage struct {
	Messages   []chatMessage `json:"messages"`
	HasMore    bool          `json:"hasMore"`
	NextCursor *string       `json:"nextCursor"`
}

type chatStore interface {
	list(context.Context, chatQuery) (chatPage, error)
	post(context.Context, string, chatInput) (chatMessage, bool, error)
}

type chatHandler struct {
	store chatStore
	now   func() time.Time
	rates chatLimiter
}

func (s *server) registerChatRoutes(mux *http.ServeMux) {
	handler := &chatHandler{store: pgChatStore{s.db}, now: s.now, rates: newChatLimiter(1024, 20)}
	mux.Handle("GET /v1/chat/messages", s.requireSession(http.HandlerFunc(handler.get)))
	mux.Handle("POST /v1/chat/messages", s.requireSession(http.HandlerFunc(handler.send)))
}

func (handler *chatHandler) get(w http.ResponseWriter, r *http.Request) {
	query, err := parseChatQuery(r.URL.RawQuery)
	if err != nil {
		fail(w, err)
		return
	}
	page, err := handler.store.list(r.Context(), query)
	if err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusOK, page)
}

func (handler *chatHandler) send(w http.ResponseWriter, r *http.Request) {
	if r.URL.RawQuery != "" {
		fail(w, apiError("invalid_query"))
		return
	}
	var input chatInput
	if err := decodeJSON(r, &input); err != nil {
		fail(w, err)
		return
	}
	input, err := normalizeChatInput(input)
	if err != nil {
		fail(w, err)
		return
	}
	user := currentUser(r)
	if !handler.rates.allow(user.ID, handler.now()) {
		w.Header().Set("Retry-After", "60")
		fail(w, apiError("rate_limited"))
		return
	}
	message, created, err := handler.store.post(r.Context(), user.ID, input)
	if err != nil {
		fail(w, err)
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	respond(w, status, struct {
		Message chatMessage `json:"message"`
	}{message})
}

// A fixed maximum of live buckets prevents account churn from growing memory.
// When full, retain existing buckets and reject new senders until one expires.
type chatLimiter struct {
	sync.Mutex
	attempts map[string][]time.Time
	capacity int
	limit    int
}

func newChatLimiter(capacity, limit int) chatLimiter {
	return chatLimiter{attempts: make(map[string][]time.Time), capacity: capacity, limit: limit}
}

func (limiter *chatLimiter) allow(account string, now time.Time) bool {
	limiter.Lock()
	defer limiter.Unlock()
	for id, attempts := range limiter.attempts {
		if len(attempts) == 0 || !now.Before(attempts[len(attempts)-1].Add(time.Minute)) {
			delete(limiter.attempts, id)
		}
	}
	attempts, exists := limiter.attempts[account]
	if !exists && len(limiter.attempts) >= limiter.capacity {
		return false
	}
	valid := attempts[:0]
	for _, attempt := range attempts {
		if now.Before(attempt.Add(time.Minute)) {
			valid = append(valid, attempt)
		}
	}
	if len(valid) >= limiter.limit {
		limiter.attempts[account] = valid
		return false
	}
	limiter.attempts[account] = append(valid, now)
	return true
}

type pgChatStore struct{ db *pgxpool.Pool }

const chatColumns = `m.id,m.room,m.body,m.sent_at,u.id::text,u.handle,u.user_type::text`

func scanChatMessage(row pgx.Row) (chatMessage, error) {
	var message chatMessage
	var id int64
	var sent time.Time
	err := row.Scan(&id, &message.Room, &message.Body, &sent, &message.Author.ID, &message.Author.Handle, &message.Author.UserType)
	if err != nil {
		return message, err
	}
	message.ID = strconv.FormatInt(id, 10)
	message.SentAt = sent.UTC().Format(time.RFC3339Nano)
	return message, nil
}

func (store pgChatStore) list(ctx context.Context, query chatQuery) (chatPage, error) {
	page := chatPage{Messages: make([]chatMessage, 0, query.Limit)}
	statement := `SELECT ` + chatColumns + ` FROM chat_messages m JOIN users u ON u.id=m.user_id
		WHERE m.room=$1 ORDER BY m.id DESC LIMIT $2`
	args := []any{query.Room, query.Limit + 1}
	if query.After != nil {
		statement = `SELECT ` + chatColumns + ` FROM chat_messages m JOIN users u ON u.id=m.user_id
			WHERE m.room=$1 AND m.id>$2 ORDER BY m.id ASC LIMIT $3`
		args = []any{query.Room, *query.After, query.Limit + 1}
	}
	rows, err := store.db.Query(ctx, statement, args...)
	if err != nil {
		return page, err
	}
	defer rows.Close()
	for rows.Next() {
		message, err := scanChatMessage(rows)
		if err != nil {
			return page, err
		}
		page.Messages = append(page.Messages, message)
	}
	if err := rows.Err(); err != nil {
		return page, err
	}
	extra := len(page.Messages) > query.Limit
	// The initial window intentionally selects the newest messages. hasMore
	// describes additional FORWARD pages only, rather than older history.
	page.HasMore = query.After != nil && extra
	if extra {
		page.Messages = page.Messages[:query.Limit]
	}
	if query.After == nil {
		for left, right := 0, len(page.Messages)-1; left < right; left, right = left+1, right-1 {
			page.Messages[left], page.Messages[right] = page.Messages[right], page.Messages[left]
		}
	}
	if len(page.Messages) > 0 {
		cursor := page.Messages[len(page.Messages)-1].ID
		page.NextCursor = &cursor
	}
	return page, nil
}

type chatTransaction interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	QueryRow(context.Context, string, ...any) pgx.Row
	Commit(context.Context) error
	Rollback(context.Context) error
}

func (store pgChatStore) post(ctx context.Context, userID string, input chatInput) (chatMessage, bool, error) {
	tx, err := store.db.Begin(ctx)
	if err != nil {
		return chatMessage{}, false, err
	}
	return postChatMessage(ctx, tx, userID, input)
}

func postChatMessage(ctx context.Context, tx chatTransaction, userID string, input chatInput) (chatMessage, bool, error) {
	defer tx.Rollback(ctx)
	// Serialize account nonce retries, including attempts that change the room.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, "roam:chat:nonce:"+userID+":"+input.ClientID); err != nil {
		return chatMessage{}, false, err
	}
	existing, err := scanChatMessage(tx.QueryRow(ctx, `SELECT `+chatColumns+` FROM chat_messages m
		JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.client_id=$2`, userID, input.ClientID))
	if err == nil {
		if existing.Room != input.Room || existing.Body != input.Body {
			return chatMessage{}, false, apiError("nonce_conflict")
		}
		return existing, false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return chatMessage{}, false, err
	}
	// Acquire the room lock BEFORE identity allocation. Same-room sequence IDs
	// commit in order, so polling after an ID cannot skip an earlier transaction.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, "roam:chat:room:"+input.Room); err != nil {
		return chatMessage{}, false, err
	}
	message, err := scanChatMessage(tx.QueryRow(ctx, `WITH inserted AS (
		INSERT INTO chat_messages(room,user_id,client_id,body) VALUES($1,$2,$3,$4)
		RETURNING id,room,body,sent_at,user_id
	) SELECT `+chatColumns+` FROM inserted m JOIN users u ON u.id=m.user_id`, input.Room, userID, input.ClientID, input.Body))
	if err != nil {
		return chatMessage{}, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return chatMessage{}, false, err
	}
	return message, true, nil
}
