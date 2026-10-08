package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"
)

// isolatedChatPool applies all migrations in a random, loopback-only schema.
// These fixtures never query, reset, or mutate real application accounts.
func TestDirectPostgresPrivateHistoryAndAccountEligibility(t *testing.T) {
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
			t.Fatalf("private endpoint returned %d, want %d; response=%s", response.Code, want, response.Body.String())
		}
	}
	register := func(handle, kind string) (authUser, *http.Cookie) {
		t.Helper()
		body, _ := json.Marshal(registerInput{Handle: handle, Email: handle + "@example.test", Password: "direct-integration-password", UserType: kind, AdultConfirmed: true})
		response := request(http.MethodPost, "/v1/auth/register", string(body), nil)
		status(response, http.StatusCreated)
		var user authUser
		if json.Unmarshal(response.Body.Bytes(), &user) != nil || user.ID == "" {
			t.Fatal("private test registration response was invalid")
		}
		for _, cookie := range response.Result().Cookies() {
			if cookie.Name == sessionCookie && cookie.Value != "" && cookie.HttpOnly {
				return user, cookie
			}
		}
		t.Fatal("private test account did not receive a session")
		return authUser{}, nil
	}
	userA, cookieA := register("direct_local", "local")
	userB, cookieB := register("direct_visitor", "tourist")
	userC, cookieC := register("direct_bystander", "tourist")
	send := func(input directChatInput, cookie *http.Cookie) *httptest.ResponseRecorder {
		body, _ := json.Marshal(input)
		return request(http.MethodPost, "/v1/chat/direct/messages", string(body), cookie)
	}
	messageFrom := func(response *httptest.ResponseRecorder) chatMessage {
		t.Helper()
		var envelope struct {
			Message chatMessage `json:"message"`
		}
		if json.Unmarshal(response.Body.Bytes(), &envelope) != nil || envelope.Message.ID == "" {
			t.Fatal("private message response was invalid")
		}
		return envelope.Message
	}
	get := func(peer, after string, limit int, cookie *http.Cookie) chatPage {
		t.Helper()
		query := url.Values{"peer": {peer}, "limit": {strconv.Itoa(limit)}}
		if after != "" {
			query.Set("after", after)
		}
		response := request(http.MethodGet, "/v1/chat/direct/messages?"+query.Encode(), "", cookie)
		status(response, http.StatusOK)
		var page chatPage
		if json.Unmarshal(response.Body.Bytes(), &page) != nil || page.Messages == nil {
			t.Fatal("private history response was invalid")
		}
		return page
	}
	inbox := func(cookie *http.Cookie) []directConversation {
		t.Helper()
		response := request(http.MethodGet, "/v1/chat/direct/conversations", "", cookie)
		status(response, http.StatusOK)
		var envelope struct {
			Conversations []directConversation `json:"conversations"`
		}
		if json.Unmarshal(response.Body.Bytes(), &envelope) != nil || envelope.Conversations == nil {
			t.Fatal("private inbox response was invalid")
		}
		return envelope.Conversations
	}
	input := directChatInput{RecipientID: userB.ID, Body: "  Olá 🌊 meet by the café?  ", ClientID: testChatNonce}
	status(send(input, nil), http.StatusUnauthorized)
	status(request(http.MethodGet, "/v1/chat/direct/messages?peer="+userB.ID, "", nil), http.StatusUnauthorized)
	status(request(http.MethodGet, "/v1/chat/direct/conversations", "", nil), http.StatusUnauthorized)
	first := send(input, cookieA)
	status(first, http.StatusCreated)
	message := messageFrom(first)
	if message.Author != (chatAuthor{ID: userA.ID, Handle: userA.Handle, UserType: userA.UserType}) || message.Room != "direct:"+userB.ID || message.Body != strings.TrimSpace(input.Body) {
		t.Fatal("private send did not persist trusted author and normalized content")
	}
	if sent, err := time.Parse(time.RFC3339Nano, message.SentAt); err != nil || sent.Location() != time.UTC {
		t.Fatal("private sentAt was not UTC ISO time")
	}
	for _, field := range []string{"email", "roles", "token", "accountStatus", "password"} {
		if strings.Contains(first.Body.String(), field) {
			t.Fatal("private author exposed account-only fields")
		}
	}
	// Seeing an avatar UUID is not permission to read its other conversations.
	for _, peer := range []string{userA.ID, userB.ID} {
		if page := get(peer, "", 50, cookieC); len(page.Messages) != 0 || page.HasMore || page.NextCursor != nil {
			t.Fatal("unrelated third account received another pair's private history")
		}
	}
	sender := get(userB.ID, "", 50, cookieA)
	recipient := get(userA.ID, "", 50, cookieB)
	if len(sender.Messages) != 1 || len(recipient.Messages) != 1 || sender.Messages[0].ID != message.ID || recipient.Messages[0].ID != message.ID || recipient.Messages[0].Room != "direct:"+userA.ID {
		t.Fatal("participants did not receive one history with viewer-relative rooms")
	}
	if conversations := inbox(cookieA); len(conversations) != 1 || conversations[0].Peer.ID != userB.ID || conversations[0].LastMessage.ID != message.ID || conversations[0].LastMessage.Room != "direct:"+userB.ID {
		t.Fatal("sender inbox is missing or has another account's thread")
	}
	if conversations := inbox(cookieB); len(conversations) != 1 || conversations[0].Peer.ID != userA.ID || conversations[0].LastMessage.Room != "direct:"+userA.ID {
		t.Fatal("recipient inbox does not use viewer-relative identity")
	}
	if len(inbox(cookieC)) != 0 {
		t.Fatal("third account received unrelated inbox threads")
	}
	status(request(http.MethodGet, "/v1/chat/direct/messages?peer="+userA.ID+"&senderId="+userB.ID, "", cookieC), http.StatusBadRequest)
	status(request(http.MethodGet, "/v1/chat/direct/conversations?userId="+userA.ID, "", cookieC), http.StatusBadRequest)
	status(request(http.MethodPost, "/v1/chat/direct/messages", `{"recipientId":"`+userB.ID+`","body":"spoof","clientId":"`+testChatNonce+`","author":{"id":"`+userA.ID+`"}}`, cookieC), http.StatusBadRequest)
	status(request(http.MethodPost, "/v1/chat/direct/messages", `{}`+strings.Repeat(" ", 16<<10), cookieA), http.StatusRequestEntityTooLarge)
	self := input
	self.RecipientID = userA.ID
	status(send(self, cookieA), http.StatusBadRequest)
	unknown := input
	unknown.RecipientID = "99999999-9999-4999-8999-999999999999"
	status(send(unknown, cookieA), http.StatusNotFound)
	// Same sender+nonce has one identity even when concurrent retries arrive.
	retries := make(chan *httptest.ResponseRecorder, 8)
	for range 8 {
		go func() { retries <- send(input, cookieA) }()
	}
	for range 8 {
		response := <-retries
		status(response, http.StatusOK)
		if messageFrom(response).ID != message.ID {
			t.Fatal("concurrent private retries allocated another message")
		}
	}
	var count int
	if pool.QueryRow(ctx, "SELECT count(*) FROM direct_messages WHERE sender_id=$1 AND client_id=$2", userA.ID, input.ClientID).Scan(&count) != nil || count != 1 {
		t.Fatal("private idempotency duplicated a row")
	}
	changed := input
	changed.Body = "Changed content"
	status(send(changed, cookieA), http.StatusConflict)
	changed.Body, changed.RecipientID = input.Body, userC.ID
	status(send(changed, cookieA), http.StatusConflict)
	// A second sender may use its own same nonce, and replies share the pair.
	reply := directChatInput{RecipientID: userA.ID, Body: "Yes, see you there", ClientID: testChatNonce}
	response := send(reply, cookieB)
	status(response, http.StatusCreated)
	replyMessage := messageFrom(response)
	if replyMessage.ID == message.ID || replyMessage.Author.ID != userB.ID || replyMessage.Room != "direct:"+userA.ID {
		t.Fatal("reply shared nonce or author identity with another sender")
	}
	if page := get(userB.ID, message.ID, 50, cookieA); len(page.Messages) != 1 || page.Messages[0].ID != replyMessage.ID || page.Messages[0].Room != "direct:"+userB.ID {
		t.Fatal("sender did not receive the reply through its existing cursor")
	}
	toC := directChatInput{RecipientID: userC.ID, Body: "A separate private thread", ClientID: "4b4fe99b-0000-4000-9000-000000000011"}
	response = send(toC, cookieA)
	status(response, http.StatusCreated)
	otherMessage := messageFrom(response)
	if page := get(userA.ID, "", 50, cookieC); len(page.Messages) != 1 || page.Messages[0].ID != otherMessage.ID {
		t.Fatal("separate pair included another peer's messages")
	}
	if conversations := inbox(cookieA); len(conversations) != 2 || conversations[0].Peer.ID != userC.ID || conversations[1].Peer.ID != userB.ID || conversations[1].LastMessage.ID != replyMessage.ID {
		t.Fatal("inbox is not unique per peer and newest-first across directions")
	}
	// Private messages never appear in the shared city stream, and vice versa.
	public := request(http.MethodGet, "/v1/chat/messages?room=lisbon:city", "", cookieA)
	status(public, http.StatusOK)
	var publicPage chatPage
	if json.Unmarshal(public.Body.Bytes(), &publicPage) != nil || len(publicPage.Messages) != 0 {
		t.Fatal("private history leaked into a shared room")
	}
	status(request(http.MethodPost, "/v1/chat/messages", `{"room":"lisbon:city","body":"Public city hello","clientId":"`+testChatNonce+`"}`, cookieC), http.StatusCreated)
	if page := get(userA.ID, "", 50, cookieC); len(page.Messages) != 1 || page.Messages[0].ID != otherMessage.ID {
		t.Fatal("shared chat leaked into a private pair")
	}
	// Seed an isolated history to verify newest windows and forward pagination.
	if _, err := pool.Exec(ctx, `INSERT INTO direct_messages(sender_id,recipient_id,client_id,body)
		SELECT $1,$2,gen_random_uuid(),'history-'||n FROM generate_series(1,55) n`, userB.ID, userA.ID); err != nil {
		t.Fatal("could not seed isolated private history")
	}
	page := get(userB.ID, "", 50, cookieA)
	if len(page.Messages) != 50 || page.HasMore || page.NextCursor == nil || *page.NextCursor != page.Messages[49].ID {
		t.Fatal("private initial window did not select the newest 50 with its polling cursor")
	}
	for index := 1; index < len(page.Messages); index++ {
		before, _ := strconv.ParseInt(page.Messages[index-1].ID, 10, 64)
		after, _ := strconv.ParseInt(page.Messages[index].ID, 10, 64)
		if before >= after || page.Messages[index].Room != "direct:"+userB.ID {
			t.Fatal("private initial window is not strictly ascending within the selected pair")
		}
	}
	if empty := get(userB.ID, *page.NextCursor, 50, cookieA); len(empty.Messages) != 0 || empty.HasMore || empty.NextCursor != nil {
		t.Fatal("empty private polling page has an invalid envelope")
	}
	firstPage := get(userB.ID, "0", 2, cookieA)
	nextPage := get(userB.ID, *firstPage.NextCursor, 2, cookieA)
	if len(firstPage.Messages) != 2 || !firstPage.HasMore || len(nextPage.Messages) != 2 || firstPage.Messages[1].ID == nextPage.Messages[0].ID {
		t.Fatal("private forward pagination repeated or skipped a page")
	}
	// Account eligibility changes cannot be used to retain private access.
	if _, err := pool.Exec(ctx, "UPDATE users SET account_status='suspended' WHERE id=$1", userB.ID); err != nil {
		t.Fatal("could not suspend isolated private peer")
	}
	status(request(http.MethodGet, "/v1/chat/direct/messages?peer="+userB.ID, "", cookieA), http.StatusNotFound)
	status(send(input, cookieA), http.StatusNotFound)
	status(request(http.MethodGet, "/v1/chat/direct/conversations", "", cookieB), http.StatusUnauthorized)
	if conversations := inbox(cookieA); len(conversations) != 1 || conversations[0].Peer.ID != userC.ID {
		t.Fatal("inbox included an ineligible peer")
	}
	if _, err := pool.Exec(ctx, "UPDATE users SET account_status='active',adult_confirmed_at=NULL WHERE id=$1", userB.ID); err != nil {
		t.Fatal("could not clear isolated adult confirmation")
	}
	status(request(http.MethodGet, "/v1/chat/direct/messages?peer="+userA.ID, "", cookieB), http.StatusForbidden)
	status(send(reply, cookieB), http.StatusForbidden)
	status(request(http.MethodGet, "/v1/chat/direct/conversations", "", cookieB), http.StatusForbidden)
	status(request(http.MethodGet, "/v1/chat/direct/messages?peer="+userB.ID, "", cookieA), http.StatusNotFound)
	if _, err := pool.Exec(ctx, "UPDATE users SET adult_confirmed_at=now(),deleted_at=now() WHERE id=$1", userB.ID); err != nil {
		t.Fatal("could not soft delete isolated private peer")
	}
	status(request(http.MethodGet, "/v1/chat/direct/messages?peer="+userB.ID, "", cookieA), http.StatusNotFound)
	status(request(http.MethodGet, "/v1/chat/direct/messages?peer="+userA.ID, "", cookieB), http.StatusForbidden)
	status(request(http.MethodGet, "/v1/chat/direct/conversations", "", cookieB), http.StatusForbidden)
	status(request(http.MethodPost, "/v1/auth/logout", "", cookieC), http.StatusOK)
	status(request(http.MethodGet, "/v1/chat/direct/conversations", "", cookieC), http.StatusUnauthorized)
}

func TestDirectPostgresBidirectionalCursorCommitOrder(t *testing.T) {
	ctx, pool := isolatedChatPool(t)
	var userA, userB string
	if pool.QueryRow(ctx, `INSERT INTO users(handle,user_type,adult_confirmed_at)
		VALUES('ordered_local','local',now()) RETURNING id::text`).Scan(&userA) != nil ||
		pool.QueryRow(ctx, `INSERT INTO users(handle,user_type,adult_confirmed_at)
		VALUES('ordered_visitor','tourist',now()) RETURNING id::text`).Scan(&userB) != nil {
		t.Fatal("could not create isolated ordering participants")
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal("could not open held private transaction")
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, directPairLock(userA, userB)); err != nil {
		t.Fatal("could not hold private pair lock")
	}
	var heldID int64
	if tx.QueryRow(ctx, `INSERT INTO direct_messages(sender_id,recipient_id,client_id,body)
		VALUES($1,$2,gen_random_uuid(),'held-first') RETURNING id`, userA, userB).Scan(&heldID) != nil {
		t.Fatal("could not create held private predecessor")
	}
	store := pgDirectChatStore{pool}
	type result struct {
		message chatMessage
		created bool
		err     error
	}
	waiting := make(chan result, 1)
	go func() {
		message, created, err := store.post(ctx, userB, directChatInput{RecipientID: userA, Body: "reply-after-first", ClientID: testChatNonce})
		waiting <- result{message, created, err}
	}()
	deadline := time.Now().Add(5 * time.Second)
	blocked := false
	for time.Now().Before(deadline) {
		if pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity
			WHERE application_name=current_setting('application_name') AND wait_event='advisory')`).Scan(&blocked) != nil {
			t.Fatal("could not inspect isolated pair lock wait")
		}
		if blocked {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	var allocated int64
	if !blocked || pool.QueryRow(ctx, "SELECT last_value FROM direct_messages_id_seq").Scan(&allocated) != nil || allocated != heldID {
		t.Fatal("opposite-direction sender allocated an ID before its predecessor committed")
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal("could not commit held private predecessor")
	}
	select {
	case outcome := <-waiting:
		if outcome.err != nil || !outcome.created || outcome.message.Author.ID != userB {
			t.Fatal("opposite-direction writer did not commit successfully after pair unlock")
		}
		page, err := store.list(ctx, userA, directChatQuery{Peer: userB, After: &heldID, Limit: 50})
		if err != nil || len(page.Messages) != 1 || page.Messages[0].ID != outcome.message.ID || page.Messages[0].Body != "reply-after-first" {
			t.Fatal("forward private cursor skipped the serialized reply")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("private writer did not resume after pair unlock")
	}
}

func TestDirectPostgresInboxIsBoundedToNewestFiftyPeers(t *testing.T) {
	ctx, pool := isolatedChatPool(t)
	var viewer string
	if pool.QueryRow(ctx, `INSERT INTO users(handle,user_type,adult_confirmed_at)
		VALUES('inbox_local','local',now()) RETURNING id::text`).Scan(&viewer) != nil {
		t.Fatal("could not create isolated inbox participant")
	}
	if _, err := pool.Exec(ctx, `WITH peers AS (
		INSERT INTO users(handle,user_type,adult_confirmed_at)
		SELECT 'inbox_peer_'||n,'tourist',now() FROM generate_series(1,60) n RETURNING id
	) INSERT INTO direct_messages(sender_id,recipient_id,client_id,body)
		SELECT $1,id,gen_random_uuid(),'hello' FROM peers`, viewer); err != nil {
		t.Fatal("could not create isolated inbox peer histories")
	}
	store := pgDirectChatStore{pool}
	inbox, err := store.conversations(ctx, viewer)
	if err != nil || len(inbox) != 50 {
		t.Fatalf("private inbox is not bounded to 50: len=%d err=%v", len(inbox), err)
	}
	seen := make(map[string]bool)
	for index, thread := range inbox {
		id, err := strconv.ParseInt(thread.LastMessage.ID, 10, 64)
		if err != nil || thread.LastMessage.Room != "direct:"+thread.Peer.ID || thread.LastMessage.Author.ID != viewer || seen[thread.Peer.ID] {
			t.Fatal("private inbox included a duplicate, unrelated author, or malformed message")
		}
		seen[thread.Peer.ID] = true
		if index > 0 {
			previous, _ := strconv.ParseInt(inbox[index-1].LastMessage.ID, 10, 64)
			if previous <= id {
				t.Fatal("private inbox is not sorted newest first")
			}
		}
	}
}
