package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func checksum(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func migrate(ctx context.Context, db *pgxpool.Pool, root string) error {
	if _, err := db.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		name text PRIMARY KEY,
		checksum char(64) NOT NULL,
		applied_at timestamptz NOT NULL DEFAULT now()
	)`); err != nil {
		return err
	}
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
		name, sum := filepath.Base(path), checksum(data)
		tx, err := db.Begin(ctx)
		if err != nil {
			return err
		}
		var stored string
		err = tx.QueryRow(ctx, "SELECT checksum FROM schema_migrations WHERE name=$1", name).Scan(&stored)
		if err == nil {
			_ = tx.Rollback(ctx)
			if stored != sum {
				return fmt.Errorf("migration %s changed after application", name)
			}
			continue
		}
		if err != pgx.ErrNoRows {
			_ = tx.Rollback(ctx)
			return err
		}
		if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(718205)"); err == nil {
			_, err = tx.Exec(ctx, string(data))
		}
		if err == nil {
			_, err = tx.Exec(ctx, "INSERT INTO schema_migrations(name, checksum) VALUES($1,$2)", name, sum)
		}
		if err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("apply %s: %w", name, err)
		}
		if err = tx.Commit(ctx); err != nil {
			return err
		}
	}
	return nil
}
