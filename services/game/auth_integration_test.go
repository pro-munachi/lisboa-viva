package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// Opt in explicitly. The URL and every effective/fallback host must be local;
// the test uses its own randomly named schema, never the application's tables.
func loopbackTestConfig(raw string) (*pgxpool.Config, error) {
	local := func(host string) bool {
		return host == "127.0.0.1" || host == "localhost" || host == "::1"
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") || !local(u.Hostname()) {
		return nil, errors.New("test database URL must use a loopback PostgreSQL host")
	}
	config, err := pgxpool.ParseConfig(raw)
	if err != nil {
		return nil, errors.New("invalid test database configuration")
	}
	if !local(config.ConnConfig.Host) {
		return nil, errors.New("effective test database host must be loopback")
	}
	for _, fallback := range config.ConnConfig.Fallbacks {
		if !local(fallback.Host) {
			return nil, errors.New("fallback test database hosts must be loopback")
		}
	}
	config.ConnConfig.ConnectTimeout = 5 * time.Second
	config.MaxConns = 4
	return config, nil
}

func TestPostgresLoopbackURLGuard(t *testing.T) {
	for _, test := range []struct {
		name string
		url  string
		ok   bool
	}{
		{"IPv4", "postgres://test:test@127.0.0.1:55433/test?sslmode=disable", true},
		{"localhost", "postgresql://test:test@localhost/test?sslmode=disable", true},
		{"IPv6", "postgres://test:test@[::1]/test?sslmode=disable", true},
		{"remote", "postgres://test:test@db.example.test/test?sslmode=disable", false},
		{"host override", "postgres://test:test@127.0.0.1/test?sslmode=disable&host=db.example.test", false},
		{"remote fallback", "postgres://test:test@127.0.0.1/test?sslmode=disable&host=127.0.0.1,db.example.test", false},
		{"missing host", "postgres:///test?sslmode=disable", false},
		{"wrong protocol", "https://localhost/test", false},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, err := loopbackTestConfig(test.url)
			if (err == nil) != test.ok {
				t.Fatalf("loopback guard result does not match expected allowed=%t", test.ok)
			}
		})
	}
}

func TestClosedPoolAuthFailuresReturn500WithoutConnecting(t *testing.T) {
	config, err := loopbackTestConfig("postgres://test:test@127.0.0.1:1/test?sslmode=disable")
	if err != nil {
		t.Fatal("could not configure the closed-pool test")
	}
	config.MinConns, config.MinIdleConns = 0, 0
	var dials atomic.Int32
	config.ConnConfig.DialFunc = func(context.Context, string, string) (net.Conn, error) {
		dials.Add(1)
		return nil, errors.New("closed-pool auth test must not connect")
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		t.Fatal("could not create the closed-pool test")
	}
	pool.Close()
	handler := newServer(pool, false).routes()
	for _, test := range []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{"session lookup", http.MethodGet, "/v1/auth/me", ""},
		{"logout", http.MethodPost, "/v1/auth/logout", ""},
		{"login", http.MethodPost, "/v1/auth/login", `{"identity":"test_visitor","password":"test-password"}`},
		{"chat history", http.MethodGet, "/v1/chat/messages?room=lisbon:city", ""},
		{"chat send", http.MethodPost, "/v1/chat/messages", `{"room":"lisbon:city","body":"Hello","clientId":"8fd242be-20f7-4c2c-9224-4f16fdd9d56c"}`},
	} {
		t.Run(test.name, func(t *testing.T) {
			r := httptest.NewRequest(test.method, test.path, strings.NewReader(test.body))
			r.AddCookie(&http.Cookie{Name: sessionCookie, Value: "closed-pool-test-cookie"})
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, r)
			var body struct {
				Error string `json:"error"`
			}
			if response.Code != http.StatusInternalServerError || json.Unmarshal(response.Body.Bytes(), &body) != nil || body.Error != "server_error" {
				t.Fatalf("database failure returned HTTP %d instead of generic HTTP 500", response.Code)
			}
			if len(response.Result().Cookies()) != 0 {
				t.Fatal("failed auth operation must not issue or clear a browser session cookie")
			}
		})
	}
	if dials.Load() != 0 {
		t.Fatal("closed-pool auth checks attempted a database connection")
	}
}

func TestAuthPostgresLoopbackIntegration(t *testing.T) {
	raw := os.Getenv("ROAM_TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("set ROAM_TEST_DATABASE_URL to opt in to an isolated loopback PostgreSQL test")
	}
	config, err := loopbackTestConfig(raw)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	admin, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal("could not configure the loopback test pool")
	}
	t.Cleanup(admin.Close)
	if err = admin.Ping(ctx); err != nil {
		var connectionError *net.OpError
		if errors.As(err, &connectionError) {
			t.Fatalf("loopback PostgreSQL connection failed: %v", connectionError.Err)
		}
		t.Fatal("could not reach the opted-in loopback PostgreSQL database")
	}
	suffix := make([]byte, 12)
	if _, err = rand.Read(suffix); err != nil {
		t.Fatal("could not generate an isolated test schema name")
	}
	schema := "roam_auth_test_" + hex.EncodeToString(suffix)
	identifier := pgx.Identifier{schema}.Sanitize()
	if _, err = admin.Exec(ctx, "CREATE SCHEMA "+identifier); err != nil {
		t.Fatal("could not create an isolated test schema")
	}
	t.Cleanup(func() {
		cleanupCtx, done := context.WithTimeout(context.Background(), 10*time.Second)
		defer done()
		if _, err := admin.Exec(cleanupCtx, "DROP SCHEMA "+identifier+" CASCADE"); err != nil {
			t.Error("could not remove the isolated test schema")
			return
		}
		var remains bool
		if err := admin.QueryRow(cleanupCtx, "SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1)", schema).Scan(&remains); err != nil || remains {
			t.Error("isolated test schema removal was not confirmed")
			return
		}
		t.Log("isolated PostgreSQL test schema removal confirmed")
	})
	isolated := config.Copy()
	isolated.ConnConfig.RuntimeParams["search_path"] = identifier
	isolated.ConnConfig.RuntimeParams["application_name"] = "roam-auth-integration"
	pool, err := pgxpool.NewWithConfig(ctx, isolated)
	if err != nil {
		t.Fatal("could not configure the isolated schema pool")
	}
	t.Cleanup(pool.Close)
	var actualSchema string
	if err = pool.QueryRow(ctx, "SELECT current_schema()").Scan(&actualSchema); err != nil || actualSchema != schema {
		t.Fatal("test pool is not scoped to its temporary schema")
	}

	// Two fresh startups must serialize all real migration files. A third
	// run must see the same ledger and leave the already-created schema intact.
	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal("could not locate project migrations")
	}
	results := make(chan error, 2)
	for range 2 {
		go func() { results <- migrate(ctx, pool, root) }()
	}
	for range 2 {
		if err = <-results; err != nil {
			t.Fatalf("concurrent isolated migrations failed: %v", err)
		}
	}
	if err = migrate(ctx, pool, root); err != nil {
		t.Fatalf("idempotent isolated migration failed: %v", err)
	}
	files, err := filepath.Glob(filepath.Join(root, "db", "migrations", "*.sql"))
	if err != nil || len(files) == 0 {
		t.Fatal("no migration fixtures found")
	}
	var entries int
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM schema_migrations").Scan(&entries); err != nil || entries != len(files) {
		t.Fatal("migration ledger does not contain each real migration exactly once")
	}
	for _, path := range files {
		data, readErr := os.ReadFile(path)
		var stored string
		if readErr != nil || pool.QueryRow(ctx, "SELECT checksum FROM schema_migrations WHERE name=$1", filepath.Base(path)).Scan(&stored) != nil || stored != checksum(data) {
			t.Fatal("migration ledger checksum does not match the source")
		}
	}

	handler := newServer(pool, false).routes()
	request := func(method, path string, body any, cookie *http.Cookie) *httptest.ResponseRecorder {
		t.Helper()
		var data []byte
		if body != nil {
			data, err = json.Marshal(body)
			if err != nil {
				t.Fatal("could not encode an auth test request")
			}
		}
		r := httptest.NewRequest(method, path, bytes.NewReader(data)).WithContext(ctx)
		r.RemoteAddr = "127.0.0.1:12345"
		r.Header.Set("Content-Type", "application/json")
		if cookie != nil {
			r.AddCookie(cookie)
		}
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, r)
		return response
	}
	status := func(response *httptest.ResponseRecorder, want int, code string) {
		t.Helper()
		if response.Code != want {
			t.Fatalf("auth endpoint returned HTTP %d, want %d", response.Code, want)
		}
		if code != "" {
			var body struct {
				Error string `json:"error"`
			}
			if json.Unmarshal(response.Body.Bytes(), &body) != nil || body.Error != code {
				t.Fatalf("auth endpoint did not return expected error code %s", code)
			}
		}
	}
	userFrom := func(response *httptest.ResponseRecorder) authUser {
		t.Helper()
		var user authUser
		if json.Unmarshal(response.Body.Bytes(), &user) != nil || user.ID == "" {
			t.Fatal("auth endpoint did not return a valid user")
		}
		return user
	}
	cookieFrom := func(response *httptest.ResponseRecorder) *http.Cookie {
		t.Helper()
		for _, cookie := range response.Result().Cookies() {
			if cookie.Name == sessionCookie && len(cookie.Value) >= 40 && cookie.HttpOnly && cookie.Path == "/" && cookie.SameSite == http.SameSiteLaxMode {
				return cookie
			}
		}
		t.Fatal("auth response did not set a protected opaque session cookie")
		return nil
	}

	const password = "roam-integration-password"
	input := registerInput{Handle: "  ROAM_VISITOR  ", Email: "ROAM.VISITOR@EXAMPLE.TEST", Password: password, UserType: "tourist", HomeDistrict: "Baixa", AdultConfirmed: true}
	registered := request(http.MethodPost, "/v1/auth/register", input, nil)
	status(registered, http.StatusCreated, "")
	user, registrationCookie := userFrom(registered), cookieFrom(registered)
	if user.Handle != "ROAM_VISITOR" || user.Email != "roam.visitor@example.test" || user.PreferredLocale != "en" || user.AccountStatus != "active" || user.AdultConfirmedAt == nil || !hasRole(user, "player") || hasRole(user, "admin") {
		t.Fatal("registration normalization, English default, adult confirmation or player role was not persisted")
	}
	home := request(http.MethodGet, "/v1/player/home", nil, registrationCookie)
	status(home, http.StatusOK, "")
	var savedHome playerHome
	if json.Unmarshal(home.Body.Bytes(), &savedHome) != nil || savedHome.CityID != "lisbon" || savedHome.District != "Baixa" {
		t.Fatal("registration did not persist the selected home")
	}
	wallet := request(http.MethodGet, "/v1/player/wallet", nil, registrationCookie)
	status(wallet, http.StatusOK, "")
	var initialWallet walletSnapshot
	if json.Unmarshal(wallet.Body.Bytes(), &initialWallet) != nil || initialWallet.Currency != "EUR" || initialWallet.BalanceCents != 30000 || len(initialWallet.Entries) != 1 || initialWallet.Entries[0].AmountCents != 30000 {
		t.Fatal("registration did not create a €300 wallet and opening ledger entry")
	}
	spend := walletSpendInput{TransactionID: "30202de8-c29c-435c-b224-fd958398b389", AmountCents: 300, Purpose: "travel", Description: "Bus to Baixa"}
	spent := request(http.MethodPost, "/v1/player/wallet/spend", spend, registrationCookie)
	status(spent, http.StatusOK, "")
	var afterSpend walletSnapshot
	if json.Unmarshal(spent.Body.Bytes(), &afterSpend) != nil || afterSpend.BalanceCents != 29700 || len(afterSpend.Entries) != 2 || afterSpend.Entries[0].AmountCents != -300 || afterSpend.Entries[0].BalanceAfterCents != 29700 {
		t.Fatal("wallet spend was not recorded with its resulting balance")
	}
	status(request(http.MethodPost, "/v1/player/wallet/spend", spend, registrationCookie), http.StatusOK, "")
	spend.Description = "Changed purpose"
	status(request(http.MethodPost, "/v1/player/wallet/spend", spend, registrationCookie), http.StatusConflict, "wallet_conflict")
	spend.TransactionID = "13f96d93-3ae4-4643-8fac-ce73a0c1e61f"
	spend.Description = "Too expensive"
	spend.AmountCents = 30000
	status(request(http.MethodPost, "/v1/player/wallet/spend", spend, registrationCookie), http.StatusConflict, "insufficient_funds")
	wallet = request(http.MethodGet, "/v1/player/wallet", nil, registrationCookie)
	if json.Unmarshal(wallet.Body.Bytes(), &afterSpend) != nil || afterSpend.BalanceCents != 29700 || len(afterSpend.Entries) != 2 {
		t.Fatal("duplicate or rejected spending changed the wallet")
	}
	status(request(http.MethodPatch, "/v1/player/home", map[string]string{"district": "Sintra"}, registrationCookie), http.StatusBadRequest, "invalid_home")
	status(request(http.MethodPatch, "/v1/player/home", map[string]string{"district": "Alfama"}, registrationCookie), http.StatusOK, "")
	home = request(http.MethodGet, "/v1/player/home", nil, registrationCookie)
	if json.Unmarshal(home.Body.Bytes(), &savedHome) != nil || savedHome.District != "Alfama" {
		t.Fatal("home district change was not persisted")
	}
	var storedPassword, storedToken string
	if err = pool.QueryRow(ctx, `SELECT p.password_hash,s.token_hash FROM password_credentials p
		JOIN sessions s ON s.user_id=p.user_id WHERE p.user_id=$1 AND s.token_hash=$2`, user.ID, tokenHash(registrationCookie.Value)).Scan(&storedPassword, &storedToken); err != nil {
		t.Fatal("registered credential/session rows are missing")
	}
	if storedPassword == password || bcrypt.CompareHashAndPassword([]byte(storedPassword), []byte(password)) != nil || storedToken == registrationCookie.Value || len(storedToken) != 64 || storedToken != tokenHash(registrationCookie.Value) {
		t.Fatal("passwords and session tokens must be stored as valid hashes")
	}
	me := request(http.MethodGet, "/v1/auth/me", nil, registrationCookie)
	status(me, http.StatusOK, "")
	if userFrom(me).ID != user.ID {
		t.Fatal("the session resolved to another account")
	}
	profile := request(http.MethodPatch, "/v1/auth/me", map[string]string{"userType": "local", "preferredLocale": "pt-PT"}, registrationCookie)
	status(profile, http.StatusOK, "")
	updated := userFrom(profile)
	if updated.UserType != "local" || updated.PreferredLocale != "pt-PT" || updated.ID != user.ID {
		t.Fatal("profile changes were not returned")
	}
	if persisted := userFrom(request(http.MethodGet, "/v1/auth/me", nil, registrationCookie)); persisted.UserType != "local" || persisted.PreferredLocale != "pt-PT" {
		t.Fatal("profile changes were not persisted")
	}

	duplicate := input
	duplicate.Email = "another@example.test"
	status(request(http.MethodPost, "/v1/auth/register", duplicate, nil), http.StatusConflict, "handle_taken")
	duplicate.Handle, duplicate.Email = "another_visitor", user.Email
	status(request(http.MethodPost, "/v1/auth/register", duplicate, nil), http.StatusConflict, "email_taken")
	var users, credentials int
	if pool.QueryRow(ctx, "SELECT count(*) FROM users").Scan(&users) != nil || pool.QueryRow(ctx, "SELECT count(*) FROM password_credentials").Scan(&credentials) != nil || users != 1 || credentials != 1 {
		t.Fatal("rejected duplicate registrations created extra accounts/credentials")
	}
	status(request(http.MethodGet, "/v1/admin/users", nil, registrationCookie), http.StatusForbidden, "forbidden")
	status(request(http.MethodPost, "/v1/auth/login", loginInput{Identity: user.Handle, Password: "wrong-password"}, nil), http.StatusUnauthorized, "credentials")
	login := request(http.MethodPost, "/v1/auth/login", loginInput{Identity: strings.ToUpper(user.Handle), Password: password}, nil)
	status(login, http.StatusOK, "")
	loginCookie := cookieFrom(login)
	if userFrom(login).ID != user.ID || loginCookie.Value == registrationCookie.Value {
		t.Fatal("handle login did not create a fresh session for the registered account")
	}
	emailLogin := request(http.MethodPost, "/v1/auth/login", loginInput{Identity: strings.ToUpper(user.Email), Password: password}, nil)
	status(emailLogin, http.StatusOK, "")
	emailCookie := cookieFrom(emailLogin)
	if userFrom(emailLogin).ID != user.ID {
		t.Fatal("email login resolved to another account")
	}
	logout := request(http.MethodPost, "/v1/auth/logout", nil, loginCookie)
	status(logout, http.StatusOK, "")
	if cookies := logout.Result().Cookies(); len(cookies) != 1 || cookies[0].Name != sessionCookie || cookies[0].MaxAge >= 0 || cookies[0].Value != "" {
		t.Fatal("logout did not expire its browser cookie")
	}
	status(request(http.MethodGet, "/v1/auth/me", nil, loginCookie), http.StatusUnauthorized, "session_expired")
	status(request(http.MethodGet, "/v1/auth/me", nil, emailCookie), http.StatusOK, "")
	if _, err = pool.Exec(ctx, "UPDATE users SET account_status='suspended' WHERE id=$1", user.ID); err != nil {
		t.Fatal("could not suspend the isolated test account")
	}
	status(request(http.MethodGet, "/v1/auth/me", nil, registrationCookie), http.StatusUnauthorized, "session_expired")
	status(request(http.MethodGet, "/v1/auth/me", nil, emailCookie), http.StatusUnauthorized, "session_expired")
	status(request(http.MethodPost, "/v1/auth/login", loginInput{Identity: user.Handle, Password: password}, nil), http.StatusUnauthorized, "credentials")

}
