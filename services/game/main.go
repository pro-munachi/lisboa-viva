package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func main() {
	ctx := context.Background()
	db, err := pgxpool.New(ctx, env("DATABASE_URL", "postgres://lisboa:lisboa_dev@127.0.0.1:55433/lisboa?sslmode=disable"))
	if err != nil {
		slog.Error("database configuration failed", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	if err = db.Ping(ctx); err != nil {
		slog.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	if err = migrate(ctx, db, env("PROJECT_ROOT", "../..")); err != nil {
		slog.Error("database migration failed", "error", err)
		os.Exit(1)
	}
	if handle := strings.ToLower(strings.TrimSpace(os.Getenv("BOOTSTRAP_ADMIN_HANDLE"))); handle != "" {
		if _, err = db.Exec(ctx, `INSERT INTO user_roles(user_id,role)
			SELECT id,'admin' FROM users WHERE lower(handle)=$1
			ON CONFLICT DO NOTHING`, handle); err != nil {
			slog.Error("admin bootstrap failed", "error", err)
			os.Exit(1)
		}
	}
	if env("MIGRATE_ONLY", "false") == "true" {
		slog.Info("database migrations complete")
		return
	}

	server := newServer(db, env("COOKIE_SECURE", "false") == "true")
	httpServer := &http.Server{
		Addr:              env("LISTEN_ADDR", "127.0.0.1:8080"),
		Handler:           server.routes(),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	stop, cancel := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer cancel()
	go func() {
		<-stop.Done()
		shutdown, done := context.WithTimeout(context.Background(), 5*time.Second)
		defer done()
		_ = httpServer.Shutdown(shutdown)
	}()

	slog.Info("authentication service ready", "listen", httpServer.Addr)
	if err = httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}
