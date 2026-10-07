package main

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var testMigration = []byte("CREATE TABLE users(id text PRIMARY KEY)")

func TestMigrationLocksBeforeLedgerAndAppliesOnce(t *testing.T) {
	tx := &recordingMigrationTx{lookupErr: pgx.ErrNoRows}
	if err := applyMigration(context.Background(), tx, "001.sql", testMigration); err != nil {
		t.Fatal(err)
	}
	want := []string{"lock", "ledger", "lookup", "migration", "insert", "commit", "rollback"}
	if !reflect.DeepEqual(tx.calls, want) {
		t.Fatalf("got %v, want %v", tx.calls, want)
	}
	if tx.insertName != "001.sql" || tx.insertChecksum != checksum(testMigration) {
		t.Fatalf("wrong ledger entry: %q %q", tx.insertName, tx.insertChecksum)
	}
}

func TestMigrationChecksumPreventsReapplication(t *testing.T) {
	for _, test := range []struct {
		name   string
		stored string
		fail   bool
	}{
		{"already applied", checksum(testMigration), false},
		{"changed migration", checksum([]byte("different SQL")), true},
	} {
		t.Run(test.name, func(t *testing.T) {
			tx := &recordingMigrationTx{stored: test.stored}
			err := applyMigration(context.Background(), tx, "001.sql", testMigration)
			if (err != nil) != test.fail {
				t.Fatalf("got %v, expected error=%t", err, test.fail)
			}
			if test.fail && !strings.Contains(err.Error(), "changed after application") {
				t.Fatalf("unexpected mismatch error: %v", err)
			}
			if want := []string{"lock", "ledger", "lookup", "rollback"}; !reflect.DeepEqual(tx.calls, want) {
				t.Fatalf("migration was reapplied: %v", tx.calls)
			}
		})
	}
}

func TestMigrationAcceptsWrappedMissingRow(t *testing.T) {
	tx := &recordingMigrationTx{lookupErr: fmt.Errorf("ledger lookup: %w", pgx.ErrNoRows)}
	if err := applyMigration(context.Background(), tx, "001.sql", testMigration); err != nil {
		t.Fatal(err)
	}
	if tx.insertChecksum != checksum(testMigration) {
		t.Fatal("missing migration was not recorded")
	}
}

func TestMigrationFailuresPreserveCauseAndRollback(t *testing.T) {
	for _, stage := range []string{"lock", "ledger", "lookup", "migration", "insert", "commit"} {
		t.Run(stage, func(t *testing.T) {
			failure := fmt.Errorf("%s failed", stage)
			tx := &recordingMigrationTx{lookupErr: pgx.ErrNoRows, failStage: stage, failure: failure}
			err := applyMigration(context.Background(), tx, "001.sql", testMigration)
			if !errors.Is(err, failure) {
				t.Fatalf("cause lost: got %v, want %v", err, failure)
			}
			if tx.calls[len(tx.calls)-1] != "rollback" {
				t.Fatalf("transaction was not rolled back: %v", tx.calls)
			}
			if stage != "commit" && slicesContain(tx.calls, "commit") {
				t.Fatalf("failed migration was committed: %v", tx.calls)
			}
		})
	}
}

func TestConcurrentMigrationWaiterReadsCommittedLedger(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	store := &concurrentMigrationStore{lock: make(chan struct{}, 1), applied: make(chan struct{}), releaseApply: make(chan struct{}), checksums: make(map[string]string)}
	store.lock <- struct{}{}
	first := &concurrentMigrationTx{store: store, blockApply: true, lockAttempt: make(chan struct{})}
	second := &concurrentMigrationTx{store: store, lockAttempt: make(chan struct{})}
	results := make(chan error, 2)
	go func() { results <- applyMigration(ctx, first, "001.sql", testMigration) }()
	select {
	case <-store.applied:
	case <-ctx.Done():
		t.Fatal("first migration did not reach SQL execution")
	}
	go func() { results <- applyMigration(ctx, second, "001.sql", testMigration) }()
	select {
	case <-second.lockAttempt:
	case <-ctx.Done():
		t.Fatal("second migration did not request the lock")
	}
	store.mu.Lock()
	beforeLedger, beforeLookup, beforeApply := store.ledgerCalls, store.lookupCalls, store.applyCalls
	store.mu.Unlock()
	if beforeLedger != 1 || beforeLookup != 1 || beforeApply != 1 {
		t.Errorf("waiter accessed uncommitted ledger: ledger=%d lookup=%d SQL=%d", beforeLedger, beforeLookup, beforeApply)
	}
	close(store.releaseApply)
	for range 2 {
		select {
		case err := <-results:
			if err != nil {
				t.Errorf("concurrent migration failed: %v", err)
			}
		case <-ctx.Done():
			t.Fatal("concurrent migrations did not finish")
		}
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.applyCalls != 1 || store.insertCalls != 1 || store.lookupCalls != 2 || store.checksums["001.sql"] != checksum(testMigration) {
		t.Fatalf("migration reapplied or ledger inconsistent: SQL=%d insert=%d lookup=%d checksums=%v", store.applyCalls, store.insertCalls, store.lookupCalls, store.checksums)
	}
}

type migrationTestRow struct {
	value string
	err   error
}

func (row migrationTestRow) Scan(dest ...any) error {
	if row.err != nil {
		return row.err
	}
	*(dest[0].(*string)) = row.value
	return nil
}

type recordingMigrationTx struct {
	calls          []string
	stored         string
	lookupErr      error
	failStage      string
	failure        error
	insertName     string
	insertChecksum string
}

func migrationExecStage(sql string) string {
	switch {
	case strings.Contains(sql, "pg_advisory_xact_lock"):
		return "lock"
	case strings.HasPrefix(sql, "CREATE TABLE IF NOT EXISTS schema_migrations"):
		return "ledger"
	case strings.HasPrefix(sql, "INSERT INTO schema_migrations"):
		return "insert"
	default:
		return "migration"
	}
}

func (tx *recordingMigrationTx) record(stage string) error {
	tx.calls = append(tx.calls, stage)
	if tx.failStage == stage {
		return tx.failure
	}
	return nil
}

func (tx *recordingMigrationTx) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	stage := migrationExecStage(sql)
	err := tx.record(stage)
	if stage == "insert" && err == nil {
		tx.insertName, tx.insertChecksum = args[0].(string), args[1].(string)
	}
	return pgconn.CommandTag{}, err
}

func (tx *recordingMigrationTx) QueryRow(_ context.Context, _ string, _ ...any) pgx.Row {
	if err := tx.record("lookup"); err != nil {
		return migrationTestRow{err: err}
	}
	return migrationTestRow{value: tx.stored, err: tx.lookupErr}
}

func (tx *recordingMigrationTx) Commit(context.Context) error   { return tx.record("commit") }
func (tx *recordingMigrationTx) Rollback(context.Context) error { return tx.record("rollback") }

func slicesContain(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

// This fake models transaction advisory locking and a READ COMMITTED ledger.
// The first SQL execution is held open while another startup tries to migrate.
type concurrentMigrationStore struct {
	mu           sync.Mutex
	lock         chan struct{}
	applied      chan struct{}
	releaseApply chan struct{}
	checksums    map[string]string
	ledgerCalls  int
	lookupCalls  int
	applyCalls   int
	insertCalls  int
}

type concurrentMigrationTx struct {
	store           *concurrentMigrationStore
	lockAttempt     chan struct{}
	locked          bool
	closed          bool
	blockApply      bool
	createdLedger   bool
	pendingName     string
	pendingChecksum string
}

func (tx *concurrentMigrationTx) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	stage := migrationExecStage(sql)
	if stage == "lock" {
		close(tx.lockAttempt)
		select {
		case <-tx.store.lock:
			tx.locked = true
			return pgconn.CommandTag{}, nil
		case <-ctx.Done():
			return pgconn.CommandTag{}, ctx.Err()
		}
	}
	if !tx.locked {
		return pgconn.CommandTag{}, errors.New("ledger or SQL accessed before migration lock")
	}
	tx.store.mu.Lock()
	switch stage {
	case "ledger":
		tx.store.ledgerCalls++
		tx.createdLedger = true
	case "migration":
		tx.store.applyCalls++
	case "insert":
		tx.store.insertCalls++
		tx.pendingName, tx.pendingChecksum = args[0].(string), args[1].(string)
	}
	tx.store.mu.Unlock()
	if stage == "migration" && tx.blockApply {
		close(tx.store.applied)
		select {
		case <-tx.store.releaseApply:
		case <-ctx.Done():
			return pgconn.CommandTag{}, ctx.Err()
		}
	}
	return pgconn.CommandTag{}, nil
}

func (tx *concurrentMigrationTx) QueryRow(_ context.Context, _ string, args ...any) pgx.Row {
	if !tx.locked || !tx.createdLedger {
		return migrationTestRow{err: errors.New("ledger read before lock/creation")}
	}
	tx.store.mu.Lock()
	defer tx.store.mu.Unlock()
	tx.store.lookupCalls++
	value, exists := tx.store.checksums[args[0].(string)]
	if !exists {
		return migrationTestRow{err: pgx.ErrNoRows}
	}
	return migrationTestRow{value: value}
}

func (tx *concurrentMigrationTx) Commit(context.Context) error {
	if tx.closed || !tx.locked {
		return pgx.ErrTxClosed
	}
	tx.store.mu.Lock()
	defer tx.store.mu.Unlock()
	if _, exists := tx.store.checksums[tx.pendingName]; exists {
		return errors.New("duplicate migration ledger entry")
	}
	tx.store.checksums[tx.pendingName] = tx.pendingChecksum
	tx.release()
	return nil
}

func (tx *concurrentMigrationTx) release() {
	tx.closed = true
	if tx.locked {
		tx.locked = false
		tx.store.lock <- struct{}{}
	}
}

func (tx *concurrentMigrationTx) Rollback(context.Context) error {
	if tx.closed {
		return pgx.ErrTxClosed
	}
	tx.release()
	return nil
}
