package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// This shares the auth test's loopback-only guard and creates separate tables
// in a random schema. It never queries or changes application account tables.
func isolatedChatPool(t *testing.T) (context.Context, *pgxpool.Pool) {
	t.Helper()
	raw := os.Getenv("ROAM_TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("set ROAM_TEST_DATABASE_URL to opt in to an isolated loopback PostgreSQL chat test")
	}
	config, err := loopbackTestConfig(raw)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	t.Cleanup(cancel)
	admin, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal("could not configure loopback chat test pool")
	}
	t.Cleanup(admin.Close)
	if err := admin.Ping(ctx); err != nil {
		t.Fatal("could not reach opted-in loopback PostgreSQL database")
	}
	suffix := make([]byte, 12)
	if _, err := rand.Read(suffix); err != nil {
		t.Fatal("could not generate chat test schema")
	}
	schema := "roam_chat_test_" + hex.EncodeToString(suffix)
	identifier := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+identifier); err != nil {
		t.Fatal("could not create isolated chat test schema")
	}
	t.Cleanup(func() {
		cleanupCtx, done := context.WithTimeout(context.Background(), 10*time.Second)
		defer done()
		if _, err := admin.Exec(cleanupCtx, "DROP SCHEMA "+identifier+" CASCADE"); err != nil {
			t.Error("could not remove isolated chat test schema")
			return
		}
		var remains bool
		if admin.QueryRow(cleanupCtx, "SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1)", schema).Scan(&remains) != nil || remains {
			t.Error("isolated chat schema cleanup could not be confirmed")
			return
		}
		t.Log("isolated PostgreSQL chat test schema removal confirmed")
	})
	isolated := config.Copy()
	isolated.ConnConfig.RuntimeParams["search_path"] = identifier
	isolated.ConnConfig.RuntimeParams["application_name"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, isolated)
	if err != nil {
		t.Fatal("could not configure isolated chat schema pool")
	}
	t.Cleanup(pool.Close)
	var actual string
	if pool.QueryRow(ctx, "SELECT current_schema()").Scan(&actual) != nil || actual != schema {
		t.Fatal("chat test pool is not isolated to its own schema")
	}
	root, err := filepath.Abs("../..")
	if err != nil || migrate(ctx, pool, root) != nil || migrate(ctx, pool, root) != nil {
		t.Fatal("chat test migrations did not apply idempotently")
	}
	return ctx, pool
}

func TestChatPostgresLoopbackIntegration(t *testing.T) {
	ctx, pool := isolatedChatPool(t)
	handler := newServer(pool, false).routes()
	request := func(method, path, body string, cookie *http.Cookie) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body)).WithContext(ctx)
		r.RemoteAddr = "127.0.0.1:23456"
		if cookie != nil {
			r.AddCookie(cookie)
		}
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, r)
		return response
	}
	status := func(response *httptest.ResponseRecorder, want int) {
		t.Helper()
		if response.Code != want {
			t.Fatalf("chat integration endpoint returned %d, want %d", response.Code, want)
		}
	}
	register := func(handle, kind string) (authUser, *http.Cookie) {
		t.Helper()
		body, _ := json.Marshal(registerInput{Handle: handle, Email: handle + "@example.test", Password: "chat-integration-password", UserType: kind, AdultConfirmed: true})
		response := request(http.MethodPost, "/v1/auth/register", string(body), nil)
		status(response, http.StatusCreated)
		var user authUser
		if json.Unmarshal(response.Body.Bytes(), &user) != nil || user.ID == "" {
			t.Fatal("registered chat account is invalid")
		}
		for _, cookie := range response.Result().Cookies() {
			if cookie.Name == sessionCookie && cookie.HttpOnly && cookie.Value != "" {
				return user, cookie
			}
		}
		t.Fatal("chat account did not receive a session")
		return authUser{}, nil
	}
	userA, cookieA := register("chat_local", "local")
	userB, cookieB := register("chat_visitor", "tourist")
	input := chatInput{Room: "lisbon:city", Body: "Olá Lisboa 🌊", ClientID: testChatNonce}
	send := func(input chatInput, cookie *http.Cookie) *httptest.ResponseRecorder {
		body, _ := json.Marshal(input)
		return request(http.MethodPost, "/v1/chat/messages", string(body), cookie)
	}
	messageFrom := func(response *httptest.ResponseRecorder) chatMessage {
		t.Helper()
		var result struct {
			Message chatMessage `json:"message"`
		}
		if json.Unmarshal(response.Body.Bytes(), &result) != nil || result.Message.ID == "" {
			t.Fatal("invalid persisted chat response")
		}
		return result.Message
	}
	get := func(room, after string, limit int, cookie *http.Cookie) chatPage {
		t.Helper()
		query := url.Values{"room": {room}, "limit": {strconv.Itoa(limit)}}
		if after != "" {
			query.Set("after", after)
		}
		response := request(http.MethodGet, "/v1/chat/messages?"+query.Encode(), "", cookie)
		status(response, http.StatusOK)
		var result chatPage
		if json.Unmarshal(response.Body.Bytes(), &result) != nil || result.Messages == nil {
			t.Fatal("invalid chat page response")
		}
		return result
	}
	status(send(input, nil), http.StatusUnauthorized)
	status(request(http.MethodGet, "/v1/chat/messages?room=lisbon:city", "", nil), http.StatusUnauthorized)
	first := send(input, cookieA)
	status(first, http.StatusCreated)
	message := messageFrom(first)
	if message.Author.ID != userA.ID || message.Author.Handle != "chat_local" || message.Author.UserType != "local" || message.Body != input.Body || message.Room != input.Room {
		t.Fatal("persisted message did not use trusted account identity/content")
	}
	if sent, err := time.Parse(time.RFC3339Nano, message.SentAt); err != nil || sent.Location() != time.UTC {
		t.Fatal("chat sentAt was not an ISO UTC timestamp")
	}
	for _, private := range []string{"email", "roles", "password", "token", "accountStatus"} {
		if strings.Contains(first.Body.String(), private) {
			t.Fatal("chat author exposed private account fields")
		}
	}
	// Repeated concurrent retries persist one row and return the same identity.
	retries := make(chan *httptest.ResponseRecorder, 8)
	for range 8 {
		go func() { retries <- send(input, cookieA) }()
	}
	for range 8 {
		retry := <-retries
		status(retry, http.StatusOK)
		if messageFrom(retry).ID != message.ID {
			t.Fatal("idempotent concurrent retries returned another message")
		}
	}
	var count int
	if pool.QueryRow(ctx, "SELECT count(*) FROM chat_messages WHERE user_id=$1 AND client_id=$2", userA.ID, input.ClientID).Scan(&count) != nil || count != 1 {
		t.Fatal("concurrent retries created duplicate messages")
	}
	changed := input
	changed.Body = "Changed payload"
	status(send(changed, cookieA), http.StatusConflict)
	changed.Body, changed.Room = input.Body, "lisbon:hotspot:comercio"
	status(send(changed, cookieA), http.StatusConflict)
	// The same client nonce is scoped to its account, not another person.
	other := send(input, cookieB)
	status(other, http.StatusCreated)
	if messageFrom(other).ID == message.ID || messageFrom(other).Author.ID != userB.ID {
		t.Fatal("idempotence leaked another person's message")
	}
	spot := chatInput{Room: "lisbon:hotspot:comercio", Body: "By the river", ClientID: "4b4fe99b-0000-4000-9000-000000000001"}
	status(send(spot, cookieA), http.StatusCreated)
	if page := get(spot.Room, "", 50, cookieB); len(page.Messages) != 1 || page.Messages[0].Body != spot.Body || page.HasMore {
		t.Fatal("hotspot messages were not isolated from city chat")
	}
	unknown := input
	unknown.Room = "lisbon:hotspot:secret"
	status(send(unknown, cookieA), http.StatusBadRequest)
	status(request(http.MethodGet, "/v1/chat/messages?room=lisbon:city&author=other", "", cookieA), http.StatusBadRequest)
	status(request(http.MethodPost, "/v1/chat/messages", `{"room":"lisbon:city","body":"spoof","clientId":"`+testChatNonce+`","author":{"id":"other"}}`, cookieA), http.StatusBadRequest)
	status(request(http.MethodPost, "/v1/chat/messages", `{}`+strings.Repeat(" ", 16<<10), cookieA), http.StatusRequestEntityTooLarge)
	// Seed enough rows to exercise newest-first selection and ascending cursors.
	if _, err := pool.Exec(ctx, `INSERT INTO chat_messages(room,user_id,client_id,body)
		SELECT 'lisbon:city',$1,gen_random_uuid(),'history-'||n FROM generate_series(1,55) n`, userB.ID); err != nil {
		t.Fatal("could not create isolated history fixtures")
	}
	page := get("lisbon:city", "", 50, cookieA)
	if len(page.Messages) != 50 || page.HasMore || page.NextCursor == nil || *page.NextCursor != page.Messages[49].ID {
		t.Fatal("initial page did not return newest 50 and final polling cursor")
	}
	for index := 1; index < len(page.Messages); index++ {
		before, _ := strconv.ParseInt(page.Messages[index-1].ID, 10, 64)
		after, _ := strconv.ParseInt(page.Messages[index].ID, 10, 64)
		if before >= after || page.Messages[index].Room != "lisbon:city" {
			t.Fatal("initial history is not strictly ascending within its room")
		}
	}
	empty := get("lisbon:city", *page.NextCursor, 50, cookieA)
	if len(empty.Messages) != 0 || empty.HasMore || empty.NextCursor != nil {
		t.Fatal("empty polling page has an invalid cursor/envelope")
	}
	batch := get("lisbon:city", "0", 2, cookieA)
	next := get("lisbon:city", *batch.NextCursor, 2, cookieA)
	if len(batch.Messages) != 2 || !batch.HasMore || len(next.Messages) != 2 || next.Messages[0].ID == batch.Messages[1].ID {
		t.Fatal("forward pagination repeated or lost rows")
	}
	// Hold a first insert uncommitted. The HTTP writer must wait for the room
	// lock before consuming another sequence ID, then appear after the cursor.
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal("could not open cursor ordering fixture")
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, "roam:chat:room:lisbon:city"); err != nil {
		t.Fatal("could not lock isolated chat room")
	}
	var heldID int64
	if tx.QueryRow(ctx, `INSERT INTO chat_messages(room,user_id,client_id,body)
		VALUES('lisbon:city',$1,gen_random_uuid(),'held-first') RETURNING id`, userB.ID).Scan(&heldID) != nil {
		t.Fatal("could not create held message")
	}
	waiting := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		waiting <- send(chatInput{Room: "lisbon:city", Body: "committed-next", ClientID: "4b4fe99b-0000-4000-9000-000000000002"}, cookieA)
	}()
	deadline := time.Now().Add(5 * time.Second)
	blocked := false
	for time.Now().Before(deadline) {
		if pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity
			WHERE application_name=current_setting('application_name') AND wait_event='advisory')`).Scan(&blocked) != nil {
			t.Fatal("could not inspect isolated transaction lock")
		}
		if blocked {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	var lastAllocated int64
	if !blocked || pool.QueryRow(ctx, "SELECT last_value FROM chat_messages_id_seq").Scan(&lastAllocated) != nil || lastAllocated != heldID {
		t.Fatal("same-room writer allocated an ID before its predecessor committed")
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal("could not commit cursor predecessor")
	}
	select {
	case response := <-waiting:
		status(response, http.StatusCreated)
		ordered := get("lisbon:city", strconv.FormatInt(heldID, 10), 50, cookieB)
		if len(ordered.Messages) != 1 || ordered.Messages[0].Body != "committed-next" {
			t.Fatal("after cursor skipped the serialized writer")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("chat writer did not resume after predecessor committed")
	}
	status(request(http.MethodPost, "/v1/auth/logout", "", cookieB), http.StatusOK)
	status(request(http.MethodGet, "/v1/chat/messages?room=lisbon:city", "", cookieB), http.StatusUnauthorized)
	status(send(input, cookieB), http.StatusUnauthorized)
	if _, err := pool.Exec(ctx, "UPDATE users SET account_status='suspended' WHERE id=$1", userA.ID); err != nil {
		t.Fatal("could not suspend isolated chat sender")
	}
	status(request(http.MethodGet, "/v1/chat/messages?room=lisbon:city", "", cookieA), http.StatusUnauthorized)
	status(send(input, cookieA), http.StatusUnauthorized)
}
