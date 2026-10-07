package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type apiError string

func (e apiError) Error() string { return string(e) }

type server struct {
	db     *pgxpool.Pool
	now    func() time.Time
	secure bool
	rates  struct {
		sync.Mutex
		attempts map[string][]time.Time
	}
}

type userContextKey struct{}

func newServer(db *pgxpool.Pool, secure bool) *server {
	s := &server{db: db, now: func() time.Time { return time.Now().UTC() }, secure: secure}
	s.rates.attempts = make(map[string][]time.Time)
	return s
}

func (s *server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/health", s.health)
	mux.HandleFunc("POST /v1/auth/register", s.register)
	mux.HandleFunc("POST /v1/auth/login", s.login)
	mux.HandleFunc("POST /v1/auth/logout", s.logout)
	mux.Handle("GET /v1/auth/me", s.requireSession(http.HandlerFunc(s.me)))
	mux.Handle("PATCH /v1/auth/me", s.requireSession(http.HandlerFunc(s.updateMe)))
	mux.Handle("PATCH /v1/auth/appearance", s.requireSession(http.HandlerFunc(s.updateAppearance)))
	mux.Handle("PUT /v1/multiplayer/presence", s.requireSession(http.HandlerFunc(s.updatePresence)))
	mux.Handle("DELETE /v1/multiplayer/presence", s.requireSession(http.HandlerFunc(s.clearPresence)))
	mux.Handle("GET /v1/multiplayer/nearby", s.requireSession(http.HandlerFunc(s.nearbyPlayers)))
	mux.Handle("GET /v1/admin/users", s.requireRole("admin", http.HandlerFunc(s.adminUsers)))
	s.registerChatRoutes(mux)
	return s.headers(mux)
}

func (s *server) headers(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		next.ServeHTTP(w, r)
	})
}

func decodeJSON(r *http.Request, target any) error {
	defer r.Body.Close()
	data, err := io.ReadAll(io.LimitReader(r.Body, (16<<10)+1))
	if err != nil {
		return apiError("invalid_json")
	}
	if len(data) > 16<<10 {
		return apiError("payload_too_large")
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return apiError("invalid_json")
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return apiError("invalid_json")
	}
	return nil
}

func respond(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func fail(w http.ResponseWriter, err error) {
	code, status := "server_error", http.StatusInternalServerError
	var known apiError
	if errors.As(err, &known) {
		code = known.Error()
		status = map[string]int{
			"invalid_json": http.StatusBadRequest, "invalid_input": http.StatusBadRequest,
			"invalid_password": http.StatusBadRequest, "invalid_user_type": http.StatusBadRequest,
			"adult_confirmation_required": http.StatusBadRequest,
			"invalid_locale":              http.StatusBadRequest, "handle_taken": http.StatusConflict,
			"email_taken": http.StatusConflict, "credentials": http.StatusUnauthorized,
			"session_expired": http.StatusUnauthorized, "forbidden": http.StatusForbidden,
			"invalid_presence":       http.StatusBadRequest,
			"invalid_appearance":     http.StatusBadRequest,
			"chat_presence_required": http.StatusForbidden,
			"rate_limited":           http.StatusTooManyRequests,
			"payload_too_large":      http.StatusRequestEntityTooLarge,
			"nonce_conflict":         http.StatusConflict,
		}[code]
	}
	if status == 0 {
		status = http.StatusBadRequest
	}
	if code == "server_error" {
		slog.Error("request failed", "error", err)
	}
	respond(w, status, map[string]string{"error": code})
}

func (s *server) allowed(key string, limit int) bool {
	s.rates.Lock()
	defer s.rates.Unlock()
	now := s.now()
	valid := s.rates.attempts[key][:0]
	for _, attempted := range s.rates.attempts[key] {
		if now.Sub(attempted) < time.Minute {
			valid = append(valid, attempted)
		}
	}
	if len(valid) >= limit {
		s.rates.attempts[key] = valid
		return false
	}
	s.rates.attempts[key] = append(valid, now)
	return true
}

func (s *server) health(w http.ResponseWriter, r *http.Request) {
	if err := s.db.Ping(r.Context()); err != nil {
		respond(w, http.StatusServiceUnavailable, map[string]bool{"ok": false})
		return
	}
	respond(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *server) register(w http.ResponseWriter, r *http.Request) {
	if !s.allowed(clientIP(r)+":register", 10) {
		fail(w, apiError("rate_limited"))
		return
	}
	var input registerInput
	if err := decodeJSON(r, &input); err != nil {
		fail(w, err)
		return
	}
	input, err := normalizeRegistration(input)
	if err != nil {
		fail(w, err)
		return
	}
	password, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		fail(w, err)
		return
	}
	token, err := newToken()
	if err != nil {
		fail(w, err)
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var id string
	err = tx.QueryRow(r.Context(), `INSERT INTO users(handle,email,user_type,adult_confirmed_at)
		VALUES($1,$2,$3,$4) RETURNING id::text`, input.Handle, input.Email, input.UserType, s.now()).Scan(&id)
	if isUniqueViolation(err, "users_handle_unique") {
		fail(w, apiError("handle_taken"))
		return
	}
	if isUniqueViolation(err, "users_email_unique") {
		fail(w, apiError("email_taken"))
		return
	}
	if err != nil {
		fail(w, err)
		return
	}
	if _, err = tx.Exec(r.Context(), "INSERT INTO password_credentials(user_id,password_hash) VALUES($1,$2)", id, string(password)); err == nil {
		_, err = tx.Exec(r.Context(), "INSERT INTO user_roles(user_id,role) VALUES($1,'player')", id)
	}
	if err == nil {
		a := input.Appearance
		_, err = tx.Exec(r.Context(), `INSERT INTO character_appearances
			(user_id,outfit_style,top_color,bottom_color,hair_style,hair_color,skin_tone,shoe_color)
			VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, id, a.OutfitStyle, a.TopColor, a.BottomColor,
			a.HairStyle, a.HairColor, a.SkinTone, a.ShoeColor)
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `INSERT INTO sessions(user_id,token_hash,expires_at)
			VALUES($1,$2,$3)`, id, tokenHash(token), s.now().Add(7*24*time.Hour))
	}
	if err != nil {
		fail(w, err)
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		fail(w, err)
		return
	}
	s.setSessionCookie(w, token)
	user, err := loadUser(r.Context(), s.db, "u.id=$1", id)
	if err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusCreated, user)
}

func (s *server) login(w http.ResponseWriter, r *http.Request) {
	if !s.allowed(clientIP(r)+":login", 15) {
		fail(w, apiError("rate_limited"))
		return
	}
	var input loginInput
	if err := decodeJSON(r, &input); err != nil {
		fail(w, err)
		return
	}
	input.Identity = strings.ToLower(strings.TrimSpace(input.Identity))
	if input.Identity == "" || len(input.Password) < 1 || len(input.Password) > 72 {
		fail(w, apiError("credentials"))
		return
	}
	var id, passwordHash string
	err := s.db.QueryRow(r.Context(), `SELECT u.id::text,p.password_hash FROM users u
		JOIN password_credentials p ON p.user_id=u.id
		WHERE (u.handle=$1 OR lower(u.email)=$1) AND u.account_status='active'`, input.Identity).Scan(&id, &passwordHash)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		fail(w, err)
		return
	}
	if err != nil || bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(input.Password)) != nil {
		fail(w, apiError("credentials"))
		return
	}
	token, err := newToken()
	if err == nil {
		_, err = s.db.Exec(r.Context(), `INSERT INTO sessions(user_id,token_hash,expires_at)
			VALUES($1,$2,$3)`, id, tokenHash(token), s.now().Add(7*24*time.Hour))
	}
	if err == nil {
		_, err = s.db.Exec(r.Context(), "UPDATE users SET last_login_at=$2 WHERE id=$1", id, s.now())
	}
	if err != nil {
		fail(w, err)
		return
	}
	s.setSessionCookie(w, token)
	user, err := loadUser(r.Context(), s.db, "u.id=$1", id)
	if err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusOK, user)
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

func (s *server) logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookie); err == nil {
		tx, err := s.db.Begin(r.Context())
		if err != nil {
			fail(w, err)
			return
		}
		defer tx.Rollback(r.Context())
		// Either both the heartbeat and session are removed, or neither is.
		// Keep the browser cookie until database revocation commits successfully.
		if _, err = tx.Exec(r.Context(), `DELETE FROM player_presence WHERE user_id=(
			SELECT user_id FROM sessions WHERE token_hash=$1)`, tokenHash(cookie.Value)); err == nil {
			_, err = tx.Exec(r.Context(), "DELETE FROM sessions WHERE token_hash=$1", tokenHash(cookie.Value))
		}
		if err != nil {
			fail(w, err)
			return
		}
		if err = tx.Commit(r.Context()); err != nil {
			fail(w, err)
			return
		}
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", HttpOnly: true, Secure: s.secure, SameSite: http.SameSiteLaxMode, MaxAge: -1, Expires: time.Unix(1, 0)})
	respond(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *server) setSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: token, Path: "/", HttpOnly: true, Secure: s.secure, SameSite: http.SameSiteLaxMode, MaxAge: 604800, Expires: s.now().Add(7 * 24 * time.Hour)})
}

func (s *server) sessionUser(r *http.Request) (authUser, error) {
	cookie, err := r.Cookie(sessionCookie)
	if err != nil || cookie.Value == "" {
		return authUser{}, apiError("session_expired")
	}
	user, err := loadUser(r.Context(), s.db, `u.id=(SELECT s.user_id FROM sessions s
		WHERE s.token_hash=$1 AND s.expires_at>now()) AND u.account_status='active'`, tokenHash(cookie.Value))
	if err != nil {
		return authUser{}, sessionLookupError(err)
	}
	_, _ = s.db.Exec(r.Context(), "UPDATE sessions SET last_seen_at=$2 WHERE token_hash=$1", tokenHash(cookie.Value), s.now())
	return user, nil
}

// A missing/expired session is an authentication result. A database failure is
// a server error, and must retain its original cause for logging and diagnosis.
func sessionLookupError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return apiError("session_expired")
	}
	return err
}

func (s *server) requireSession(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, err := s.sessionUser(r)
		if err != nil {
			fail(w, err)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userContextKey{}, user)))
	})
}

func (s *server) requireRole(role string, next http.Handler) http.Handler {
	return s.requireSession(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !hasRole(currentUser(r), role) {
			fail(w, apiError("forbidden"))
			return
		}
		next.ServeHTTP(w, r)
	}))
}

func currentUser(r *http.Request) authUser {
	return r.Context().Value(userContextKey{}).(authUser)
}

func (s *server) me(w http.ResponseWriter, r *http.Request) {
	respond(w, http.StatusOK, currentUser(r))
}

func (s *server) updateMe(w http.ResponseWriter, r *http.Request) {
	var input profileInput
	if err := decodeJSON(r, &input); err != nil {
		fail(w, err)
		return
	}
	user := currentUser(r)
	userType, locale := user.UserType, user.PreferredLocale
	if input.UserType != nil {
		userType = *input.UserType
		if userType != "tourist" && userType != "local" {
			fail(w, apiError("invalid_user_type"))
			return
		}
	}
	if input.PreferredLocale != nil {
		locale = *input.PreferredLocale
		if locale != "pt-PT" && locale != "en" {
			fail(w, apiError("invalid_locale"))
			return
		}
	}
	if _, err := s.db.Exec(r.Context(), "UPDATE users SET user_type=$2,preferred_locale=$3 WHERE id=$1", user.ID, userType, locale); err != nil {
		fail(w, err)
		return
	}
	updated, err := loadUser(r.Context(), s.db, "u.id=$1", user.ID)
	if err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusOK, updated)
}

func (s *server) updateAppearance(w http.ResponseWriter, r *http.Request) {
	var input characterAppearance
	if err := decodeJSON(r, &input); err != nil {
		fail(w, err)
		return
	}
	input, err := normalizeAppearance(input)
	if err != nil {
		fail(w, err)
		return
	}
	user := currentUser(r)
	_, err = s.db.Exec(r.Context(), `UPDATE character_appearances SET
		outfit_style=$2,top_color=$3,bottom_color=$4,hair_style=$5,
		hair_color=$6,skin_tone=$7,shoe_color=$8 WHERE user_id=$1`, user.ID,
		input.OutfitStyle, input.TopColor, input.BottomColor, input.HairStyle,
		input.HairColor, input.SkinTone, input.ShoeColor)
	if err != nil {
		fail(w, err)
		return
	}
	updated, err := loadUser(r.Context(), s.db, "u.id=$1", user.ID)
	if err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusOK, updated)
}

func (s *server) adminUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT u.id::text,u.handle,u.user_type::text,u.account_status::text,u.created_at
		FROM users u ORDER BY u.created_at DESC LIMIT 100`)
	if err != nil {
		fail(w, err)
		return
	}
	defer rows.Close()
	type summary struct {
		ID            string    `json:"id"`
		Handle        string    `json:"handle"`
		UserType      string    `json:"userType"`
		AccountStatus string    `json:"accountStatus"`
		CreatedAt     time.Time `json:"createdAt"`
	}
	users := []summary{}
	for rows.Next() {
		var user summary
		if err = rows.Scan(&user.ID, &user.Handle, &user.UserType, &user.AccountStatus, &user.CreatedAt); err != nil {
			fail(w, err)
			return
		}
		users = append(users, user)
	}
	if err = rows.Err(); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		fail(w, err)
		return
	}
	respond(w, http.StatusOK, map[string]any{"users": users})
}
