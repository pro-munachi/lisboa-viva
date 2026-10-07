package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

const testChatNonce = "8fd242be-20f7-4c2c-9224-4f16fdd9d56c"

func TestChatInputUnicodeAndCanonicalRooms(t *testing.T) {
	for _, test := range []struct {
		name string
		body string
		room string
		id   string
		code apiError
	}{
		{"trim Unicode spaces", "\u2003 Olá 🌊 \u00a0", "lisbon:city", strings.ToUpper(testChatNonce), ""},
		{"1000 code points", strings.Repeat("🌊", 1000), "lisbon:city", testChatNonce, ""},
		{"1001 code points", strings.Repeat("🌊", 1001), "lisbon:city", testChatNonce, "invalid_message"},
		{"multiline", "Olá\nLisboa\t🌊", "lisbon:city", testChatNonce, ""},
		{"empty", "\t\n\u2003", "lisbon:city", testChatNonce, "invalid_message"},
		{"NUL", "hello\x00world", "lisbon:city", testChatNonce, "invalid_message"},
		{"control", "hello\rworld", "lisbon:city", testChatNonce, "invalid_message"},
		{"invalid UTF8", "hi\xff", "lisbon:city", testChatNonce, "invalid_message"},
		{"actual mapped ID", "Hello", "lisbon:hotspot:node:11341409242", testChatNonce, ""},
		{"actual landmark", "Hello", "lisbon:hotspot:comercio", testChatNonce, ""},
		{"invented room", "Hello", "lisbon:hotspot:private-room", testChatNonce, "invalid_room"},
		{"home is private", "Hello", "lisbon:hotspot:home", testChatNonce, "invalid_room"},
		{"oversized room", "Hello", strings.Repeat("x", 161), testChatNonce, "invalid_room"},
		{"bad nonce", "Hello", "lisbon:city", "not-a-uuid", "invalid_client_id"},
		{"nil nonce", "Hello", "lisbon:city", "00000000-0000-0000-0000-000000000000", "invalid_client_id"},
	} {
		t.Run(test.name, func(t *testing.T) {
			input, err := normalizeChatInput(chatInput{Room: test.room, Body: test.body, ClientID: test.id})
			if test.code != "" {
				if err != test.code {
					t.Fatalf("got %v, want %s", err, test.code)
				}
				return
			}
			if err != nil || input.Body != strings.TrimSpace(test.body) || input.ClientID != testChatNonce {
				t.Fatalf("normalization did not preserve valid Unicode body/canonical nonce: %v", err)
			}
		})
	}
}

func TestChatQueryStrictCursorAndLimit(t *testing.T) {
	for _, test := range []struct {
		name  string
		query string
		code  apiError
	}{
		{"default", "room=lisbon:city", ""},
		{"maximum int64", "room=lisbon:city&after=9223372036854775807&limit=50", ""},
		{"BigInt-safe", "room=lisbon:city&after=9007199254740993&limit=1", ""},
		{"zero", "room=lisbon:city&after=0", ""},
		{"missing room", "after=1", "invalid_room"},
		{"unknown room", "room=lisbon:hotspot:secret", "invalid_room"},
		{"duplicate room", "room=lisbon:city&room=lisbon:city", "invalid_query"},
		{"duplicate cursor", "room=lisbon:city&after=1&after=2", "invalid_query"},
		{"unknown param", "room=lisbon:city&author=other", "invalid_query"},
		{"bad percent", "room=lisbon:city&after=%zz", "invalid_query"},
		{"overflow", "room=lisbon:city&after=9223372036854775808", "invalid_cursor"},
		{"negative", "room=lisbon:city&after=-1", "invalid_cursor"},
		{"leading zeros", "room=lisbon:city&after=01", "invalid_cursor"},
		{"plus", "room=lisbon:city&after=%2B1", "invalid_cursor"},
		{"exponent", "room=lisbon:city&after=1e3", "invalid_cursor"},
		{"empty cursor", "room=lisbon:city&after=", "invalid_cursor"},
		{"limit zero", "room=lisbon:city&limit=0", "invalid_query"},
		{"limit large", "room=lisbon:city&limit=51", "invalid_query"},
		{"limit noncanonical", "room=lisbon:city&limit=01", "invalid_query"},
	} {
		t.Run(test.name, func(t *testing.T) {
			query, err := parseChatQuery(test.query)
			if test.code != "" {
				if err != test.code {
					t.Fatalf("got %v, want %s", err, test.code)
				}
				return
			}
			if err != nil || query.Limit < 1 || query.Limit > 50 || query.Room != "lisbon:city" {
				t.Fatalf("valid query rejected: %v", err)
			}
			if test.name == "BigInt-safe" && (query.After == nil || *query.After != 9007199254740993) {
				t.Fatal("cursor lost integer precision")
			}
		})
	}
}

func TestChatLimiterIsBoundedPerAccountAndConcurrent(t *testing.T) {
	now := time.Date(2026, 10, 7, 14, 0, 0, 0, time.UTC)
	limiter := newChatLimiter(2, 20)
	var accepted atomic.Int32
	var workers sync.WaitGroup
	for range 80 {
		workers.Go(func() {
			if limiter.allow("visitor", now) {
				accepted.Add(1)
			}
		})
	}
	workers.Wait()
	if accepted.Load() != 20 || !limiter.allow("local", now) || limiter.allow("third", now) || len(limiter.attempts) != 2 {
		t.Fatal("concurrent rate cap or fixed active-account capacity was bypassed")
	}
	if limiter.allow("visitor", now.Add(time.Minute-time.Nanosecond)) || !limiter.allow("third", now.Add(time.Minute)) || len(limiter.attempts) != 1 {
		t.Fatal("window did not expire at the exact one-minute boundary")
	}
}

type fakeChatStore struct {
	posts int
	lists int
	user  string
	input chatInput
	err   error
	new   bool
}

func (store *fakeChatStore) post(_ context.Context, user string, input chatInput) (chatMessage, bool, error) {
	store.posts++
	store.user, store.input = user, input
	return chatMessage{ID: "9007199254740993", Room: input.Room, Body: input.Body, SentAt: "2026-10-07T14:00:00Z", Author: chatAuthor{ID: user, Handle: "visitor", UserType: "tourist"}}, store.new, store.err
}

func (store *fakeChatStore) list(_ context.Context, query chatQuery) (chatPage, error) {
	store.lists++
	return chatPage{Messages: []chatMessage{}}, store.err
}

func chatTestRequest(body string) *http.Request {
	r := httptest.NewRequest(http.MethodPost, "/v1/chat/messages", strings.NewReader(body))
	return r.WithContext(context.WithValue(r.Context(), userContextKey{}, authUser{ID: "trusted-account", Email: "private@example.test", Roles: []string{"admin"}}))
}

func TestChatSendUsesTrustedIdentityAndPublicResponse(t *testing.T) {
	store := &fakeChatStore{new: true}
	handler := &chatHandler{store: store, now: time.Now, rates: newChatLimiter(2, 1)}
	input := `{"room":"lisbon:city","body":"  Olá 🌊  ","clientId":"` + strings.ToUpper(testChatNonce) + `"}`
	response := httptest.NewRecorder()
	handler.send(response, chatTestRequest(input))
	if response.Code != http.StatusCreated || store.user != "trusted-account" || store.input.Body != "Olá 🌊" || store.input.ClientID != testChatNonce {
		t.Fatal("chat did not use only the authenticated account and normalized content")
	}
	var result map[string]json.RawMessage
	if json.Unmarshal(response.Body.Bytes(), &result) != nil || len(result) != 1 || result["message"] == nil {
		t.Fatal("response envelope is invalid")
	}
	var message map[string]json.RawMessage
	_ = json.Unmarshal(result["message"], &message)
	var author map[string]json.RawMessage
	_ = json.Unmarshal(message["author"], &author)
	if len(author) != 3 || author["id"] == nil || author["handle"] == nil || author["userType"] == nil || strings.Contains(response.Body.String(), "private@example.test") || strings.Contains(response.Body.String(), "roles") {
		t.Fatal("chat response exposed account-private information")
	}
	limited := httptest.NewRecorder()
	handler.send(limited, chatTestRequest(input))
	if limited.Code != http.StatusTooManyRequests || limited.Header().Get("Retry-After") != "60" || store.posts != 1 {
		t.Fatal("rate-limited send reached storage")
	}
}

func TestChatSendRejectsSpoofedIdentityAndInvalidBodiesBeforeStorage(t *testing.T) {
	for _, body := range []string{
		`{"room":"lisbon:city","body":"Hi","clientId":"` + testChatNonce + `","author":{"id":"other"}}`,
		`{"room":"lisbon:city","body":"Hi","clientId":"` + testChatNonce + `","userId":"other"}`,
		`{"room":"lisbon:hotspot:custom-pin","body":"Hi","clientId":"` + testChatNonce + `"}`,
		`{"room":"lisbon:city","body":"","clientId":"` + testChatNonce + `"}`,
		`{"room":"lisbon:city","body":"Hi","clientId":"` + testChatNonce + `"}{}`,
	} {
		store := &fakeChatStore{}
		handler := &chatHandler{store: store, now: time.Now, rates: newChatLimiter(2, 20)}
		response := httptest.NewRecorder()
		handler.send(response, chatTestRequest(body))
		if response.Code != http.StatusBadRequest || store.posts != 0 || len(handler.rates.attempts) != 0 {
			t.Fatal("invalid/identity-spoofed input reached the rate counter or storage")
		}
	}
}

func TestChatSendReplayAndErrors(t *testing.T) {
	for _, test := range []struct {
		name   string
		err    error
		status int
	}{
		{"replay", nil, http.StatusOK},
		{"nonce conflict", apiError("nonce_conflict"), http.StatusConflict},
		{"outage", errors.New("database unavailable"), http.StatusInternalServerError},
	} {
		t.Run(test.name, func(t *testing.T) {
			store := &fakeChatStore{err: test.err}
			handler := &chatHandler{store: store, now: time.Now, rates: newChatLimiter(2, 20)}
			response := httptest.NewRecorder()
			handler.send(response, chatTestRequest(`{"room":"lisbon:city","body":"Hi","clientId":"`+testChatNonce+`"}`))
			if response.Code != test.status {
				t.Fatalf("got status %d, want %d", response.Code, test.status)
			}
		})
	}
}

func TestChatRoutesRequireAuthenticationBeforeDatabaseOrInput(t *testing.T) {
	handler := newServer(nil, false).routes()
	for _, method := range []string{http.MethodGet, http.MethodPost} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(method, "/v1/chat/messages?room=invalid", strings.NewReader("invalid")))
		if response.Code != http.StatusUnauthorized || !strings.Contains(response.Body.String(), "session_expired") {
			t.Fatal("unauthenticated chat request was not rejected before database access")
		}
	}
}
