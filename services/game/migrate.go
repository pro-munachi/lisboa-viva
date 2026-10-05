package main

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"path/filepath"
)

func migrate(db *pgxpool.Pool, root string) error {
	tx, e := db.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if _, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(718205)"); e != nil {
		return e
	}
	if _, e = tx.Exec(ctx, "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())"); e != nil {
		return e
	}
	files, e := filepath.Glob(filepath.Join(root, "db/migrations/*.sql"))
	if e != nil {
		return e
	}
	if len(files) == 0 {
		return fail("no migrations found")
	}
	for _, file := range files {
		sql, e := os.ReadFile(file)
		if e != nil {
			return e
		}
		var exists bool
		if e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name=$1)", filepath.Base(file)).Scan(&exists); e != nil {
			return e
		}
		if exists {
			var sum string
			if e = tx.QueryRow(ctx, "SELECT checksum FROM schema_migrations WHERE name=$1", filepath.Base(file)).Scan(&sum); e != nil {
				return e
			}
			if sum != hash(string(sql)) {
				return fail("migration checksum changed")
			}
			continue
		}
		if _, e = tx.Exec(ctx, string(sql)); e != nil {
			return e
		}
		if _, e = tx.Exec(ctx, "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)", filepath.Base(file), hash(string(sql))); e != nil {
			return e
		}
	}
	return tx.Commit(ctx)
}
