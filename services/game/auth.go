package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/mail"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const sessionCookie = "lv_session"

var handlePattern = regexp.MustCompile(`^[a-z0-9_]{3,24}$`)

type authUser struct {
	ID                    string     `json:"id"`
	Handle                string     `json:"handle"`
	Email                 string     `json:"email"`
	UserType              string     `json:"userType"`
	AccountStatus         string     `json:"accountStatus"`
	PreferredLocale       string     `json:"preferredLocale"`
	Timezone              string     `json:"timezone"`
	AdultConfirmedAt      *time.Time `json:"adultConfirmedAt"`
	EmailVerifiedAt       *time.Time `json:"emailVerifiedAt"`
	OnboardingCompletedAt *time.Time `json:"onboardingCompletedAt"`
	LastLoginAt           *time.Time `json:"lastLoginAt"`
	CreatedAt             time.Time  `json:"createdAt"`
	UpdatedAt             time.Time  `json:"updatedAt"`
	Roles                 []string   `json:"roles"`
}

type registerInput struct {
	Handle         string `json:"handle"`
	Email          string `json:"email"`
	Password       string `json:"password"`
	UserType       string `json:"userType"`
	AdultConfirmed bool   `json:"adultConfirmed"`
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
	input.Handle = strings.ToLower(strings.TrimSpace(input.Handle))
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	if !handlePattern.MatchString(input.Handle) || !validEmail(input.Email) {
		return input, apiError("invalid_input")
	}
	if len(input.Password) < 10 || len(input.Password) > 72 {
		return input, apiError("invalid_password")
	}
	if input.UserType != "tourist" && input.UserType != "local" {
		return input, apiError("invalid_user_type")
	}
	if !input.AdultConfirmed {
		return input, apiError("adult_confirmation_required")
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
		COALESCE(array_agg(ur.role ORDER BY ur.role) FILTER (WHERE ur.role IS NOT NULL),'{}')
		FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id WHERE ` + where + `
		GROUP BY u.id`
	err := q.QueryRow(ctx, query, arg).Scan(
		&user.ID, &user.Handle, &user.Email, &user.UserType, &user.AccountStatus,
		&user.PreferredLocale, &user.Timezone, &user.AdultConfirmedAt, &user.EmailVerifiedAt,
		&user.OnboardingCompletedAt, &user.LastLoginAt, &user.CreatedAt, &user.UpdatedAt, &user.Roles,
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
