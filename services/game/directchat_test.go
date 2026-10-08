package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const directTestViewer = "11111111-1111-4111-8111-111111111111"
const directTestPeer = "abcdef12-1234-4123-8123-123456789abc"

func TestDirectInputValidatesRecipientAndSharesPlainTextRules(t *testing.T) {
	for _, test := range []struct {
		name string
		peer string
		body string
		id   string
		code apiError
	}{
		{"canonical and Unicode", strings.ToUpper(directTestPeer), "\u2003 Olá 🌊 \u00a0", strings.ToUpper(testChatNonce), ""},
		{"self", directTestViewer, "hello", testChatNonce, "invalid_peer"},
		{"zero UUID", "00000000-0000-0000-0000-000000000000", "hello", testChatNonce, "invalid_peer"},
		{"malformed UUID", "another-user", "hello", testChatNonce, "invalid_peer"},
		{"UUID whitespace", " " + directTestPeer, "hello", testChatNonce, "invalid_peer"},
		{"empty", directTestPeer, "\t\n", testChatNonce, "invalid_message"},
		{"control", directTestPeer, "hidden\x00message", testChatNonce, "invalid_message"},
		{"invalid UTF8", directTestPeer, "hello\xff", testChatNonce, "invalid_message"},
		{"1000 Unicode points", directTestPeer, strings.Repeat("🌊", 1000), testChatNonce, ""},
		{"1001 Unicode points", directTestPeer, strings.Repeat("🌊", 1001), testChatNonce, "invalid_message"},
		{"invalid nonce", directTestPeer, "hello", "another-nonce", "invalid_client_id"},
	} {
		t.Run(test.name, func(t *testing.T) {
			input, err := normalizeDirectInput(directChatInput{RecipientID: test.peer, Body: test.body, ClientID: test.id}, directTestViewer)
			if test.code != "" {
				if err != test.code {
					t.Fatalf("got %v, want %s", err, test.code)
				}
				return
			}
			if err != nil || input.RecipientID != directTestPeer || input.ClientID != testChatNonce || input.Body != strings.TrimSpace(test.body) {
				t.Fatal("valid recipient/body/nonce did not normalize without losing Unicode")
			}
		})
	}
	if _, err := normalizeDirectPeer(strings.ToUpper(directTestPeer), directTestPeer); err != apiError("invalid_peer") {
		t.Fatal("self comparison did not canonicalize UUID casing")
	}
}

func TestDirectQueryAcceptsOnlyPeerAndCanonicalBoundedPagination(t *testing.T) {
	for _, test := range []struct {
		name string
		raw  string
		code apiError
	}{
		{"initial", "peer=" + directTestPeer, ""},
		{"big cursor", "peer=" + directTestPeer + "&after=9007199254740993&limit=1", ""},
		{"maximum cursor", "peer=" + directTestPeer + "&after=9223372036854775807&limit=50", ""},
		{"zero cursor", "peer=" + directTestPeer + "&after=0", ""},
		{"missing peer", "after=1", "invalid_peer"},
		{"self", "peer=" + directTestViewer, "invalid_peer"},
		{"duplicate peer", "peer=" + directTestPeer + "&peer=" + directTestPeer, "invalid_query"},
		{"duplicate cursor", "peer=" + directTestPeer + "&after=1&after=2", "invalid_query"},
		{"sender spoof", "peer=" + directTestPeer + "&senderId=" + directTestPeer, "invalid_query"},
		{"room query", "peer=" + directTestPeer + "&room=lisbon:city", "invalid_query"},
		{"bad encoding", "peer=" + directTestPeer + "&after=%zz", "invalid_query"},
		{"overflow", "peer=" + directTestPeer + "&after=9223372036854775808", "invalid_cursor"},
		{"negative", "peer=" + directTestPeer + "&after=-1", "invalid_cursor"},
		{"noncanonical", "peer=" + directTestPeer + "&after=01", "invalid_cursor"},
		{"exponent", "peer=" + directTestPeer + "&after=1e3", "invalid_cursor"},
		{"empty cursor", "peer=" + directTestPeer + "&after=", "invalid_cursor"},
		{"limit zero", "peer=" + directTestPeer + "&limit=0", "invalid_query"},
		{"limit oversized", "peer=" + directTestPeer + "&limit=51", "invalid_query"},
		{"limit noncanonical", "peer=" + directTestPeer + "&limit=01", "invalid_query"},
	} {
		t.Run(test.name, func(t *testing.T) {
			query, err := parseDirectQuery(test.raw, directTestViewer)
			if test.code != "" {
				if err != test.code {
					t.Fatalf("got %v, want %s", err, test.code)
				}
				return
			}
			if err != nil || query.Peer != directTestPeer || query.Limit < 1 || query.Limit > 50 {
				t.Fatalf("valid direct query rejected: %v", err)
			}
			if test.name == "big cursor" && (query.After == nil || *query.After != 9007199254740993) {
				t.Fatal("bigint cursor lost precision")
			}
		})
	}
}

func TestDirectPairLockIsBidirectionalAndCanonical(t *testing.T) {
	first := directPairLock(directTestViewer, directTestPeer)
	if first != directPairLock(directTestPeer, directTestViewer) || first != directPairLock(directTestViewer, strings.ToUpper(directTestPeer)) || first == directPairLock(directTestViewer, "22222222-2222-4222-8222-222222222222") {
		t.Fatal("pair lock changes with direction/casing or collides with another pair")
	}
}

type fakeDirectStore struct {
	posts int
	lists int
	inbox int
	user  string
	input directChatInput
	query directChatQuery
	new   bool
	err   error
}

func (store *fakeDirectStore) post(_ context.Context, user string, input directChatInput) (chatMessage, bool, error) {
	store.posts++
	store.user, store.input = user, input
	return chatMessage{ID: "9007199254740993", Room: "direct:" + input.RecipientID, Body: input.Body,
		SentAt: "2026-10-07T14:00:00Z", Author: chatAuthor{ID: user, Handle: "visitor", UserType: "tourist"}}, store.new, store.err
}

func (store *fakeDirectStore) list(_ context.Context, user string, query directChatQuery) (chatPage, error) {
	store.lists++
	store.user, store.query = user, query
	return chatPage{Messages: []chatMessage{}}, store.err
}

func (store *fakeDirectStore) conversations(_ context.Context, user string) ([]directConversation, error) {
	store.inbox++
	store.user = user
	return []directConversation{}, store.err
}

func directTestRequest(method, path, body string) *http.Request {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	return r.WithContext(context.WithValue(r.Context(), userContextKey{}, authUser{
		ID: directTestViewer, Email: "private@example.test", Roles: []string{"admin"},
	}))
}

func TestDirectRoutesRequireSessionBeforeInputOrDatabase(t *testing.T) {
	handler := newServer(nil, false).routes()
	for _, request := range []struct{ method, path string }{
		{http.MethodGet, "/v1/chat/direct/messages?peer=invalid"},
		{http.MethodPost, "/v1/chat/direct/messages"},
		{http.MethodGet, "/v1/chat/direct/conversations"},
	} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(request.method, request.path, strings.NewReader("invalid")))
		if response.Code != http.StatusUnauthorized || !strings.Contains(response.Body.String(), "session_expired") {
			t.Fatal("unauthenticated private route was not rejected before database access")
		}
	}
}

func TestDirectSendUsesSessionIdentityAndSharedBoundedRateBucket(t *testing.T) {
	store := &fakeDirectStore{new: true}
	publicStore := &fakeChatStore{}
	public := &chatHandler{store: publicStore, now: time.Now, rates: newChatLimiter(2, 1)}
	handler := &directChatHandler{store: store, now: time.Now, rates: &public.rates}
	body := `{"recipientId":"` + strings.ToUpper(directTestPeer) + `","body":"  Olá 🌊  ","clientId":"` + strings.ToUpper(testChatNonce) + `"}`
	response := httptest.NewRecorder()
	handler.send(response, directTestRequest(http.MethodPost, "/v1/chat/direct/messages", body))
	if response.Code != http.StatusCreated || store.user != directTestViewer || store.input.RecipientID != directTestPeer || store.input.Body != "Olá 🌊" || store.input.ClientID != testChatNonce {
		t.Fatal("private send did not use trusted session identity and normalized content")
	}
	var envelope struct {
		Message chatMessage `json:"message"`
	}
	if json.Unmarshal(response.Body.Bytes(), &envelope) != nil || envelope.Message.Room != "direct:"+directTestPeer || envelope.Message.Author.ID != directTestViewer {
		t.Fatal("private message response lost viewer-relative room or author")
	}
	for _, field := range []string{"email", "roles", "token", "accountStatus"} {
		if strings.Contains(response.Body.String(), field) {
			t.Fatal("private message exposed account-only fields")
		}
	}
	// Registration shares the exact limiter address. Exercise that shared bucket
	// through a room handler to prove switching channel cannot escape the cap.
	limited := httptest.NewRecorder()
	public.send(limited, directTestRequest(http.MethodPost, "/v1/chat/messages", `{"room":"lisbon:city","body":"hi","clientId":"`+testChatNonce+`"}`))
	if limited.Code != http.StatusTooManyRequests || limited.Header().Get("Retry-After") != "60" || publicStore.posts != 0 {
		t.Fatal("changing from private to room chat bypassed the account send limit")
	}
}

func TestDirectSendRejectsSpoofedIdentityAndUnknownFieldsBeforeStorage(t *testing.T) {
	valid := `"recipientId":"` + directTestPeer + `","body":"hello","clientId":"` + testChatNonce + `"`
	for _, body := range []string{
		`{` + valid + `,"senderId":"` + directTestPeer + `"}`,
		`{` + valid + `,"author":{"id":"` + directTestPeer + `"}}`,
		`{` + valid + `,"room":"lisbon:city"}`,
		`{"recipientId":"` + directTestViewer + `","body":"hello","clientId":"` + testChatNonce + `"}`,
		`{` + valid + `}{}`,
		`{}`,
	} {
		store := &fakeDirectStore{}
		limiter := newChatLimiter(2, 20)
		handler := &directChatHandler{store: store, now: time.Now, rates: &limiter}
		response := httptest.NewRecorder()
		handler.send(response, directTestRequest(http.MethodPost, "/v1/chat/direct/messages", body))
		if response.Code != http.StatusBadRequest || store.posts != 0 || len(limiter.attempts) != 0 {
			t.Fatal("invalid or spoofed private input reached the limiter/storage")
		}
	}
}

func TestDirectHandlerQueriesCannotOverrideAuthenticatedViewer(t *testing.T) {
	store := &fakeDirectStore{}
	handler := &directChatHandler{store: store}
	response := httptest.NewRecorder()
	handler.get(response, directTestRequest(http.MethodGet, "/v1/chat/direct/messages?peer="+directTestPeer+"&after=9007199254740993", ""))
	if response.Code != http.StatusOK || store.user != directTestViewer || store.query.Peer != directTestPeer || store.query.After == nil || *store.query.After != 9007199254740993 {
		t.Fatal("private list lost trusted viewer or bigint query")
	}
	response = httptest.NewRecorder()
	handler.inbox(response, directTestRequest(http.MethodGet, "/v1/chat/direct/conversations?userId="+directTestPeer, ""))
	if response.Code != http.StatusBadRequest || store.inbox != 0 {
		t.Fatal("inbox accepted a supplied user identity")
	}
	response = httptest.NewRecorder()
	handler.inbox(response, directTestRequest(http.MethodGet, "/v1/chat/direct/conversations", ""))
	if response.Code != http.StatusOK || store.user != directTestViewer || store.inbox != 1 || !strings.Contains(response.Body.String(), `"conversations":[]`) {
		t.Fatal("inbox did not use session viewer and an array envelope")
	}
}

func TestDirectSendReplayAndFailureStatus(t *testing.T) {
	for _, test := range []struct {
		name   string
		err    error
		status int
	}{
		{"idempotent replay", nil, http.StatusOK},
		{"nonce reuse", apiError("nonce_conflict"), http.StatusConflict},
		{"unavailable peer", apiError("peer_unavailable"), http.StatusNotFound},
		{"non-adult viewer", apiError("forbidden"), http.StatusForbidden},
		{"database outage", errors.New("database unavailable"), http.StatusInternalServerError},
	} {
		t.Run(test.name, func(t *testing.T) {
			store := &fakeDirectStore{err: test.err}
			limiter := newChatLimiter(2, 20)
			handler := &directChatHandler{store: store, now: time.Now, rates: &limiter}
			response := httptest.NewRecorder()
			handler.send(response, directTestRequest(http.MethodPost, "/v1/chat/direct/messages", `{"recipientId":"`+directTestPeer+`","body":"hello","clientId":"`+testChatNonce+`"}`))
			if response.Code != test.status {
				t.Fatalf("got %d, want %d", response.Code, test.status)
			}
		})
	}
}
