package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// The shared helper requires an explicit loopback URL, migrates a random schema
// and confirms its removal. These checks never touch real application accounts.
func TestPresenceAppearancePostgresLoopbackIntegration(t *testing.T) {
	ctx, pool := isolatedChatPool(t)
	s := newServer(pool, false)
	now := time.Now().UTC()
	s.now = func() time.Time { return now }
	handler := s.routes()
	request := func(method, path string, body any, cookie *http.Cookie) *httptest.ResponseRecorder {
		var payload string
		if raw, ok := body.(string); ok {
			payload = raw
		} else if body != nil {
			encoded, err := json.Marshal(body)
			if err != nil {
				t.Fatal("could not encode presence integration request")
			}
			payload = string(encoded)
		}
		r := httptest.NewRequest(method, path, strings.NewReader(payload)).WithContext(ctx)
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
			t.Fatalf("presence/appearance endpoint returned %d, want %d", response.Code, want)
		}
	}
	userFrom := func(response *httptest.ResponseRecorder) authUser {
		t.Helper()
		var user authUser
		if json.Unmarshal(response.Body.Bytes(), &user) != nil || user.ID == "" {
			t.Fatal("invalid presence integration account response")
		}
		return user
	}
	register := func(handle string, appearance *characterAppearance) (authUser, *http.Cookie) {
		t.Helper()
		response := request(http.MethodPost, "/v1/auth/register", registerInput{
			Handle: handle, Email: handle + "@example.test", Password: "presence-integration-password",
			UserType: "tourist", AdultConfirmed: true, Appearance: appearance,
		}, nil)
		status(response, http.StatusCreated)
		for _, cookie := range response.Result().Cookies() {
			if cookie.Name == sessionCookie && cookie.HttpOnly && cookie.Value != "" {
				return userFrom(response), cookie
			}
		}
		t.Fatal("registered presence account did not receive a session")
		return authUser{}, nil
	}
	custom := defaultAppearance
	custom.BodyType = "female"
	custom.OutfitStyle, custom.HairStyle, custom.SkinTone = "dress", "bun", "#5b3d30"
	userA, cookieA := register("presence_first", nil)
	userB, cookieB := register("presence_second", &custom)
	if userA.Appearance != defaultAppearance || userB.Appearance != custom {
		t.Fatal("registration lost default or selected appearance")
	}
	var migrationCount int
	if pool.QueryRow(ctx, `SELECT count(*) FROM schema_migrations
		WHERE name IN ('004_chat.sql','004_player_presence.sql')`).Scan(&migrationCount) != nil || migrationCount != 2 {
		t.Fatal("both complete 004 migration filenames must remain registered")
	}
	if pool.QueryRow(ctx, `SELECT count(*) FROM schema_migrations WHERE name='007_presence_place.sql'`).Scan(&migrationCount) != nil || migrationCount != 1 {
		t.Fatal("the optional public presence place migration must be applied exactly once")
	}
	nearbyPath := "/v1/multiplayer/nearby?latitude=38.7061&longitude=-9.1459&radius=1000"
	for _, route := range []struct{ method, path string }{
		{http.MethodPatch, "/v1/auth/appearance"},
		{http.MethodPut, "/v1/multiplayer/presence"},
		{http.MethodDelete, "/v1/multiplayer/presence"},
		{http.MethodGet, nearbyPath},
	} {
		status(request(route.method, route.path, nil, nil), http.StatusUnauthorized)
	}
	updatedAppearance := defaultAppearance
	updatedAppearance.BodyType = "female"
	updatedAppearance.OutfitStyle, updatedAppearance.TopColor, updatedAppearance.HairStyle = "jacket", "#c19a4b", "curly"
	updated := request(http.MethodPatch, "/v1/auth/appearance", updatedAppearance, cookieA)
	status(updated, http.StatusOK)
	if userFrom(updated).ID != userA.ID || userFrom(updated).Appearance != updatedAppearance {
		t.Fatal("appearance update did not use the authenticated account")
	}
	if userFrom(request(http.MethodGet, "/v1/auth/me", nil, cookieA)).Appearance != updatedAppearance ||
		userFrom(request(http.MethodGet, "/v1/auth/me", nil, cookieB)).Appearance != custom {
		t.Fatal("appearance update was not persisted or modified another account")
	}
	invalid := updatedAppearance
	invalid.TopColor = "javascript:red"
	status(request(http.MethodPatch, "/v1/auth/appearance", invalid, cookieA), http.StatusBadRequest)
	incompatible := updatedAppearance
	incompatible.BodyType, incompatible.OutfitStyle = "male", "dress"
	status(request(http.MethodPatch, "/v1/auth/appearance", incompatible, cookieA), http.StatusBadRequest)
	if userFrom(request(http.MethodGet, "/v1/auth/me", nil, cookieA)).Appearance != updatedAppearance {
		t.Fatal("incompatible male dress update changed the saved appearance")
	}
	for _, raw := range []string{`""`, `null`, `1`, `"other"`, `"Female"`} {
		encoded, err := json.Marshal(updatedAppearance)
		if err != nil {
			t.Fatal(err)
		}
		invalidBody := strings.Replace(string(encoded), `"bodyType":"female"`, `"bodyType":`+raw, 1)
		status(request(http.MethodPatch, "/v1/auth/appearance", invalidBody, cookieA), http.StatusBadRequest)
		if userFrom(request(http.MethodGet, "/v1/auth/me", nil, cookieA)).Appearance != updatedAppearance {
			t.Fatal("invalid body type changed the saved appearance")
		}
	}
	status(request(http.MethodPatch, "/v1/auth/appearance", `{"userId":"spoofed"}`, cookieA), http.StatusBadRequest)
	status(request(http.MethodPatch, "/v1/auth/appearance", strings.Repeat(" ", 16<<10)+"{}", cookieA), http.StatusRequestEntityTooLarge)
	status(request(http.MethodPut, "/v1/multiplayer/presence", strings.Repeat(" ", 16<<10)+"{}", cookieA), http.StatusRequestEntityTooLarge)
	status(request(http.MethodPut, "/v1/multiplayer/presence", `{"latitude":38.7061,"longitude":-9.1459,"area":"Cais","userId":"spoofed"}`, cookieA), http.StatusBadRequest)

	locationA := presenceInput{Latitude: 38.7061, Longitude: -9.1459, Area: "Cais do Sodré"}
	locationB := presenceInput{Latitude: 38.7062, Longitude: -9.1458, Area: "Cais do Sodré"}
	status(request(http.MethodPut, "/v1/multiplayer/presence", locationA, cookieA), http.StatusOK)
	status(request(http.MethodPut, "/v1/multiplayer/presence", locationB, cookieB), http.StatusOK)
	nearby := func(cookie *http.Cookie) []nearbyPlayer {
		t.Helper()
		response := request(http.MethodGet, nearbyPath, nil, cookie)
		status(response, http.StatusOK)
		var result struct {
			Players []nearbyPlayer `json:"players"`
		}
		if json.Unmarshal(response.Body.Bytes(), &result) != nil || result.Players == nil {
			t.Fatal("nearby response must contain a players array")
		}
		for _, private := range []string{`"email"`, `"roles"`, `"token"`, `"accountStatus"`} {
			if strings.Contains(response.Body.String(), private) {
				t.Fatal("nearby response exposed private account fields")
			}
		}
		return result.Players
	}
	players := nearby(cookieA)
	if len(players) != 1 || players[0].ID != userB.ID || players[0].Appearance != custom || players[0].DistanceMetres <= 0 || players[0].PlaceID != "" {
		t.Fatal("nearby presence did not expose the other active player and their saved appearance")
	}
	players = nearby(cookieB)
	if len(players) != 1 || players[0].ID != userA.ID || players[0].Appearance != updatedAppearance {
		t.Fatal("nearby presence did not exclude self or use persisted appearance")
	}
	// Exact public venue IDs are supplied only when the frontend is visiting a
	// venue. The service returns that ID, never a client-invented display name.
	locationB.PlaceID = "node:11341409242"
	status(request(http.MethodPut, "/v1/multiplayer/presence", locationB, cookieB), http.StatusOK)
	if players := nearby(cookieA); len(players) != 1 || players[0].PlaceID != locationB.PlaceID {
		t.Fatal("nearby player did not retain its canonical public venue")
	}
	locationB.PlaceID = "maat"
	status(request(http.MethodPut, "/v1/multiplayer/presence", locationB, cookieB), http.StatusOK)
	if players := nearby(cookieA); len(players) != 1 || players[0].PlaceID != "maat" {
		t.Fatal("moving to another public venue did not replace the old place")
	}
	for _, invalidID := range []string{"home", "private-room", "lisbon:hotspot:comercio", "node:unknown", "comercio "} {
		invalidLocation := locationB
		invalidLocation.PlaceID = invalidID
		status(request(http.MethodPut, "/v1/multiplayer/presence", invalidLocation, cookieB), http.StatusBadRequest)
		if players := nearby(cookieA); len(players) != 1 || players[0].PlaceID != "maat" {
			t.Fatal("a rejected private/unknown venue changed the persisted public place")
		}
	}
	status(request(http.MethodPut, "/v1/multiplayer/presence", `{"latitude":38.7062,"longitude":-9.1458,"area":"Cais","placeId":"maat","placeName":"My private home"}`, cookieB), http.StatusBadRequest)
	status(request(http.MethodPut, "/v1/multiplayer/presence", `{"latitude":38.7062,"longitude":-9.1458,"area":"Cais","placeId":""}`, cookieB), http.StatusOK)
	var placeIsNull bool
	if pool.QueryRow(ctx, "SELECT place_id IS NULL FROM player_presence WHERE user_id=$1", userB.ID).Scan(&placeIsNull) != nil || !placeIsNull {
		t.Fatal("explicitly leaving a venue did not clear place_id to NULL")
	}
	if players := nearby(cookieA); len(players) != 1 || players[0].PlaceID != "" {
		t.Fatal("outdoor nearby presence retained its former public venue")
	}
	status(request(http.MethodPut, "/v1/multiplayer/presence", locationB, cookieB), http.StatusOK)
	locationB.PlaceID = ""
	status(request(http.MethodPut, "/v1/multiplayer/presence", locationB, cookieB), http.StatusOK)
	if pool.QueryRow(ctx, "SELECT place_id IS NULL FROM player_presence WHERE user_id=$1", userB.ID).Scan(&placeIsNull) != nil || !placeIsNull {
		t.Fatal("an omitted placeId did not clear prior indoor presence")
	}
	// Peers in one public venue share the same canonical identity. They remain
	// bounded by the existing nearby radius and expiration, rather than names.
	locationA.PlaceID, locationB.PlaceID = "comercio", "comercio"
	status(request(http.MethodPut, "/v1/multiplayer/presence", locationA, cookieA), http.StatusOK)
	status(request(http.MethodPut, "/v1/multiplayer/presence", locationB, cookieB), http.StatusOK)
	if players := nearby(cookieA); len(players) != 1 || players[0].PlaceID != "comercio" {
		t.Fatal("same public venue peer was missing from nearby presence")
	}
	// The account loader now joins appearances; chat must still resolve identities.
	status(request(http.MethodPost, "/v1/chat/messages", chatInput{Room: "lisbon:city", Body: "Olá from the merged city", ClientID: testChatNonce}, cookieA), http.StatusCreated)
	status(request(http.MethodGet, "/v1/chat/messages?room=lisbon:city", nil, cookieB), http.StatusOK)

	now = now.Add(presenceTTL + time.Second)
	if len(nearby(cookieA)) != 0 {
		t.Fatal("expired presence remained visible")
	}
	status(request(http.MethodPut, "/v1/multiplayer/presence", locationA, cookieA), http.StatusOK)
	status(request(http.MethodPut, "/v1/multiplayer/presence", locationB, cookieB), http.StatusOK)
	status(request(http.MethodDelete, "/v1/multiplayer/presence", nil, cookieB), http.StatusOK)
	if len(nearby(cookieA)) != 0 {
		t.Fatal("hidden player remained visible")
	}
	status(request(http.MethodPut, "/v1/multiplayer/presence", locationB, cookieB), http.StatusOK)
	if _, err := pool.Exec(ctx, "UPDATE users SET account_status='suspended' WHERE id=$1", userB.ID); err != nil {
		t.Fatal("could not suspend isolated presence account")
	}
	if len(nearby(cookieA)) != 0 {
		t.Fatal("suspended player remained visible")
	}
	status(request(http.MethodPut, "/v1/multiplayer/presence", locationB, cookieB), http.StatusUnauthorized)
	if _, err := pool.Exec(ctx, "UPDATE users SET account_status='active' WHERE id=$1", userB.ID); err != nil {
		t.Fatal("could not restore isolated presence account")
	}

	// Simulate a database revocation error after presence removal. Logout must
	// roll back both deletions and keep the browser cookie available for retry.
	if _, err := pool.Exec(ctx, `CREATE FUNCTION reject_test_revocation() RETURNS trigger
		LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated test revocation failure'; END $$;
		CREATE TRIGGER reject_test_revocation BEFORE DELETE ON sessions
		FOR EACH ROW EXECUTE FUNCTION reject_test_revocation()`); err != nil {
		t.Fatal("could not install isolated revocation failure fixture")
	}
	failedLogout := request(http.MethodPost, "/v1/auth/logout", nil, cookieA)
	status(failedLogout, http.StatusInternalServerError)
	if len(failedLogout.Result().Cookies()) != 0 {
		t.Fatal("failed logout cleared the browser session cookie")
	}
	var presences, sessions int
	if pool.QueryRow(ctx, "SELECT count(*) FROM player_presence WHERE user_id=$1", userA.ID).Scan(&presences) != nil ||
		pool.QueryRow(ctx, "SELECT count(*) FROM sessions WHERE token_hash=$1", tokenHash(cookieA.Value)).Scan(&sessions) != nil || presences != 1 || sessions != 1 {
		t.Fatal("failed logout did not roll back presence and session changes")
	}
	if _, err := pool.Exec(ctx, "DROP TRIGGER reject_test_revocation ON sessions; DROP FUNCTION reject_test_revocation()"); err != nil {
		t.Fatal("could not remove isolated revocation failure fixture")
	}
	logout := request(http.MethodPost, "/v1/auth/logout", nil, cookieA)
	status(logout, http.StatusOK)
	cookies := logout.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Value != "" || cookies[0].MaxAge >= 0 {
		t.Fatal("successful logout did not clear the browser session cookie")
	}
	if pool.QueryRow(ctx, "SELECT count(*) FROM player_presence WHERE user_id=$1", userA.ID).Scan(&presences) != nil ||
		pool.QueryRow(ctx, "SELECT count(*) FROM sessions WHERE token_hash=$1", tokenHash(cookieA.Value)).Scan(&sessions) != nil || presences != 0 || sessions != 0 {
		t.Fatal("successful logout did not remove presence and revoke its session")
	}
	status(request(http.MethodGet, "/v1/auth/me", nil, cookieA), http.StatusUnauthorized)
	if len(nearby(cookieB)) != 0 {
		t.Fatal("logged-out player remained visible")
	}
}
