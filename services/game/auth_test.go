package main

import "testing"

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
