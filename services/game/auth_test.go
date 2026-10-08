package main

import (
	"encoding/json"
	"math"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNormalizeRegistration(t *testing.T) {
	input, err := normalizeRegistration(registerInput{Handle: "  Visitante_1 ", Email: "TEST@example.com", Password: "uma-senha-segura", UserType: "tourist", AdultConfirmed: true})
	if err != nil {
		t.Fatal(err)
	}
	if input.Handle != "Visitante_1" || input.Email != "test@example.com" {
		t.Fatalf("unexpected normalization: %#v", input)
	}
}

func TestFreeTextHandleValidation(t *testing.T) {
	for _, handle := range []string{"Inês de Lisboa", "No underscore", "Lee!", "山田 太郎"} {
		if !validHandle(handle) {
			t.Fatalf("expected printable username %q to be allowed", handle)
		}
	}
	for _, handle := range []string{"", "a", " a", "a ", "a@example.com", "line\nbreak", "zero\u200dwidth"} {
		if validHandle(handle) {
			t.Fatalf("expected username %q to be rejected", handle)
		}
	}
}

func TestRegistrationRejectsUnknownUserType(t *testing.T) {
	_, err := normalizeRegistration(registerInput{Handle: "pessoa", Email: "pessoa@example.com", Password: "uma-senha-segura", UserType: "visitor", AdultConfirmed: true})
	if err == nil || err.Error() != "invalid_user_type" {
		t.Fatalf("expected invalid_user_type, got %v", err)
	}
}

func TestRegistrationHomeDistrict(t *testing.T) {
	base := registerInput{Handle: "resident", Email: "resident@example.com", Password: "secure-password", UserType: "local", AdultConfirmed: true}
	input, err := normalizeRegistration(base)
	if err != nil || input.HomeDistrict != "Graça" {
		t.Fatalf("expected default home in Graça, got %q, %v", input.HomeDistrict, err)
	}
	base.HomeDistrict = "Alfama"
	input, err = normalizeRegistration(base)
	if err != nil || input.HomeDistrict != "Alfama" {
		t.Fatalf("expected selected home in Alfama, got %q, %v", input.HomeDistrict, err)
	}
	base.HomeDistrict = "Outside Lisbon"
	if _, err = normalizeRegistration(base); err == nil || err.Error() != "invalid_home" {
		t.Fatalf("expected invalid_home, got %v", err)
	}
}

func TestAppearanceDefaultsAndValidation(t *testing.T) {
	input, err := normalizeRegistration(registerInput{Handle: "pessoa", Email: "pessoa@example.com", Password: "uma-senha-segura", UserType: "local", AdultConfirmed: true})
	if err != nil || input.Appearance == nil || *input.Appearance != defaultAppearance {
		t.Fatalf("unexpected default appearance: %#v, %v", input.Appearance, err)
	}
	bad := defaultAppearance
	bad.TopColor = "javascript:red"
	if _, err = normalizeAppearance(bad); err == nil || err.Error() != "invalid_appearance" {
		t.Fatalf("expected invalid_appearance, got %v", err)
	}
	custom := defaultAppearance
	custom.BodyType = "female"
	custom.OutfitStyle, custom.HairStyle, custom.SkinTone = "dress", "bun", "#5b3d30"
	if normalized, err := normalizeAppearance(custom); err != nil || normalized != custom {
		t.Fatalf("unexpected custom appearance: %#v, %v", normalized, err)
	}
}

func TestAppearanceBodyTypeLegacyAndExplicitValidation(t *testing.T) {
	legacy := defaultAppearance
	legacy.BodyType = ""
	if got, err := normalizeAppearance(legacy); err != nil || got != defaultAppearance {
		t.Fatalf("legacy appearance must default male without losing choices: %#v, %v", got, err)
	}
	for _, bodyType := range []string{"other", "Female", " female ", "null"} {
		invalid := defaultAppearance
		invalid.BodyType = bodyType
		if _, err := normalizeAppearance(invalid); err != apiError("invalid_appearance") {
			t.Fatalf("unsupported body type %q accepted: %v", bodyType, err)
		}
	}
	encoded, err := json.Marshal(defaultAppearance)
	if err != nil {
		t.Fatal(err)
	}
	legacyJSON := strings.Replace(string(encoded), `"bodyType":"male",`, "", 1)
	var old characterAppearance
	if err := json.Unmarshal([]byte(legacyJSON), &old); err != nil || old != defaultAppearance {
		t.Fatalf("missing legacy JSON body type did not default: %#v, %v", old, err)
	}
	for _, key := range []string{"bodyType", "BodyType", "BODYTYPE"} {
		for _, raw := range []string{`""`, `null`, `1`, `"Female"`, `"invented"`} {
			payload := strings.Replace(string(encoded), `"bodyType":"male"`, `"`+key+`":`+raw, 1)
			if err := json.Unmarshal([]byte(payload), new(characterAppearance)); err == nil {
				t.Fatalf("explicit invalid %s %s accepted", key, raw)
			}
		}
	}
	spoofed := strings.TrimSuffix(string(encoded), "}") + `,"userId":"another-account"}`
	if err := json.Unmarshal([]byte(spoofed), new(characterAppearance)); err == nil {
		t.Fatal("custom appearance JSON decoder accepted a nested unknown field")
	}
}

func TestAppearanceBodyOutfitCompatibilityAndLegacyReads(t *testing.T) {
	for _, bodyType := range []string{"male", "female"} {
		for _, outfit := range []string{"casual", "jacket", "tourist", "dress"} {
			appearance := defaultAppearance
			appearance.BodyType, appearance.OutfitStyle = bodyType, outfit
			got, err := normalizeAppearance(appearance)
			if bodyType == "male" && outfit == "dress" {
				if err != apiError("invalid_appearance") {
					t.Fatalf("new male dress choice accepted: %v", err)
				}
				encoded, marshalErr := json.Marshal(appearance)
				var saved characterAppearance
				if marshalErr != nil || json.Unmarshal(encoded, &saved) != nil || saved != appearance {
					t.Fatal("legacy saved male dress appearance must remain readable without changing identity")
				}
				_, registrationErr := normalizeRegistration(registerInput{Handle: "legacy_dress", Email: "legacy-dress@example.test", Password: "registration-password", UserType: "tourist", AdultConfirmed: true, Appearance: &appearance})
				if registrationErr != apiError("invalid_appearance") {
					t.Fatal("registration must reject incompatible model/outfit choices")
				}
			} else if err != nil || got != appearance {
				t.Fatalf("supported %s/%s choice rejected or changed: %#v, %v", bodyType, outfit, got, err)
			}
		}
	}
}

func TestTokensAreOpaqueAndHashStable(t *testing.T) {
	one, err := newToken()
	if err != nil {
		t.Fatal(err)
	}
	two, err := newToken()
	if err != nil {
		t.Fatal(err)
	}
	if one == two || len(one) < 40 || tokenHash(one) != tokenHash(one) || tokenHash(one) == tokenHash(two) {
		t.Fatal("session token properties failed")
	}
}

func TestNormalizePresenceAcceptsLisbonAndRejectsUnsafeValues(t *testing.T) {
	valid, err := normalizePresence(presenceInput{Latitude: 38.7061, Longitude: -9.1459, Area: "  Cais do Sodré  "})
	if err != nil || valid.Area != "Cais do Sodré" {
		t.Fatalf("unexpected valid presence: %#v, %v", valid, err)
	}
	for _, input := range []presenceInput{
		{Latitude: 0, Longitude: 0, Area: "Lisbon"},
		{Latitude: math.NaN(), Longitude: -9.1459, Area: "Lisbon"},
		{Latitude: 38.7061, Longitude: -9.1459, Area: ""},
		{Latitude: 38.7061, Longitude: -9.1459, Area: "Cais\nInjected"},
	} {
		if _, err = normalizePresence(input); err == nil || err.Error() != "invalid_presence" {
			t.Fatalf("expected invalid_presence for %#v, got %v", input, err)
		}
	}
}

func TestPresenceQueryBoundsRadius(t *testing.T) {
	request := httptest.NewRequest("GET", "/?latitude=38.7061&longitude=-9.1459&radius=5000", nil)
	lat, lng, radius, err := presenceQuery(request)
	if err != nil || lat != 38.7061 || lng != -9.1459 || radius != 5000 {
		t.Fatalf("unexpected query values: %v %v %v %v", lat, lng, radius, err)
	}
	request = httptest.NewRequest("GET", "/?latitude=38.7061&longitude=-9.1459&radius=99999", nil)
	if _, _, _, err = presenceQuery(request); err == nil || err.Error() != "invalid_presence" {
		t.Fatalf("expected bounded radius, got %v", err)
	}
}

func TestPresencePlaceAcceptsOnlyCanonicalPublicHotspots(t *testing.T) {
	for _, id := range []string{"", "comercio", "node:11341409242", "cais-station"} {
		input, err := normalizePresence(presenceInput{Latitude: 38.7061, Longitude: -9.1459, Area: "Cais do Sodré", PlaceID: id})
		if err != nil || input.PlaceID != id {
			t.Fatalf("canonical public place %q rejected: %v", id, err)
		}
	}
	for _, id := range []string{"home", "lisbon:city", "lisbon:hotspot:comercio", "private-room", "comercio ", "COMERCIO", "node:unknown", strings.Repeat("x", 146), "direct:" + directTestPeer} {
		if _, err := normalizePresence(presenceInput{Latitude: 38.7061, Longitude: -9.1459, Area: "Cais do Sodré", PlaceID: id}); err != apiError("invalid_presence") {
			t.Fatalf("private, unknown, or noncanonical place %q was accepted: %v", id, err)
		}
	}
}
