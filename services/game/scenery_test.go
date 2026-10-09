package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSceneryCatalogAndInputValidation(t *testing.T) {
	base := sceneryActionInput{RequestID: "7A2BF800-0000-4000-9000-000000000001", ObjectID: "park:bench-12", Kind: "bench", ActionID: "sit"}
	input, rule, err := normalizeSceneryInput(base)
	if err != nil || input.RequestID != strings.ToLower(base.RequestID) || rule.Points != 5 || rule.FineCents != 0 {
		t.Fatal("valid bench action was not normalized")
	}
	for _, change := range []func(*sceneryActionInput){
		func(v *sceneryActionInput) { v.RequestID = "bad" },
		func(v *sceneryActionInput) { v.RequestID = "00000000-0000-0000-0000-000000000000" },
		func(v *sceneryActionInput) { v.ObjectID = "" },
		func(v *sceneryActionInput) { v.ObjectID = "tree:/../private" },
		func(v *sceneryActionInput) { v.ObjectID = strings.Repeat("a", 97) },
		func(v *sceneryActionInput) { v.ObjectID = "bench\n12" },
		func(v *sceneryActionInput) { v.Kind = "unknown" },
		func(v *sceneryActionInput) { v.ActionID = "mint-credits" },
		func(v *sceneryActionInput) { v.Kind = "tree"; v.ActionID = "pick-fruit" },
	} {
		value := base
		change(&value)
		if _, _, err := normalizeSceneryInput(value); err != apiError("invalid_scenery_action") {
			t.Fatalf("invalid scenery input accepted: %+v", value)
		}
	}
	for _, entry := range []struct {
		kind, action string
		points, fine int64
	}{
		{"tree", "identify", 5, 0}, {"tree", "climb", 2, 500}, {"tree", "pick-fruit", 2, 200},
		{"flowers", "identify", 5, 0}, {"flowers", "pick-flower", 2, 300}, {"bin", "recycle", 10, 0},
		{"fountain", "drink", 5, 0}, {"bike_rack", "check-bikes", 5, 0}, {"bus_stop", "read-timetable", 5, 0},
		{"crosswalk", "cross-safely", 5, 0}, {"lamp", "observe", 5, 0}, {"street_sign", "read-sign", 5, 0},
	} {
		value := base
		value.Kind = entry.kind
		value.ActionID = entry.action
		if entry.action == "pick-fruit" {
			value.ObjectID = "fruit-tree:lisbon-olive-1"
		}
		_, rule, err := normalizeSceneryInput(value)
		if err != nil || rule.Points != entry.points || rule.FineCents != entry.fine {
			t.Fatalf("catalog rule differs for %s/%s", entry.kind, entry.action)
		}
		if rule.FineCents > 0 && !strings.HasPrefix(rule.Description, "Simulated park fine:") {
			t.Fatal("a simulated fine was presented as a real legal charge")
		}
	}
}

func TestSceneryRejectsClientPricesAndAnonymousMutations(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/v1/player/scenery", strings.NewReader(`{"requestId":"7a2bf800-0000-4000-9000-000000000001","objectId":"bench:12","kind":"bench","actionId":"sit","points":5000}`))
	var input sceneryActionInput
	if err := decodeJSON(request, &input); err != apiError("invalid_json") {
		t.Fatal("the client supplied its own scenery reward")
	}
	handler := newServer(nil, false).routes()
	for _, endpoint := range []struct{ method, path string }{
		{http.MethodGet, "/v1/player/scenery"},
		{http.MethodPost, "/v1/player/scenery"},
		{http.MethodPost, "/v1/player/scenery/fines/7a2bf800-0000-4000-9000-000000000001/settle"},
	} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(endpoint.method, endpoint.path, nil))
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("anonymous scenery request returned %d", response.Code)
		}
	}
}
