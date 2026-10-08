package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func TestActivityCatalogMatchesPlayableCanonicalSnapshot(t *testing.T) {
	data, err := os.ReadFile("../../apps/web/public/data/lisbon-venues.json")
	if err != nil {
		t.Fatal(err)
	}
	var snapshot struct {
		Venues []struct {
			ID, Name, Category string
			Point              [2]float64
		} `json:"venues"`
	}
	if err = json.Unmarshal(data, &snapshot); err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, venue := range activityVenues {
		matched := false
		for _, source := range snapshot.Venues {
			if venue.ID == source.ID && venue.Name == source.Name && venue.Category == source.Category && venue.Longitude == source.Point[0] && venue.Latitude == source.Point[1] {
				matched = true
				break
			}
		}
		if !matched {
			t.Fatalf("activity venue %q is not the map's exact canonical place", venue.ID)
		}
		if !validChatRoom("lisbon:hotspot:" + venue.ID) {
			t.Fatalf("venue %q cannot publish map presence", venue.ID)
		}
		seen[venue.Category] = true
	}
	for _, category := range []string{"bar", "cafe", "beach", "culture", "gym"} {
		if !seen[category] {
			t.Errorf("missing supported activity venue category %q", category)
		}
	}
}

func activityTestCreate() activityCreateInput {
	return activityCreateInput{Title: "  Café & conversa ☕  ", Category: "coffee", TravellerType: "everyone", VenueID: "node:6016016285", StartsAt: "2026-10-08T12:00:00.125+00:00", Capacity: 4, ClientID: "A1234567-1234-1234-1234-123456789ABC"}
}

func TestActivityCreationNormalizesIdempotentPayloadAndBounds(t *testing.T) {
	input, err := normalizeActivityCreate(activityTestCreate())
	if err != nil {
		t.Fatal(err)
	}
	if input.Title != "Café & conversa ☕" || input.ClientID != "a1234567-1234-1234-1234-123456789abc" || input.StartsAt != "2026-10-08T12:00:00.125Z" {
		t.Fatalf("invalid canonical payload: %+v", input)
	}
	second := input
	second.Title = "  " + input.Title + " "
	second, err = normalizeActivityCreate(second)
	if err != nil || activityPayload(second) != activityPayload(input) {
		t.Fatal("equivalent retry did not retain its canonical payload")
	}
	now, _ := time.Parse(time.RFC3339Nano, input.StartsAt)
	for _, delta := range []time.Duration{-time.Minute, 0, time.Minute, 30 * 24 * time.Hour} {
		copy := input
		copy.StartsAt = now.Add(delta).Format(time.RFC3339Nano)
		if !validActivityStart(copy, now) {
			t.Errorf("rejected valid start %s", delta)
		}
	}
	for _, delta := range []time.Duration{-time.Minute - time.Nanosecond, 30*24*time.Hour + time.Nanosecond} {
		copy := input
		copy.StartsAt = now.Add(delta).Format(time.RFC3339Nano)
		if validActivityStart(copy, now) {
			t.Errorf("accepted start outside window %s", delta)
		}
	}
	for name, change := range map[string]func(*activityCreateInput){
		"nonexistent venue":     func(v *activityCreateInput) { v.VenueID = "node:99999999999999" },
		"incompatible venue":    func(v *activityCreateInput) { v.Category = "nightlife" },
		"unknown category":      func(v *activityCreateInput) { v.Category = "payments" },
		"unvalidated traveller": func(v *activityCreateInput) { v.TravellerType = "admin" },
		"too small":             func(v *activityCreateInput) { v.Capacity = 1 },
		"too large":             func(v *activityCreateInput) { v.Capacity = 13 },
		"multiline title":       func(v *activityCreateInput) { v.Title = "Café\nconversa" },
		"short title":           func(v *activityCreateInput) { v.Title = "   x   " },
		"long title":            func(v *activityCreateInput) { v.Title = strings.Repeat("☕", 81) },
		"invalid utf8":          func(v *activityCreateInput) { v.Title = "abc\xff" },
		"non UTC":               func(v *activityCreateInput) { v.StartsAt = "2026-10-08T12:00:00+01:00" },
		"date without time":     func(v *activityCreateInput) { v.StartsAt = "2026-10-08" },
		"zero nonce":            func(v *activityCreateInput) { v.ClientID = "00000000-0000-0000-0000-000000000000" },
	} {
		t.Run(name, func(t *testing.T) {
			value := activityTestCreate()
			change(&value)
			if _, err := normalizeActivityCreate(value); err == nil {
				t.Fatal("accepted invalid creation")
			}
		})
	}
}

func TestActivityActionsRejectSpoofedOrAmbiguousFields(t *testing.T) {
	nonce := "a1234567-1234-1234-1234-123456789abc"
	peer := "b1234567-1234-1234-1234-123456789abc"
	for _, input := range []activityActionInput{
		{Kind: "drink", Item: "coffee", ClientID: nonce}, {Kind: "drink", Item: "mocktail", ClientID: nonce}, {Kind: "drink", Item: "beer", ClientID: nonce},
		{Kind: "dance", ClientID: nonce}, {Kind: "wave", TargetID: peer, ClientID: nonce}, {Kind: "compliment", TargetID: peer, ClientID: nonce},
		{Kind: "flirt", TargetID: peer, ClientID: nonce}, {Kind: "challenge", TargetID: peer, ClientID: nonce},
		{Kind: "accept-challenge", InviteID: peer, ClientID: nonce}, {Kind: "decline-challenge", InviteID: peer, ClientID: nonce},
	} {
		if _, err := normalizeActivityAction(input); err != nil {
			t.Fatalf("valid action %+v: %v", input, err)
		}
	}
	for _, input := range []activityActionInput{
		{Kind: "drink", Item: "free beer", ClientID: nonce}, {Kind: "drink", Item: "beer", TargetID: peer, ClientID: nonce},
		{Kind: "flirt", ClientID: nonce}, {Kind: "flirt", TargetID: peer, InviteID: peer, ClientID: nonce},
		{Kind: "challenge", TargetID: "somebody", ClientID: nonce}, {Kind: "accept-challenge", TargetID: peer, ClientID: nonce},
		{Kind: "decline-challenge", InviteID: peer, Item: "beer", ClientID: nonce}, {Kind: "dance", Item: "beer", ClientID: nonce},
		{Kind: "fight", TargetID: peer, ClientID: nonce}, {Kind: "wave", ClientID: ""},
	} {
		if _, err := normalizeActivityAction(input); err == nil {
			t.Fatalf("accepted invalid action %+v", input)
		}
	}
	request := httptest.NewRequest(http.MethodPost, "/v1/activities/id/actions", strings.NewReader(`{"kind":"drink","item":"beer","clientId":"`+nonce+`","price":0}`))
	var input activityActionInput
	if err := decodeJSON(request, &input); !errors.Is(err, apiError("invalid_json")) {
		t.Fatal("accepted a client-authoritative price")
	}
}

func TestActivityRoutesRequireSessionBeforeReadingInputOrDatabase(t *testing.T) {
	handler := newServer(nil, false).routes()
	id := "a1234567-1234-1234-1234-123456789abc"
	for _, route := range []struct{ method, path string }{
		{"GET", "/v1/wallet"}, {"GET", "/v1/activities"}, {"POST", "/v1/activities"}, {"GET", "/v1/activities/" + id},
		{"POST", "/v1/activities/" + id + "/join"}, {"POST", "/v1/activities/" + id + "/leave"}, {"POST", "/v1/activities/" + id + "/messages"}, {"POST", "/v1/activities/" + id + "/actions"},
	} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(route.method, route.path, strings.NewReader("malformed")))
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s returned%d", route.method, route.path, response.Code)
		}
	}
}

func TestActivityErrorsRetainContractStatuses(t *testing.T) {
	for code, want := range map[string]int{"activity_closed": 410, "activity_membership_required": 403, "activity_presence_required": 403, "social_opt_in_required": 403, "invitation_target_required": 403, "activity_full": 409, "insufficient_credits": 409, "invitation_unavailable": 409, "activity_not_found": 404, "nonce_conflict": 409, "invalid_action": 400} {
		response := httptest.NewRecorder()
		fail(response, apiError(code))
		if response.Code != want {
			t.Errorf("%s returned%d want%d", code, response.Code, want)
		}
	}
}
