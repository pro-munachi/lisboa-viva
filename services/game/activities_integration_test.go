package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Every fixture uses isolatedChatPool's random, loopback-only schema and its
// confirmed cleanup. No real account, balance, presence or activity is queried.
type activityTestAccount struct {
	user   authUser
	cookie *http.Cookie
}

type activityTestHarness struct {
	t       *testing.T
	ctx     context.Context
	pool    *pgxpool.Pool
	handler http.Handler
	people  [3]activityTestAccount
}

func newActivityTestHarness(t *testing.T) *activityTestHarness {
	t.Helper()
	ctx, pool := isolatedChatPool(t)
	h := &activityTestHarness{t: t, ctx: ctx, pool: pool, handler: newServer(pool, false).routes()}
	for i, handle := range []string{"activity_host", "activity_guest", "activity_other"} {
		body := registerInput{
			Handle: handle, Email: handle + "@example.test", Password: "activity-integration-password",
			UserType: "tourist", AdultConfirmed: true,
		}
		response := h.request(http.MethodPost, "/v1/auth/register", body, nil)
		h.expectStatus(response, http.StatusCreated)
		if json.Unmarshal(response.Body.Bytes(), &h.people[i].user) != nil || h.people[i].user.ID == "" {
			t.Fatal("isolated activity account response was invalid")
		}
		for _, cookie := range response.Result().Cookies() {
			if cookie.Name == sessionCookie && cookie.HttpOnly && cookie.Value != "" {
				h.people[i].cookie = cookie
			}
		}
		if h.people[i].cookie == nil {
			t.Fatal("isolated activity account did not receive a session")
		}
	}
	return h
}

func (h *activityTestHarness) request(method, path string, body any, cookie *http.Cookie) *httptest.ResponseRecorder {
	var data string
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			h.t.Fatal("could not encode isolated activity request")
		}
		data = string(encoded)
	}
	r := httptest.NewRequest(method, path, strings.NewReader(data)).WithContext(h.ctx)
	r.RemoteAddr = "127.0.0.1:23456"
	if cookie != nil {
		r.AddCookie(cookie)
	}
	response := httptest.NewRecorder()
	h.handler.ServeHTTP(response, r)
	return response
}

func (h *activityTestHarness) expectStatus(response *httptest.ResponseRecorder, want int) {
	h.t.Helper()
	if response.Code != want {
		var problem struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(response.Body.Bytes(), &problem)
		h.t.Fatalf("activity endpoint returned %d, want %d (error=%s)", response.Code, want, problem.Error)
	}
}

func activityTestNonce(n int) string {
	return fmt.Sprintf("7a2bf800-0000-4000-9000-%012d", n)
}

func (h *activityTestHarness) createInput(n, capacity int) activityCreateInput {
	return activityCreateInput{
		Title: "A Lisbon evening together", Category: "nightlife", TravellerType: "tourist",
		VenueID:  "node:1802158801",
		StartsAt: time.Now().UTC().Add(time.Hour).Format(time.RFC3339),
		Capacity: capacity, ClientID: activityTestNonce(n),
	}
}

func (h *activityTestHarness) room(response *httptest.ResponseRecorder) activityEnvelope {
	h.t.Helper()
	var result activityEnvelope
	if json.Unmarshal(response.Body.Bytes(), &result) != nil || result.Activity.ID == "" {
		h.t.Fatal("invalid activity room envelope")
	}
	return result
}

func (h *activityTestHarness) message(response *httptest.ResponseRecorder) chatMessage {
	h.t.Helper()
	var result struct {
		Message chatMessage `json:"message"`
	}
	if json.Unmarshal(response.Body.Bytes(), &result) != nil || result.Message.ID == "" {
		h.t.Fatal("invalid activity message envelope")
	}
	return result.Message
}

func (h *activityTestHarness) action(response *httptest.ResponseRecorder) (activityEvent, activityWallet) {
	h.t.Helper()
	var result struct {
		Event  activityEvent  `json:"event"`
		Wallet activityWallet `json:"wallet"`
	}
	if json.Unmarshal(response.Body.Bytes(), &result) != nil || result.Event.ID == "" {
		h.t.Fatal("invalid activity action envelope")
	}
	return result.Event, result.Wallet
}

func activityTestPath(id, suffix string) string {
	return "/v1/activities/" + url.PathEscape(id) + suffix
}

func (h *activityTestHarness) create(n, capacity int) activityEnvelope {
	h.t.Helper()
	response := h.request(http.MethodPost, "/v1/activities", h.createInput(n, capacity), h.people[0].cookie)
	h.expectStatus(response, http.StatusCreated)
	return h.room(response)
}

func (h *activityTestHarness) presence(person int, place string) {
	h.t.Helper()
	latitude, longitude := 38.711631, -9.144132
	if place == "node:6016016285" {
		latitude, longitude = 38.707628, -9.147243
	}
	response := h.request(http.MethodPut, "/v1/multiplayer/presence", presenceInput{
		Latitude: latitude, Longitude: longitude, Area: "Lisboa", PlaceID: place,
	}, h.people[person].cookie)
	h.expectStatus(response, http.StatusOK)
}

func (h *activityTestHarness) join(id string, person int, optIn bool) activityEnvelope {
	h.t.Helper()
	response := h.request(http.MethodPost, activityTestPath(id, "/join"), map[string]bool{"socialOptIn": optIn}, h.people[person].cookie)
	h.expectStatus(response, http.StatusOK)
	return h.room(response)
}

func TestActivitiesMembershipAndPrivateRoomPostgresIntegration(t *testing.T) {
	h := newActivityTestHarness(t)
	input := h.createInput(1, 3)
	h.expectStatus(h.request(http.MethodGet, "/v1/activities", nil, nil), http.StatusUnauthorized)
	h.expectStatus(h.request(http.MethodPost, "/v1/activities", input, nil), http.StatusUnauthorized)
	created := h.request(http.MethodPost, "/v1/activities", input, h.people[0].cookie)
	h.expectStatus(created, http.StatusCreated)
	room := h.room(created).Activity
	if room.Host.ID != h.people[0].user.ID || room.MemberCount != 1 || !room.Joined || len(room.Members) != 1 || room.Capacity != 3 {
		t.Fatal("creation did not enroll its trusted session host exactly once")
	}
	for _, field := range []string{`"email"`, `"password"`, `"token"`, `"roles"`, `"accountStatus"`} {
		if strings.Contains(created.Body.String(), field) {
			t.Fatal("activity room exposed private account fields")
		}
	}
	replay := h.request(http.MethodPost, "/v1/activities", input, h.people[0].cookie)
	h.expectStatus(replay, http.StatusOK)
	if h.room(replay).Activity.ID != room.ID {
		t.Fatal("creation retry made a second activity")
	}
	changed := input
	changed.Title = "Different title with the same request ID"
	h.expectStatus(h.request(http.MethodPost, "/v1/activities", changed, h.people[0].cookie), http.StatusConflict)
	h.expectStatus(h.request(http.MethodGet, activityTestPath(room.ID, ""), nil, nil), http.StatusUnauthorized)
	h.expectStatus(h.request(http.MethodGet, activityTestPath(room.ID, ""), nil, h.people[2].cookie), http.StatusForbidden)
	messageInput := map[string]string{"body": "Meet by the bar counter", "clientId": activityTestNonce(2)}
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/messages"), messageInput, h.people[2].cookie), http.StatusForbidden)
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/join"), map[string]bool{}, nil), http.StatusUnauthorized)
	joined := h.join(room.ID, 1, false)
	if joined.Activity.MemberCount != 2 || len(joined.Activity.Members) != 2 || !joined.Activity.Joined {
		t.Fatal("joined participant did not receive the protected member room")
	}
	if again := h.join(room.ID, 1, false); again.Activity.MemberCount != 2 {
		t.Fatal("repeat join consumed a second seat")
	}
	// Membership permits remote planning chat; it does not pretend the member
	// has entered the mapped venue or publish fabricated physical presence.
	sent := h.request(http.MethodPost, activityTestPath(room.ID, "/messages"), messageInput, h.people[1].cookie)
	h.expectStatus(sent, http.StatusCreated)
	message := h.message(sent)
	if message.Author.ID != h.people[1].user.ID || message.Body != messageInput["body"] {
		t.Fatal("activity message did not use its trusted participant identity/content")
	}
	retry := h.request(http.MethodPost, activityTestPath(room.ID, "/messages"), messageInput, h.people[1].cookie)
	h.expectStatus(retry, http.StatusOK)
	if h.message(retry).ID != message.ID {
		t.Fatal("activity message retry duplicated its identity")
	}
	changedMessage := map[string]string{"body": "Changed request", "clientId": messageInput["clientId"]}
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/messages"), changedMessage, h.people[1].cookie), http.StatusConflict)
	view := h.request(http.MethodGet, activityTestPath(room.ID, ""), nil, h.people[0].cookie)
	h.expectStatus(view, http.StatusOK)
	if messages := h.room(view).Activity.Messages; len(messages) != 1 || messages[0].ID != message.ID {
		t.Fatal("host did not receive the participant's single private activity message")
	}
	listed := h.request(http.MethodGet, "/v1/activities", nil, h.people[2].cookie)
	h.expectStatus(listed, http.StatusOK)
	if strings.Contains(listed.Body.String(), messageInput["body"]) || strings.Contains(listed.Body.String(), `"messages"`) || strings.Contains(listed.Body.String(), `"members"`) {
		t.Fatal("discovery list exposed protected member room content")
	}
	leave := h.request(http.MethodPost, activityTestPath(room.ID, "/leave"), map[string]any{}, h.people[1].cookie)
	h.expectStatus(leave, http.StatusOK)
	h.expectStatus(h.request(http.MethodGet, activityTestPath(room.ID, ""), nil, h.people[1].cookie), http.StatusForbidden)
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/messages"), messageInput, h.people[1].cookie), http.StatusForbidden)
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/messages"), map[string]string{"body": "After leaving", "clientId": activityTestNonce(3)}, h.people[1].cookie), http.StatusForbidden)
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), activityActionInput{Kind: "wave", ClientID: activityTestNonce(4)}, h.people[2].cookie), http.StatusForbidden)
	h.join(room.ID, 1, false)
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/leave"), map[string]any{}, h.people[0].cookie), http.StatusOK)
	h.expectStatus(h.request(http.MethodGet, activityTestPath(room.ID, ""), nil, h.people[1].cookie), http.StatusGone)
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/join"), map[string]bool{}, h.people[2].cookie), http.StatusGone)
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/messages"), map[string]string{"body": "After closing", "clientId": activityTestNonce(5)}, h.people[1].cookie), http.StatusGone)
}

func TestActivitiesConcurrentCapacityPostgresIntegration(t *testing.T) {
	h := newActivityTestHarness(t)
	room := h.create(1, 2).Activity
	results := make(chan struct {
		person   int
		response *httptest.ResponseRecorder
	}, 2)
	start := make(chan struct{})
	for person := 1; person <= 2; person++ {
		go func(person int) {
			<-start
			response := h.request(http.MethodPost, activityTestPath(room.ID, "/join"), map[string]bool{}, h.people[person].cookie)
			results <- struct {
				person   int
				response *httptest.ResponseRecorder
			}{person, response}
		}(person)
	}
	close(start)
	joinResults := make([]struct {
		person   int
		response *httptest.ResponseRecorder
	}, 0, 2)
	for range 2 {
		joinResults = append(joinResults, <-results)
	}
	winner, admitted, full := 0, 0, 0
	for _, result := range joinResults {
		switch result.response.Code {
		case http.StatusOK:
			winner, admitted = result.person, admitted+1
		case http.StatusConflict:
			full++
		default:
			t.Fatalf("concurrent join returned unexpected status %d", result.response.Code)
		}
	}
	if admitted != 1 || full != 1 {
		t.Fatal("concurrent joins did not serialize around the single remaining seat")
	}
	view := h.request(http.MethodGet, activityTestPath(room.ID, ""), nil, h.people[0].cookie)
	h.expectStatus(view, http.StatusOK)
	if current := h.room(view).Activity; current.MemberCount != 2 || len(current.Members) != 2 {
		t.Fatal("activity capacity was exceeded or its roster diverged")
	}
	if repeat := h.join(room.ID, winner, false); repeat.Activity.MemberCount != 2 {
		t.Fatal("joined member could not retry join at full capacity")
	}
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/leave"), map[string]any{}, h.people[winner].cookie), http.StatusOK)
	other := 3 - winner
	if joined := h.join(room.ID, other, false); joined.Activity.MemberCount != 2 {
		t.Fatal("leaving did not release the seat for the other participant")
	}
}

func TestActivitiesWalletAndPurchaseRetryPostgresIntegration(t *testing.T) {
	h := newActivityTestHarness(t)
	coffeeInput := h.createInput(1, 3)
	coffeeInput.Category, coffeeInput.VenueID = "coffee", "node:6016016285"
	coffee := h.request(http.MethodPost, "/v1/activities", coffeeInput, h.people[0].cookie)
	h.expectStatus(coffee, http.StatusCreated)
	initial := h.room(coffee)
	room := initial.Activity
	if initial.Wallet.Balance != 200 || initial.Wallet.Currency == "" {
		t.Fatal("activity wallet did not receive the single simulated starting grant")
	}
	for range 3 {
		response := h.request(http.MethodGet, "/v1/activities", nil, h.people[0].cookie)
		h.expectStatus(response, http.StatusOK)
		var envelope struct {
			Wallet activityWallet `json:"wallet"`
		}
		if json.Unmarshal(response.Body.Bytes(), &envelope) != nil || envelope.Wallet.Balance != 200 {
			t.Fatal("reopening discovery changed or repeated the initial credit grant")
		}
	}
	var initialGrants int
	if h.pool.QueryRow(h.ctx, "SELECT count(*) FROM activity_credit_ledger WHERE user_id=$1 AND kind='initial'", h.people[0].user.ID).Scan(&initialGrants) != nil || initialGrants != 1 {
		t.Fatal("starting credits were not represented by exactly one grant")
	}
	input := activityActionInput{Kind: "drink", Item: "coffee", ClientID: activityTestNonce(2)}
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), input, nil), http.StatusUnauthorized)
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), input, h.people[2].cookie), http.StatusForbidden)
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), input, h.people[0].cookie), http.StatusForbidden)
	h.presence(0, "node:6016016285")
	// Race the original purchase against retries, not merely already-completed
	// requests. All responses must share one event and one eight-credit debit.
	responses := make(chan *httptest.ResponseRecorder, 8)
	start := make(chan struct{})
	for range 8 {
		go func() {
			<-start
			responses <- h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), input, h.people[0].cookie)
		}()
	}
	close(start)
	purchases := make([]*httptest.ResponseRecorder, 0, 8)
	for range 8 {
		purchases = append(purchases, <-responses)
	}
	eventID, created := "", 0
	for _, response := range purchases {
		if response.Code != http.StatusCreated && response.Code != http.StatusOK {
			t.Fatalf("concurrent purchase/retry returned %d", response.Code)
		}
		if response.Code == http.StatusCreated {
			created++
		}
		event, wallet := h.action(response)
		if eventID == "" {
			eventID = event.ID
		}
		if event.ID != eventID || event.Actor.ID != h.people[0].user.ID || wallet.Balance != 192 {
			t.Fatal("concurrent purchase retries changed identity, actor or debit")
		}
	}
	if created != 1 {
		t.Fatal("concurrent original purchase did not create exactly one event")
	}
	conflict := input
	conflict.Item = "mocktail"
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), conflict, h.people[0].cookie), http.StatusConflict)
	bar := h.create(50, 3)
	if bar.Wallet.Balance != 192 {
		t.Fatal("creating a second activity repeated the initial wallet grant")
	}
	room = bar.Activity
	h.presence(0, "node:1802158801")
	buy := func(item string, nonce, balance int) {
		t.Helper()
		response := h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), activityActionInput{Kind: "drink", Item: item, ClientID: activityTestNonce(nonce)}, h.people[0].cookie)
		h.expectStatus(response, http.StatusCreated)
		_, wallet := h.action(response)
		if wallet.Balance != balance {
			t.Fatal("drink price or cumulative wallet balance was incorrect")
		}
	}
	buy("mocktail", 3, 180)
	buy("beer", 4, 165)
	for i := 0; i < 9; i++ {
		buy("beer", 10+i, 165-15*(i+1))
	}
	room = initial.Activity
	h.presence(0, "node:6016016285")
	buy("coffee", 20, 22)
	buy("coffee", 21, 14)
	// Fourteen credits can fund one coffee, not two. The row lock must preserve
	// that rule under simultaneous different client nonces.
	concurrent := make(chan *httptest.ResponseRecorder, 2)
	start = make(chan struct{})
	for i := 0; i < 2; i++ {
		go func(nonce int) {
			<-start
			concurrent <- h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), activityActionInput{Kind: "drink", Item: "coffee", ClientID: activityTestNonce(nonce)}, h.people[0].cookie)
		}(30 + i)
	}
	close(start)
	coffeeResults := make([]*httptest.ResponseRecorder, 0, 2)
	for range 2 {
		coffeeResults = append(coffeeResults, <-concurrent)
	}
	success, insufficient := 0, 0
	for _, response := range coffeeResults {
		switch response.Code {
		case http.StatusCreated:
			success++
			_, wallet := h.action(response)
			if wallet.Balance != 6 {
				t.Fatal("successful concurrent coffee had an incorrect balance")
			}
		case http.StatusConflict:
			insufficient++
		default:
			t.Fatalf("concurrent overdraft attempt returned %d", response.Code)
		}
	}
	if success != 1 || insufficient != 1 {
		t.Fatal("concurrent purchases overspent or incorrectly denied both coffees")
	}
	var balance, debitCount, delta, eventCount int
	if h.pool.QueryRow(h.ctx, "SELECT balance FROM activity_wallets WHERE user_id=$1", h.people[0].user.ID).Scan(&balance) != nil || balance != 6 {
		t.Fatal("persisted wallet was negative or diverged from confirmed charges")
	}
	if h.pool.QueryRow(h.ctx, "SELECT count(*),coalesce(sum(delta),0) FROM activity_credit_ledger WHERE user_id=$1 AND kind='drink'", h.people[0].user.ID).Scan(&debitCount, &delta) != nil || debitCount != 15 || delta != -194 {
		t.Fatal("ledger duplicated retries or recorded a rejected debit")
	}
	if h.pool.QueryRow(h.ctx, "SELECT count(*) FROM activity_events WHERE actor_id=$1 AND kind='drink'", h.people[0].user.ID).Scan(&eventCount) != nil || eventCount != debitCount {
		t.Fatal("purchase events and debit ledger diverged")
	}
	other := h.request(http.MethodGet, "/v1/activities", nil, h.people[1].cookie)
	h.expectStatus(other, http.StatusOK)
	var otherWallet struct {
		Wallet activityWallet `json:"wallet"`
	}
	if json.Unmarshal(other.Body.Bytes(), &otherWallet) != nil || otherWallet.Wallet.Balance != 200 {
		t.Fatal("one participant's purchase charged another account")
	}
}

func TestActivitiesPresenceAndSocialConsentPostgresIntegration(t *testing.T) {
	h := newActivityTestHarness(t)
	room := h.create(1, 3).Activity
	h.join(room.ID, 1, false)
	flirt := activityActionInput{Kind: "flirt", TargetID: h.people[1].user.ID, ClientID: activityTestNonce(2)}
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), flirt, h.people[0].cookie), http.StatusForbidden)
	h.presence(0, "node:1802158801")
	h.presence(1, "node:6016016285")
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), flirt, h.people[0].cookie), http.StatusForbidden)
	h.presence(1, "node:1802158801")
	// Joining does not silently opt either player into social/flirting actions.
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), flirt, h.people[0].cookie), http.StatusForbidden)
	h.join(room.ID, 1, true)
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), flirt, h.people[0].cookie), http.StatusForbidden)
	h.join(room.ID, 0, true)
	accepted := h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), flirt, h.people[0].cookie)
	h.expectStatus(accepted, http.StatusCreated)
	event, wallet := h.action(accepted)
	if event.Actor.ID != h.people[0].user.ID || event.Target == nil || event.Target.ID != h.people[1].user.ID || wallet.Balance != 200 {
		t.Fatal("opted-in social action spoofed a participant or charged credits")
	}
	if _, err := h.pool.Exec(h.ctx, "UPDATE player_presence SET last_seen_at=now()-interval '2 minutes' WHERE user_id=$1", h.people[1].user.ID); err != nil {
		t.Fatal("could not age isolated presence fixture")
	}
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), activityActionInput{Kind: "wave", TargetID: h.people[1].user.ID, ClientID: activityTestNonce(3)}, h.people[0].cookie), http.StatusForbidden)
	h.presence(1, "node:1802158801")
	h.join(room.ID, 1, false)
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), activityActionInput{Kind: "flirt", TargetID: h.people[1].user.ID, ClientID: activityTestNonce(4)}, h.people[0].cookie), http.StatusForbidden)
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), activityActionInput{Kind: "flirt", TargetID: h.people[2].user.ID, ClientID: activityTestNonce(5)}, h.people[0].cookie), http.StatusForbidden)
}

func TestActivitiesChallengeConsentAndConsumptionPostgresIntegration(t *testing.T) {
	h := newActivityTestHarness(t)
	room := h.create(1, 3).Activity
	h.join(room.ID, 0, true)
	h.join(room.ID, 1, true)
	h.join(room.ID, 2, true)
	for person := range 3 {
		h.presence(person, "node:1802158801")
	}
	challenge := func(nonce int) activityEvent {
		t.Helper()
		response := h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), activityActionInput{Kind: "challenge", TargetID: h.people[1].user.ID, ClientID: activityTestNonce(nonce)}, h.people[0].cookie)
		h.expectStatus(response, http.StatusCreated)
		event, wallet := h.action(response)
		if event.Actor.ID != h.people[0].user.ID || event.Target == nil || event.Target.ID != h.people[1].user.ID || wallet.Balance != 200 {
			t.Fatal("play challenge did not preserve trusted participants and wallet")
		}
		return event
	}
	invitation := challenge(2)
	initial := activityActionInput{Kind: "challenge", TargetID: h.people[1].user.ID, ClientID: activityTestNonce(2)}
	retry := h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), initial, h.people[0].cookie)
	h.expectStatus(retry, http.StatusOK)
	if event, _ := h.action(retry); event.ID != invitation.ID {
		t.Fatal("challenge retry created another invitation")
	}
	accept := activityActionInput{Kind: "accept-challenge", InviteID: invitation.ID, ClientID: activityTestNonce(3)}
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), accept, h.people[0].cookie), http.StatusForbidden)
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), accept, h.people[2].cookie), http.StatusForbidden)
	// A target can decline an invitation after leaving the physical venue;
	// declining never requires joining the action or returning to the room.
	h.presence(1, "node:6016016285")
	decline := activityActionInput{Kind: "decline-challenge", InviteID: invitation.ID, ClientID: activityTestNonce(4)}
	response := h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), decline, h.people[1].cookie)
	h.expectStatus(response, http.StatusCreated)
	declined, wallet := h.action(response)
	if declined.Kind != "decline-challenge" || declined.Actor.ID != h.people[1].user.ID || wallet.Balance != 200 {
		t.Fatal("target decline did not resolve the challenge without a charge")
	}
	retry = h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), decline, h.people[1].cookie)
	h.expectStatus(retry, http.StatusOK)
	if event, _ := h.action(retry); event.ID != declined.ID {
		t.Fatal("decline retry created a second event")
	}
	h.presence(1, "node:1802158801")
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), accept, h.people[1].cookie), http.StatusConflict)
	var state, resolved string
	if h.pool.QueryRow(h.ctx, "SELECT status,resolved_event_id::text FROM activity_invitations WHERE id=$1", invitation.ID).Scan(&state, &resolved) != nil || state != "declined" || resolved != declined.ID {
		t.Fatal("declined challenge did not persist one target-authorized resolution")
	}
	invitation = challenge(5)
	accept = activityActionInput{Kind: "accept-challenge", InviteID: invitation.ID, ClientID: activityTestNonce(6)}
	response = h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), accept, h.people[1].cookie)
	h.expectStatus(response, http.StatusCreated)
	accepted, wallet := h.action(response)
	if accepted.Kind != "accept-challenge" || accepted.Actor.ID != h.people[1].user.ID || wallet.Balance != 200 {
		t.Fatal("accepted play challenge used another actor or charged credits")
	}
	if h.pool.QueryRow(h.ctx, "SELECT status,resolved_event_id::text FROM activity_invitations WHERE id=$1", invitation.ID).Scan(&state, &resolved) != nil || state != "accepted" || resolved != accepted.ID {
		t.Fatal("accepted challenge did not persist exactly one resolution")
	}
	// Even two valid commands from the intended target cannot both consume
	// the same invitation when they arrive at the same time.
	invitation = challenge(7)
	responses := make(chan struct {
		input    activityActionInput
		response *httptest.ResponseRecorder
	}, 2)
	start := make(chan struct{})
	for i, kind := range []string{"accept-challenge", "decline-challenge"} {
		go func(input activityActionInput) {
			<-start
			response := h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), input, h.people[1].cookie)
			responses <- struct {
				input    activityActionInput
				response *httptest.ResponseRecorder
			}{input, response}
		}(activityActionInput{Kind: kind, InviteID: invitation.ID, ClientID: activityTestNonce(8 + i)})
	}
	close(start)
	resolutions := make([]struct {
		input    activityActionInput
		response *httptest.ResponseRecorder
	}, 0, 2)
	for range 2 {
		resolutions = append(resolutions, <-responses)
	}
	consumed, unavailable := 0, 0
	var winningInput activityActionInput
	var winningEvent activityEvent
	for _, result := range resolutions {
		switch result.response.Code {
		case http.StatusCreated:
			consumed++
			winningInput = result.input
			winningEvent, _ = h.action(result.response)
		case http.StatusConflict:
			unavailable++
		default:
			t.Fatalf("concurrent challenge consumption returned %d", result.response.Code)
		}
	}
	if consumed != 1 || unavailable != 1 {
		t.Fatal("one invitation admitted multiple simultaneous resolutions")
	}
	var count int
	if h.pool.QueryRow(h.ctx, "SELECT count(*) FROM activity_events WHERE invite_id=$1 AND kind IN ('accept-challenge','decline-challenge')", invitation.ID).Scan(&count) != nil || count != 1 {
		t.Fatal("invitation had more than one persisted resolution event")
	}
	retry = h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), winningInput, h.people[1].cookie)
	h.expectStatus(retry, http.StatusOK)
	if event, _ := h.action(retry); event.ID != winningEvent.ID {
		t.Fatal("consumed invitation retry did not return its original resolution")
	}
	invitation = challenge(10)
	if _, err := h.pool.Exec(h.ctx, "UPDATE activity_invitations SET expires_at=now()-interval '1 minute' WHERE id=$1", invitation.ID); err != nil {
		t.Fatal("could not expire isolated challenge fixture")
	}
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), activityActionInput{Kind: "accept-challenge", InviteID: invitation.ID, ClientID: activityTestNonce(11)}, h.people[1].cookie), http.StatusConflict)
	if h.pool.QueryRow(h.ctx, "SELECT count(*) FROM activity_events WHERE invite_id=$1 AND kind IN ('accept-challenge','decline-challenge')", invitation.ID).Scan(&count) != nil || count != 0 {
		t.Fatal("an expired invitation produced a resolution event")
	}
	invitation = challenge(12)
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/leave"), map[string]any{}, h.people[1].cookie), http.StatusOK)
	h.join(room.ID, 1, true)
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), activityActionInput{Kind: "accept-challenge", InviteID: invitation.ID, ClientID: activityTestNonce(13)}, h.people[1].cookie), http.StatusConflict)
	if h.pool.QueryRow(h.ctx, "SELECT count(*) FROM activity_events WHERE invite_id=$1 AND kind IN ('accept-challenge','decline-challenge')", invitation.ID).Scan(&count) != nil || count != 0 {
		t.Fatal("leaving and rejoining resurrected an older invitation")
	}
}

func TestActivitiesDrinkCatalogPostgresIntegration(t *testing.T) {
	h := newActivityTestHarness(t)
	input := h.createInput(1, 3)
	input.Title, input.Category, input.VenueID = "Coffee together at Janis", "coffee", "node:6016016285"
	response := h.request(http.MethodPost, "/v1/activities", input, h.people[0].cookie)
	h.expectStatus(response, http.StatusCreated)
	room := h.room(response).Activity
	h.presence(0, input.VenueID)
	for i, item := range []string{"beer", "mocktail"} {
		h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), activityActionInput{Kind: "drink", Item: item, ClientID: activityTestNonce(2 + i)}, h.people[0].cookie), http.StatusBadRequest)
	}
	response = h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), activityActionInput{Kind: "drink", Item: "coffee", ClientID: activityTestNonce(4)}, h.people[0].cookie)
	h.expectStatus(response, http.StatusCreated)
	_, wallet := h.action(response)
	if wallet.Balance != 192 {
		t.Fatal("café coffee did not use its supported eight-credit price")
	}
	var charges int
	if h.pool.QueryRow(h.ctx, "SELECT count(*) FROM activity_credit_ledger WHERE user_id=$1 AND kind='drink'", h.people[0].user.ID).Scan(&charges) != nil || charges != 1 {
		t.Fatal("unsupported café drinks charged the wallet")
	}
	// An arbitrary mapped link, or a real venue of another category, cannot be
	// made into a bar by changing a client-supplied activity label.
	invalid := h.createInput(5, 3)
	invalid.VenueID = "node:6016016285"
	h.expectStatus(h.request(http.MethodPost, "/v1/activities", invalid, h.people[0].cookie), http.StatusBadRequest)
	invalid.VenueID, invalid.ClientID = "https://maps.example.test/unknown", activityTestNonce(6)
	h.expectStatus(h.request(http.MethodPost, "/v1/activities", invalid, h.people[0].cookie), http.StatusBadRequest)
}

func TestActivitiesActiveAccountFilteringPostgresIntegration(t *testing.T) {
	h := newActivityTestHarness(t)
	room := h.create(1, 3).Activity
	h.join(room.ID, 1, false)
	h.presence(0, "node:1802158801")
	h.presence(1, "node:1802158801")
	message := map[string]string{"body": "A participant's protected room message", "clientId": activityTestNonce(2)}
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/messages"), message, h.people[1].cookie), http.StatusCreated)
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), activityActionInput{Kind: "wave", ClientID: activityTestNonce(3)}, h.people[1].cookie), http.StatusCreated)
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), activityActionInput{Kind: "compliment", TargetID: h.people[1].user.ID, ClientID: activityTestNonce(4)}, h.people[0].cookie), http.StatusCreated)
	if _, err := h.pool.Exec(h.ctx, "UPDATE users SET account_status='suspended' WHERE id=$1", h.people[1].user.ID); err != nil {
		t.Fatal("could not suspend isolated member fixture")
	}
	view := h.request(http.MethodGet, activityTestPath(room.ID, ""), nil, h.people[0].cookie)
	h.expectStatus(view, http.StatusOK)
	current := h.room(view).Activity
	if current.MemberCount != 1 || len(current.Members) != 1 || len(current.Messages) != 0 || len(current.Events) != 0 || strings.Contains(view.Body.String(), h.people[1].user.Handle) {
		t.Fatal("inactive member identity or authored/targeted content remained in the member room")
	}
	h.expectStatus(h.request(http.MethodGet, activityTestPath(room.ID, ""), nil, h.people[1].cookie), http.StatusUnauthorized)
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/actions"), activityActionInput{Kind: "wave", TargetID: h.people[1].user.ID, ClientID: activityTestNonce(5)}, h.people[0].cookie), http.StatusForbidden)
	h.join(room.ID, 2, false)
	if _, err := h.pool.Exec(h.ctx, "UPDATE users SET account_status='suspended' WHERE id=$1", h.people[0].user.ID); err != nil {
		t.Fatal("could not suspend isolated host fixture")
	}
	listed := h.request(http.MethodGet, "/v1/activities", nil, h.people[2].cookie)
	h.expectStatus(listed, http.StatusOK)
	var result struct {
		Activities []activitySummary `json:"activities"`
	}
	if json.Unmarshal(listed.Body.Bytes(), &result) != nil || len(result.Activities) != 0 {
		t.Fatal("inactive host's activity remained in discovery")
	}
	h.expectStatus(h.request(http.MethodGet, activityTestPath(room.ID, ""), nil, h.people[2].cookie), http.StatusNotFound)
}

func TestActivitiesReactivatedMemberCannotResurrectCapacityPostgresIntegration(t *testing.T) {
	h := newActivityTestHarness(t)
	room := h.create(1, 2).Activity
	h.join(room.ID, 1, true)
	if _, err := h.pool.Exec(h.ctx, "UPDATE users SET account_status='suspended' WHERE id=$1", h.people[1].user.ID); err != nil {
		t.Fatal("could not suspend isolated capacity fixture")
	}
	joined := h.join(room.ID, 2, false)
	if joined.Activity.MemberCount != 2 || len(joined.Activity.Members) != 2 {
		t.Fatal("inactive member's released seat did not admit the new participant")
	}
	if _, err := h.pool.Exec(h.ctx, "UPDATE users SET account_status='active' WHERE id=$1", h.people[1].user.ID); err != nil {
		t.Fatal("could not reactivate isolated capacity fixture")
	}
	h.expectStatus(h.request(http.MethodGet, activityTestPath(room.ID, ""), nil, h.people[1].cookie), http.StatusForbidden)
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/join"), map[string]bool{"socialOptIn": true}, h.people[1].cookie), http.StatusConflict)
	view := h.request(http.MethodGet, activityTestPath(room.ID, ""), nil, h.people[0].cookie)
	h.expectStatus(view, http.StatusOK)
	if current := h.room(view).Activity; current.MemberCount != 2 || len(current.Members) != 2 {
		t.Fatal("reactivation resurrected a third participant beyond the two-seat capacity")
	}
	h.expectStatus(h.request(http.MethodPost, activityTestPath(room.ID, "/leave"), map[string]any{}, h.people[2].cookie), http.StatusOK)
	rejoined := h.join(room.ID, 1, false)
	if rejoined.Activity.MemberCount != 2 {
		t.Fatal("reactivated member could not explicitly join a newly available seat")
	}
	for _, member := range rejoined.Activity.Members {
		if member.ID == h.people[1].user.ID && member.SocialOptIn {
			t.Fatal("reactivation restored an older social opt-in without explicit consent")
		}
	}
}
