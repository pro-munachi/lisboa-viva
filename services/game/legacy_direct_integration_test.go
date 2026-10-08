package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Only used after isolatedChatPool has created a guarded random test schema.
// Resetting this schema's data-only ledger entry models a pre-008 deployment.
func importLegacyFixture(ctx context.Context, pool *pgxpool.Pool) error {
	data, err := os.ReadFile("../../db/migrations/008_legacy_direct_messages.sql")
	if err != nil {
		return err
	}
	if _, err := pool.Exec(ctx, "DELETE FROM schema_migrations WHERE name='008_legacy_direct_messages.sql'"); err != nil {
		return err
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	return applyMigration(ctx, tx, "008_legacy_direct_messages.sql", data)
}

func legacyPair(a, b string) string {
	if a > b {
		a, b = b, a
	}
	return "direct:" + a + ":" + b
}

func TestLegacyDirectPostgresMigrationAndCompatibleRoutesShareOneInbox(t *testing.T) {
	ctx, pool := isolatedChatPool(t)
	handler := newServer(pool, false).routes()
	request := func(method, path string, body any, cookie *http.Cookie) *httptest.ResponseRecorder {
		var data []byte
		if body != nil {
			data, _ = json.Marshal(body)
		}
		r := httptest.NewRequest(method, path, strings.NewReader(string(data))).WithContext(ctx)
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
			t.Fatalf("compatible private API returned %d, want %d", response.Code, want)
		}
	}
	register := func(handle string) (authUser, *http.Cookie) {
		t.Helper()
		response := request(http.MethodPost, "/v1/auth/register", registerInput{Handle: handle, Email: handle + "@example.test", Password: "compatible-private-password", UserType: "tourist", AdultConfirmed: true}, nil)
		status(response, http.StatusCreated)
		var user authUser
		if json.Unmarshal(response.Body.Bytes(), &user) != nil || user.ID == "" {
			t.Fatal("invalid compatible private test account")
		}
		for _, cookie := range response.Result().Cookies() {
			if cookie.Name == sessionCookie && cookie.Value != "" {
				return user, cookie
			}
		}
		t.Fatal("test account did not receive a session")
		return authUser{}, nil
	}
	a, cookieA := register("legacy_first")
	b, cookieB := register("legacy_second")
	_, cookieC := register("legacy_third")
	sent := time.Now().UTC().Truncate(time.Microsecond).Add(-time.Hour)
	if _, err := pool.Exec(ctx, `INSERT INTO chat_messages(room,user_id,client_id,body)
		SELECT 'lisbon:city',$1,gen_random_uuid(),'public-'||n FROM generate_series(1,5) n`, a.ID); err != nil {
		t.Fatal("could not seed isolated public history")
	}
	if _, err := pool.Exec(ctx, `INSERT INTO chat_messages(room,user_id,client_id,body,sent_at)
		VALUES($1,$2,$3,'Legacy first',$4),($1,$5,$6,'Legacy reply',$7)`, legacyPair(a.ID, b.ID), a.ID, testChatNonce, sent, b.ID, "4b4fe99b-0000-4000-9000-000000000021", sent.Add(time.Minute)); err != nil {
		t.Fatal("could not seed isolated canonical private history")
	}
	if err := importLegacyFixture(ctx, pool); err != nil {
		t.Fatalf("legacy private migration failed: %v", err)
	}
	page := func(path string, cookie *http.Cookie) chatPage {
		t.Helper()
		response := request(http.MethodGet, path, nil, cookie)
		status(response, http.StatusOK)
		var page chatPage
		if json.Unmarshal(response.Body.Bytes(), &page) != nil || page.Messages == nil {
			t.Fatal("invalid private history page")
		}
		return page
	}
	inbox := func(cookie *http.Cookie) []directConversation {
		t.Helper()
		response := request(http.MethodGet, "/v1/chat/direct/conversations", nil, cookie)
		status(response, http.StatusOK)
		var result struct {
			Conversations []directConversation `json:"conversations"`
		}
		if json.Unmarshal(response.Body.Bytes(), &result) != nil || result.Conversations == nil {
			t.Fatal("invalid private inbox")
		}
		return result.Conversations
	}
	privateA := page("/v1/chat/direct/messages?peer="+b.ID, cookieA)
	if len(privateA.Messages) != 2 || privateA.Messages[0].Body != "Legacy first" || privateA.Messages[1].Body != "Legacy reply" || privateA.Messages[0].Author.ID != a.ID || privateA.Messages[1].Author.ID != b.ID || privateA.Messages[0].SentAt != sent.Format(time.RFC3339Nano) {
		t.Fatal("migration lost original participants, order, body or timestamp")
	}
	if conversations := inbox(cookieA); len(conversations) != 1 || conversations[0].Peer.ID != b.ID || conversations[0].LastMessage.ID != privateA.Messages[1].ID {
		t.Fatal("migrated private history is absent from the dedicated inbox")
	}
	legacyB := page("/v1/chat/messages?room=direct:"+a.ID, cookieB)
	if len(legacyB.Messages) != 2 || legacyB.Messages[0].ID != privateA.Messages[0].ID || legacyB.Messages[0].Room != "direct:"+a.ID {
		t.Fatal("legacy caller did not receive the same migrated private stream")
	}
	messageFrom := func(response *httptest.ResponseRecorder) chatMessage {
		t.Helper()
		var result struct {
			Message chatMessage `json:"message"`
		}
		if json.Unmarshal(response.Body.Bytes(), &result) != nil || result.Message.ID == "" {
			t.Fatal("invalid compatible private send response")
		}
		return result.Message
	}
	newInput := chatInput{Room: "direct:" + b.ID, Body: "New legacy route write", ClientID: "4b4fe99b-0000-4000-9000-000000000022"}
	response := request(http.MethodPost, "/v1/chat/messages", newInput, cookieA)
	status(response, http.StatusCreated)
	newMessage := messageFrom(response)
	dedicated := directChatInput{RecipientID: b.ID, Body: newInput.Body, ClientID: newInput.ClientID}
	retry := request(http.MethodPost, "/v1/chat/direct/messages", dedicated, cookieA)
	status(retry, http.StatusOK)
	if messageFrom(retry).ID != newMessage.ID {
		t.Fatal("retry through the other private API allocated another message")
	}
	if conversations := inbox(cookieB); len(conversations) != 1 || conversations[0].LastMessage.ID != newMessage.ID || conversations[0].LastMessage.Room != "direct:"+a.ID {
		t.Fatal("new legacy route write did not appear in the shared inbox")
	}
	reply := directChatInput{RecipientID: a.ID, Body: "New dedicated reply", ClientID: "4b4fe99b-0000-4000-9000-000000000023"}
	response = request(http.MethodPost, "/v1/chat/direct/messages", reply, cookieB)
	status(response, http.StatusCreated)
	last := messageFrom(response)
	if history := page("/v1/chat/messages?room=direct:"+b.ID+"&after="+newMessage.ID, cookieA); len(history.Messages) != 1 || history.Messages[0].ID != last.ID {
		t.Fatal("legacy polling cursor did not receive a dedicated route reply")
	}
	if history := page("/v1/chat/direct/messages?peer="+b.ID, cookieC); len(history.Messages) != 0 || len(inbox(cookieC)) != 0 {
		t.Fatal("third account saw migrated or new private history")
	}
	if history := page("/v1/chat/messages?room=direct:"+b.ID, cookieC); len(history.Messages) != 0 {
		t.Fatal("legacy route leaked a private pair to a third account")
	}
	dedicated.Body = "Changed nonce payload"
	status(request(http.MethodPost, "/v1/chat/direct/messages", dedicated, cookieA), http.StatusConflict)
	var sourceRows, directRows int
	if pool.QueryRow(ctx, "SELECT count(*) FROM chat_messages WHERE room LIKE 'direct:%'").Scan(&sourceRows) != nil || sourceRows != 2 ||
		pool.QueryRow(ctx, "SELECT count(*) FROM direct_messages").Scan(&directRows) != nil || directRows != 4 {
		t.Fatal("new private writes continued a parallel legacy store")
	}
}

func TestLegacyDirectPostgresMigrationSkipsOnlyExactDuplicatesAndRollsBackConflicts(t *testing.T) {
	for _, conflict := range []string{"identical", "body", "recipient", "timestamp"} {
		t.Run(conflict, func(t *testing.T) {
			ctx, pool := isolatedChatPool(t)
			var a, b, c string
			for index, dest := range []*string{&a, &b, &c} {
				if pool.QueryRow(ctx, "INSERT INTO users(handle,user_type,adult_confirmed_at) VALUES($1,'tourist',now()) RETURNING id::text", "collision_"+string(rune('a'+index))).Scan(dest) != nil {
					t.Fatal("could not create isolated collision participants")
				}
			}
			sent := time.Now().UTC().Truncate(time.Microsecond).Add(-time.Hour)
			if _, err := pool.Exec(ctx, `INSERT INTO chat_messages(room,user_id,client_id,body,sent_at) VALUES($1,$2,$3,'Original',$4)`, legacyPair(a, b), a, testChatNonce, sent); err != nil {
				t.Fatal("could not create isolated legacy collision source")
			}
			body, recipient, targetSent := "Original", b, sent
			switch conflict {
			case "body":
				body = "Different"
			case "recipient":
				recipient = c
			case "timestamp":
				targetSent = sent.Add(time.Second)
			}
			if _, err := pool.Exec(ctx, `INSERT INTO direct_messages(sender_id,recipient_id,client_id,body,sent_at) VALUES($1,$2,$3,$4,$5)`, a, recipient, testChatNonce, body, targetSent); err != nil {
				t.Fatal("could not create isolated dedicated collision target")
			}
			err := importLegacyFixture(ctx, pool)
			if conflict == "identical" {
				if err != nil {
					t.Fatalf("exact existing copy was rejected: %v", err)
				}
				if err := importLegacyFixture(ctx, pool); err != nil {
					t.Fatalf("reimport was not idempotent: %v", err)
				}
			} else if err == nil || !strings.Contains(err.Error(), "conflicts with an existing sender nonce") {
				t.Fatalf("conflicting %s was silently dropped: %v", conflict, err)
			}
			var source, target, ledger int
			if pool.QueryRow(ctx, "SELECT count(*) FROM chat_messages WHERE room LIKE 'direct:%'").Scan(&source) != nil || source != 1 ||
				pool.QueryRow(ctx, "SELECT count(*) FROM direct_messages").Scan(&target) != nil || target != 1 ||
				pool.QueryRow(ctx, "SELECT count(*) FROM schema_migrations WHERE name='008_legacy_direct_messages.sql'").Scan(&ledger) != nil {
				t.Fatal("private source/target rows were lost or duplicated")
			}
			if (conflict == "identical" && ledger != 1) || (conflict != "identical" && ledger != 0) {
				t.Fatal("failed import was recorded as applied, or successful import was not recorded")
			}
		})
	}
}
