package main

import (
	"context"
	"github.com/jackc/pgx/v5/pgxpool"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
)

func env(k, d string) string {
	if s := os.Getenv(k); s != "" {
		return s
	}
	return d
}
func main() {
	db, e := pgxpool.New(ctx, env("DATABASE_URL", "postgres://lisboa@127.0.0.1:55432/lisboa?sslmode=disable"))
	requireOK(e)
	defer db.Close()
	requireOK(db.Ping(ctx))
	root := env("PROJECT_ROOT", "../..")
	requireOK(migrate(db, root))
	world, e := loadWorld(filepath.Join(root, "content/world.json"))
	requireOK(e)
	a := &App{DB: db, World: world, Now: func() time.Time { return time.Now().UTC() }, Roll: random, Origin: env("APP_ORIGIN", "http://localhost:3000"), Secure: env("COOKIE_SECURE", "false") == "true"}
	if h := os.Getenv("BOOTSTRAP_ADMIN_HANDLE"); h != "" {
		_, e = db.Exec(ctx, "UPDATE users SET admin=true WHERE handle=$1", h)
		requireOK(e)
	}
	stop, cancel := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer cancel()
	go func() {
		t := time.NewTicker(time.Second)
		defer t.Stop()
		for {
			select {
			case <-stop.Done():
				return
			case <-t.C:
				if e := a.tick(); e != nil {
					slog.Error("worker failed; retrying", "error", e)
				}
			}
		}
	}()
	s := &http.Server{Addr: env("LISTEN_ADDR", "127.0.0.1:8080"), Handler: a.Handler(), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second}
	go func() {
		<-stop.Done()
		c, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		s.Shutdown(c)
	}()
	slog.Info("Lisboa Viva pronta", "listen", s.Addr)
	if e = s.ListenAndServe(); e != http.ErrServerClosed {
		requireOK(e)
	}
}
