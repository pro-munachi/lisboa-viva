package main

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type directChatInput struct {
	RecipientID string `json:"recipientId"`
	Body        string `json:"body"`
	ClientID    string `json:"clientId"`
}

func normalizeDirectPeer(peer, viewer string) (string, error) {
	if !chatUUID.MatchString(peer) || peer == "00000000-0000-0000-0000-000000000000" || strings.EqualFold(peer, viewer) {
		return "", apiError("invalid_peer")
	}
	return strings.ToLower(peer), nil
}

func normalizeDirectInput(input directChatInput, viewer string) (directChatInput, error) {
	var err error
	input.RecipientID, err = normalizeDirectPeer(input.RecipientID, viewer)
	if err != nil {
		return input, err
	}
	input.Body, input.ClientID, err = normalizeMessageFields(input.Body, input.ClientID)
	return input, err
}

type directChatQuery struct {
	Peer  string
	After *int64
	Limit int
}

func parseDirectQuery(raw, viewer string) (directChatQuery, error) {
	query := directChatQuery{Limit: 50}
	values, err := url.ParseQuery(raw)
	if err != nil {
		return query, apiError("invalid_query")
	}
	for key, value := range values {
		if (key != "peer" && key != "after" && key != "limit") || len(value) != 1 {
			return query, apiError("invalid_query")
		}
	}
	query.Peer, err = normalizeDirectPeer(values.Get("peer"), viewer)
	if err != nil {
		return query, err
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

type directConversation struct {
	Peer        chatAuthor  `json:"peer"`
	LastMessage chatMessage `json:"lastMessage"`
}

type directChatStore interface {
	list(context.Context, string, directChatQuery) (chatPage, error)
	post(context.Context, string, directChatInput) (chatMessage, bool, error)
	conversations(context.Context, string) ([]directConversation, error)
}

type directChatHandler struct {
	store directChatStore
	now   func() time.Time
	rates *chatLimiter
}

func (s *server) registerDirectChatRoutes(mux *http.ServeMux, rates *chatLimiter) {
	handler := &directChatHandler{store: pgDirectChatStore{s.db}, now: s.now, rates: rates}
	adultSession := func(next http.HandlerFunc) http.Handler {
		return s.requireSession(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := currentUser(r)
			if user.AdultConfirmedAt == nil {
				fail(w, apiError("forbidden"))
				return
			}
			next(w, r)
		}))
	}
	mux.Handle("GET /v1/chat/direct/messages", adultSession(handler.get))
	mux.Handle("POST /v1/chat/direct/messages", adultSession(handler.send))
	mux.Handle("GET /v1/chat/direct/conversations", adultSession(handler.inbox))
}

func (handler *directChatHandler) get(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	query, err := parseDirectQuery(r.URL.RawQuery, user.ID)
	if err != nil {
		fail(w, err)
		return
	}
	page, err := handler.store.list(r.Context(), user.ID, query)
	if err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusOK, page)
}

func (handler *directChatHandler) send(w http.ResponseWriter, r *http.Request) {
	if r.URL.RawQuery != "" {
		fail(w, apiError("invalid_query"))
		return
	}
	var input directChatInput
	if err := decodeJSON(r, &input); err != nil {
		fail(w, err)
		return
	}
	user := currentUser(r)
	input, err := normalizeDirectInput(input, user.ID)
	if err != nil {
		fail(w, err)
		return
	}
	// One bounded bucket covers both room and direct sends, across recipients.
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

func (handler *directChatHandler) inbox(w http.ResponseWriter, r *http.Request) {
	if r.URL.RawQuery != "" {
		fail(w, apiError("invalid_query"))
		return
	}
	conversations, err := handler.store.conversations(r.Context(), currentUser(r).ID)
	if err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusOK, struct {
		Conversations []directConversation `json:"conversations"`
	}{conversations})
}

type pgDirectChatStore struct{ db *pgxpool.Pool }

type directParticipantQuery interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

// Recheck account eligibility in storage too. Writes lock both account rows in
// UUID order until commit so suspension/deletion cannot race a successful send.
func validateDirectParticipants(ctx context.Context, q directParticipantQuery, viewer, peer string, lock bool) error {
	if _, err := normalizeDirectPeer(peer, viewer); err != nil {
		return err
	}
	statement := `SELECT id::text,(account_status='active' AND adult_confirmed_at IS NOT NULL AND deleted_at IS NULL)
		FROM users WHERE id IN ($1,$2) ORDER BY id`
	if lock {
		statement += ` FOR SHARE`
	}
	rows, err := q.Query(ctx, statement, viewer, peer)
	if err != nil {
		return err
	}
	defer rows.Close()
	viewerEligible, peerEligible := false, false
	for rows.Next() {
		var id string
		var eligible bool
		if err := rows.Scan(&id, &eligible); err != nil {
			return err
		}
		if strings.EqualFold(id, viewer) {
			viewerEligible = eligible
		} else if strings.EqualFold(id, peer) {
			peerEligible = eligible
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if !viewerEligible {
		return apiError("forbidden")
	}
	if !peerEligible {
		return apiError("peer_unavailable")
	}
	return nil
}

func directPairLock(viewer, peer string) string {
	viewer, peer = strings.ToLower(viewer), strings.ToLower(peer)
	if viewer > peer {
		viewer, peer = peer, viewer
	}
	return "roam:chat:direct:pair:" + viewer + ":" + peer
}

func (store pgDirectChatStore) list(ctx context.Context, viewer string, query directChatQuery) (chatPage, error) {
	page := chatPage{Messages: make([]chatMessage, 0, query.Limit)}
	if err := validateDirectParticipants(ctx, store.db, viewer, query.Peer, false); err != nil {
		return page, err
	}
	// A peer UUID never authorizes access to another pair: viewer is supplied by
	// the session and the pair predicate always contains that authenticated ID.
	statement := `SELECT m.id,('direct:'||$2::uuid::text),m.body,m.sent_at,u.id::text,u.handle,u.user_type::text
		FROM direct_messages m JOIN users u ON u.id=m.sender_id
		WHERE LEAST(m.sender_id,m.recipient_id)=LEAST($1::uuid,$2::uuid)
		AND GREATEST(m.sender_id,m.recipient_id)=GREATEST($1::uuid,$2::uuid)`
	args := []any{viewer, query.Peer, query.Limit + 1}
	if query.After == nil {
		statement += ` ORDER BY m.id DESC LIMIT $3`
	} else {
		statement += ` AND m.id>$3 ORDER BY m.id ASC LIMIT $4`
		args = []any{viewer, query.Peer, *query.After, query.Limit + 1}
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

const directSentColumns = `m.id,('direct:'||m.recipient_id::text),m.body,m.sent_at,u.id::text,u.handle,u.user_type::text`

func (store pgDirectChatStore) post(ctx context.Context, viewer string, input directChatInput) (chatMessage, bool, error) {
	tx, err := store.db.Begin(ctx)
	if err != nil {
		return chatMessage{}, false, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, "roam:chat:direct:nonce:"+viewer+":"+input.ClientID); err != nil {
		return chatMessage{}, false, err
	}
	if err := validateDirectParticipants(ctx, tx, viewer, input.RecipientID, true); err != nil {
		return chatMessage{}, false, err
	}
	existing, err := scanChatMessage(tx.QueryRow(ctx, `SELECT `+directSentColumns+` FROM direct_messages m
		JOIN users u ON u.id=m.sender_id WHERE m.sender_id=$1 AND m.client_id=$2`, viewer, input.ClientID))
	if err == nil {
		if existing.Room != "direct:"+input.RecipientID || existing.Body != input.Body {
			return chatMessage{}, false, apiError("nonce_conflict")
		}
		return existing, false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return chatMessage{}, false, err
	}
	// Both directions share a lock before allocating an identity. A cursor
	// cannot advance beyond an earlier uncommitted send from either participant.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, directPairLock(viewer, input.RecipientID)); err != nil {
		return chatMessage{}, false, err
	}
	message, err := scanChatMessage(tx.QueryRow(ctx, `WITH inserted AS (
		INSERT INTO direct_messages(sender_id,recipient_id,client_id,body) VALUES($1,$2,$3,$4)
		RETURNING id,recipient_id,body,sent_at,sender_id
	) SELECT `+directSentColumns+` FROM inserted m JOIN users u ON u.id=m.sender_id`, viewer, input.RecipientID, input.ClientID, input.Body))
	if err != nil {
		return chatMessage{}, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return chatMessage{}, false, err
	}
	return message, true, nil
}

func (store pgDirectChatStore) conversations(ctx context.Context, viewer string) ([]directConversation, error) {
	conversations := make([]directConversation, 0, 50)
	var eligible bool
	if err := store.db.QueryRow(ctx, `SELECT account_status='active' AND adult_confirmed_at IS NOT NULL AND deleted_at IS NULL
		FROM users WHERE id=$1`, viewer).Scan(&eligible); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return conversations, apiError("forbidden")
		}
		return conversations, err
	}
	if !eligible {
		return conversations, apiError("forbidden")
	}
	rows, err := store.db.Query(ctx, `WITH visible AS (
		SELECT m.*,m.recipient_id AS peer_id FROM direct_messages m WHERE m.sender_id=$1
		UNION ALL
		SELECT m.*,m.sender_id AS peer_id FROM direct_messages m WHERE m.recipient_id=$1
	), latest AS (
		SELECT DISTINCT ON (peer_id) * FROM visible ORDER BY peer_id,id DESC
	) SELECT p.id::text,p.handle,p.user_type::text,
		m.id,('direct:'||p.id::text),m.body,m.sent_at,u.id::text,u.handle,u.user_type::text
		FROM latest m JOIN users p ON p.id=m.peer_id JOIN users u ON u.id=m.sender_id
		WHERE p.account_status='active' AND p.adult_confirmed_at IS NOT NULL AND p.deleted_at IS NULL
		ORDER BY m.id DESC LIMIT 50`, viewer)
	if err != nil {
		return conversations, err
	}
	defer rows.Close()
	for rows.Next() {
		var conversation directConversation
		var id int64
		var sent time.Time
		m := &conversation.LastMessage
		p := &conversation.Peer
		if err := rows.Scan(&p.ID, &p.Handle, &p.UserType, &id, &m.Room, &m.Body, &sent, &m.Author.ID, &m.Author.Handle, &m.Author.UserType); err != nil {
			return conversations, err
		}
		m.ID = strconv.FormatInt(id, 10)
		m.SentAt = sent.UTC().Format(time.RFC3339Nano)
		conversations = append(conversations, conversation)
	}
	return conversations, rows.Err()
}
