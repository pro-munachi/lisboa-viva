package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

func checksum(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func migrate(ctx context.Context, db *pgxpool.Pool, root string) error {
	files, err := filepath.Glob(filepath.Join(root, "db", "migrations", "*.sql"))
	if err != nil {
		return err
	}
	if len(files) == 0 {
		return fmt.Errorf("no database migrations found")
	}
	for _, path := range files {
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		name := filepath.Base(path)
		tx, err := db.Begin(ctx)
		if err != nil {
			return err
		}
		if err = applyMigration(ctx, tx, name, data); err != nil {
			return err
		}
	}
	return nil
}

type migrationTransaction interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	QueryRow(context.Context, string, ...any) pgx.Row
	Commit(context.Context) error
	Rollback(context.Context) error
}

func applyMigration(ctx context.Context, tx migrationTransaction, name string, data []byte) error {
	defer tx.Rollback(ctx)
	// Serialize the entire read/check/apply cycle, including first-start ledger
	// creation. The waiter must read the checksum after its predecessor commits.
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(718205)"); err != nil {
		return fmt.Errorf("lock migration %s: %w", name, err)
	}
	if _, err := tx.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		name text PRIMARY KEY,
		checksum char(64) NOT NULL,
		applied_at timestamptz NOT NULL DEFAULT now()
	)`); err != nil {
		return err
	}
	sum := checksum(data)
	var stored string
	err := tx.QueryRow(ctx, "SELECT checksum FROM schema_migrations WHERE name=$1", name).Scan(&stored)
	if err == nil {
		if stored != sum {
			return fmt.Errorf("migration %s changed after application", name)
		}
		return nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if _, err = tx.Exec(ctx, string(data)); err == nil {
		_, err = tx.Exec(ctx, "INSERT INTO schema_migrations(name, checksum) VALUES($1,$2)", name, sum)
	}
	if err != nil {
		return fmt.Errorf("apply %s: %w", name, err)
	}
	return tx.Commit(ctx)
}
