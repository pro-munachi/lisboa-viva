package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/mail"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const sessionCookie = "lv_session"

type characterAppearance struct {
	BodyType    string `json:"bodyType"`
	OutfitStyle string `json:"outfitStyle"`
	TopColor    string `json:"topColor"`
	BottomColor string `json:"bottomColor"`
	HairStyle   string `json:"hairStyle"`
	HairColor   string `json:"hairColor"`
	SkinTone    string `json:"skinTone"`
	ShoeColor   string `json:"shoeColor"`
}

var defaultAppearance = characterAppearance{
	BodyType:    "male",
	OutfitStyle: "casual", TopColor: "#b47459", BottomColor: "#34444f",
	HairStyle: "short", HairColor: "#302823", SkinTone: "#a87955", ShoeColor: "#eee8df",
}

// Missing bodyType means the legacy male model. Explicit invalid JSON values
// must not silently receive that default. Keep nested unknown-field rejection.
func (a *characterAppearance) UnmarshalJSON(data []byte) error {
	type wireAppearance characterAppearance
	value := wireAppearance{BodyType: "male"}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return err
	}
	for key, raw := range fields {
		if !strings.EqualFold(key, "bodyType") {
			continue
		}
		var bodyType string
		if err := json.Unmarshal(raw, &bodyType); err != nil || (bodyType != "male" && bodyType != "female") {
			return apiError("invalid_appearance")
		}
	}
	*a = characterAppearance(value)
	return nil
}

type authUser struct {
	ID                    string              `json:"id"`
	Handle                string              `json:"handle"`
	Email                 string              `json:"email"`
	UserType              string              `json:"userType"`
	AccountStatus         string              `json:"accountStatus"`
	PreferredLocale       string              `json:"preferredLocale"`
	Timezone              string              `json:"timezone"`
	AdultConfirmedAt      *time.Time          `json:"adultConfirmedAt"`
	EmailVerifiedAt       *time.Time          `json:"emailVerifiedAt"`
	OnboardingCompletedAt *time.Time          `json:"onboardingCompletedAt"`
	LastLoginAt           *time.Time          `json:"lastLoginAt"`
	CreatedAt             time.Time           `json:"createdAt"`
	UpdatedAt             time.Time           `json:"updatedAt"`
	Roles                 []string            `json:"roles"`
	Appearance            characterAppearance `json:"appearance"`
}

type registerInput struct {
	Handle         string               `json:"handle"`
	Email          string               `json:"email"`
	Password       string               `json:"password"`
	UserType       string               `json:"userType"`
	HomeDistrict   string               `json:"homeDistrict"`
	AdultConfirmed bool                 `json:"adultConfirmed"`
	Appearance     *characterAppearance `json:"appearance"`
}

type loginInput struct {
	Identity string `json:"identity"`
	Password string `json:"password"`
}

type profileInput struct {
	UserType        *string `json:"userType"`
	PreferredLocale *string `json:"preferredLocale"`
}

func normalizeRegistration(input registerInput) (registerInput, error) {
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	if !validHandle(input.Handle) || !validEmail(input.Email) {
		return input, apiError("invalid_input")
	}
	if len(input.Password) < 10 || len(input.Password) > 72 {
		return input, apiError("invalid_password")
	}
	if input.UserType != "tourist" && input.UserType != "local" {
		return input, apiError("invalid_user_type")
	}
	if input.HomeDistrict == "" {
		input.HomeDistrict = "Graça"
	}
	if !validHomeDistrict(input.HomeDistrict) {
		return input, apiError("invalid_home")
	}
	if !input.AdultConfirmed {
		return input, apiError("adult_confirmation_required")
	}
	if input.Appearance == nil {
		appearance := defaultAppearance
		input.Appearance = &appearance
	}
	appearance, err := normalizeAppearance(*input.Appearance)
	if err != nil {
		return input, err
	}
	input.Appearance = &appearance
	return input, nil
}

func validHandle(value string) bool {
	count := utf8.RuneCountInString(value)
	if count < 2 || count > 40 || !utf8.ValidString(value) || strings.ContainsRune(value, '@') {
		return false
	}
	for _, r := range value {
		if unicode.IsControl(r) || unicode.Is(unicode.Cf, r) || unicode.IsSpace(r) {
			return false
		}
	}
	return true
}

func normalizeAppearance(input characterAppearance) (characterAppearance, error) {
	if input.BodyType == "" {
		input.BodyType = defaultAppearance.BodyType
	}
	allowed := func(value string, values ...string) bool {
		for _, candidate := range values {
			if value == candidate {
				return true
			}
		}
		return false
	}
	input.OutfitStyle = strings.ToLower(strings.TrimSpace(input.OutfitStyle))
	input.HairStyle = strings.ToLower(strings.TrimSpace(input.HairStyle))
	input.TopColor = strings.ToLower(strings.TrimSpace(input.TopColor))
	input.BottomColor = strings.ToLower(strings.TrimSpace(input.BottomColor))
	input.HairColor = strings.ToLower(strings.TrimSpace(input.HairColor))
	input.SkinTone = strings.ToLower(strings.TrimSpace(input.SkinTone))
	input.ShoeColor = strings.ToLower(strings.TrimSpace(input.ShoeColor))
	if !allowed(input.BodyType, "male", "female") ||
		(input.BodyType == "male" && input.OutfitStyle == "dress") ||
		!allowed(input.OutfitStyle, "casual", "jacket", "dress", "tourist") ||
		!allowed(input.HairStyle, "short", "curly", "bob", "bun") ||
		!allowed(input.TopColor, "#ece7df", "#687f73", "#b47459", "#777791", "#c19a4b") ||
		!allowed(input.BottomColor, "#34444f", "#4e504b", "#6b5147", "#30324a") ||
		!allowed(input.HairColor, "#302823", "#6a4430", "#b98452", "#171719") ||
		!allowed(input.SkinTone, "#5b3d30", "#76513b", "#a87955", "#d5af8b") ||
		!allowed(input.ShoeColor, "#eee8df", "#5c4b42", "#292d31") {
		return input, apiError("invalid_appearance")
	}
	return input, nil
}

func validEmail(value string) bool {
	if len(value) > 320 || strings.ContainsAny(value, "\r\n") {
		return false
	}
	address, err := mail.ParseAddress(value)
	return err == nil && strings.EqualFold(address.Address, value) && strings.Contains(value, "@")
}

func newToken() (string, error) {
	data := make([]byte, 32)
	if _, err := rand.Read(data); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(data), nil
}

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func isUniqueViolation(err error, constraint string) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == constraint
}

func loadUser(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, where string, arg any) (authUser, error) {
	var user authUser
	query := `SELECT u.id::text,u.handle,COALESCE(u.email,''),u.user_type::text,
		u.account_status::text,u.preferred_locale,u.timezone,u.adult_confirmed_at,
		u.email_verified_at,u.onboarding_completed_at,u.last_login_at,u.created_at,u.updated_at,
		ca.body_type,ca.outfit_style,ca.top_color,ca.bottom_color,ca.hair_style,ca.hair_color,ca.skin_tone,ca.shoe_color,
		COALESCE(array_agg(ur.role ORDER BY ur.role) FILTER (WHERE ur.role IS NOT NULL),'{}')
		FROM users u JOIN character_appearances ca ON ca.user_id=u.id
		LEFT JOIN user_roles ur ON ur.user_id=u.id WHERE ` + where + `
		GROUP BY u.id,ca.user_id`
	err := q.QueryRow(ctx, query, arg).Scan(
		&user.ID, &user.Handle, &user.Email, &user.UserType, &user.AccountStatus,
		&user.PreferredLocale, &user.Timezone, &user.AdultConfirmedAt, &user.EmailVerifiedAt,
		&user.OnboardingCompletedAt, &user.LastLoginAt, &user.CreatedAt, &user.UpdatedAt,
		&user.Appearance.BodyType, &user.Appearance.OutfitStyle, &user.Appearance.TopColor, &user.Appearance.BottomColor,
		&user.Appearance.HairStyle, &user.Appearance.HairColor, &user.Appearance.SkinTone,
		&user.Appearance.ShoeColor, &user.Roles,
	)
	return user, err
}

func hasRole(user authUser, role string) bool {
	for _, value := range user.Roles {
		if value == role {
			return true
		}
	}
	return false
}
