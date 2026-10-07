package main

import (
	"math"
	"net/http/httptest"
	"testing"
)

func TestNormalizeRegistration(t *testing.T) {
	input, err := normalizeRegistration(registerInput{Handle: "  Visitante_1 ", Email: "TEST@example.com", Password: "uma-senha-segura", UserType: "tourist", AdultConfirmed: true})
	if err != nil {
		t.Fatal(err)
	}
	if input.Handle != "visitante_1" || input.Email != "test@example.com" {
		t.Fatalf("unexpected normalization: %#v", input)
	}
}

func TestRegistrationRejectsUnknownUserType(t *testing.T) {
	_, err := normalizeRegistration(registerInput{Handle: "pessoa", Email: "pessoa@example.com", Password: "uma-senha-segura", UserType: "visitor", AdultConfirmed: true})
	if err == nil || err.Error() != "invalid_user_type" {
		t.Fatalf("expected invalid_user_type, got %v", err)
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
	custom.OutfitStyle, custom.HairStyle, custom.SkinTone = "dress", "bun", "#5b3d30"
	if normalized, err := normalizeAppearance(custom); err != nil || normalized != custom {
		t.Fatalf("unexpected custom appearance: %#v, %v", normalized, err)
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
