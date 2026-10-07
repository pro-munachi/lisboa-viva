package main

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const transactionChatUser = "11111111-1111-4111-8111-111111111111"

func transactionChatInput(t *testing.T) chatInput {
	t.Helper()
	input, err := normalizeChatInput(chatInput{
		Room: "lisbon:city", Body: " \tOlá, Lisboa!\n ",
		ClientID: "ABCD1234-5678-4123-ABCD-123456789ABC",
	})
	if err != nil {
		t.Fatal(err)
	}
	return input
}

func transactionChatRecord(input chatInput) chatMessage {
	return chatMessage{
		ID: "9007199254740993", Room: input.Room, Body: input.Body,
		SentAt: "2026-10-07T10:02:03.123456Z",
		Author: chatAuthor{ID: transactionChatUser, Handle: "munachi", UserType: "tourist"},
	}
}

func TestChatTransactionLocksBeforeAllocationAndCommitsBeforeSuccess(t *testing.T) {
	input := transactionChatInput(t)
	tx := &recordingChatTransaction{lookupErr: pgx.ErrNoRows, inserted: transactionChatRecord(input)}
	message, created, err := postChatMessage(context.Background(), tx, transactionChatUser, input)
	if err != nil || !created || !reflect.DeepEqual(message, tx.inserted) {
		t.Fatalf("wrong create result: message=%+v created=%t err=%v", message, created, err)
	}
	if want := []string{"nonce_lock", "lookup", "room_lock", "insert", "commit", "rollback"}; !reflect.DeepEqual(tx.calls, want) {
		t.Fatalf("unsafe transaction order: got %v, want %v", tx.calls, want)
	}
	if !tx.committed {
		t.Fatal("message returned before a successful commit")
	}
	assertChatLock(t, tx.executions[0], "roam:chat:nonce:"+transactionChatUser+":"+input.ClientID)
	assertChatLock(t, tx.executions[1], "roam:chat:room:"+input.Room)
	if !reflect.DeepEqual(tx.queries[0].args, []any{transactionChatUser, input.ClientID}) {
		t.Fatalf("nonce lookup did not use trusted account and normalized UUID: %v", tx.queries[0].args)
	}
	if !strings.Contains(tx.queries[0].sql, "m.user_id=$1 AND m.client_id=$2") {
		t.Fatal("idempotency lookup is not scoped to account and nonce")
	}
	if !reflect.DeepEqual(tx.queries[1].args, []any{input.Room, transactionChatUser, input.ClientID, input.Body}) {
		t.Fatalf("insert used incorrect identity or message arguments: %v", tx.queries[1].args)
	}
	if !strings.Contains(tx.queries[1].sql, "VALUES($1,$2,$3,$4)") {
		t.Fatal("insert values are not parameterized")
	}
	for _, query := range tx.queries {
		if strings.Contains(query.sql, transactionChatUser) || strings.Contains(query.sql, input.Body) || strings.Contains(query.sql, input.ClientID) {
			t.Fatal("identity or message interpolated into SQL")
		}
	}
}

func TestChatTransactionIdempotentRetryReturnsStoredMessageWithoutInsert(t *testing.T) {
	input := transactionChatInput(t)
	existing := transactionChatRecord(input)
	tx := &recordingChatTransaction{existing: existing}
	message, created, err := postChatMessage(context.Background(), tx, transactionChatUser, input)
	if err != nil || created || !reflect.DeepEqual(message, existing) {
		t.Fatalf("retry changed stored message: message=%+v created=%t err=%v", message, created, err)
	}
	if want := []string{"nonce_lock", "lookup", "rollback"}; !reflect.DeepEqual(tx.calls, want) {
		t.Fatalf("retry allocated another message or left transaction open: %v", tx.calls)
	}
	if len(tx.queries) != 1 || tx.committed {
		t.Fatal("retry unexpectedly mutated the database")
	}
}

func TestChatTransactionNonceReuseCannotChangeRoomOrBody(t *testing.T) {
	for _, field := range []string{"room", "body"} {
		t.Run(field, func(t *testing.T) {
			input := transactionChatInput(t)
			existing := transactionChatRecord(input)
			if field == "room" {
				existing.Room = "lisbon:hotspot:previous-location"
			} else {
				existing.Body = "Previously stored text"
			}
			tx := &recordingChatTransaction{existing: existing}
			message, created, err := postChatMessage(context.Background(), tx, transactionChatUser, input)
			if err != apiError("nonce_conflict") || created || !reflect.DeepEqual(message, chatMessage{}) {
				t.Fatalf("nonce reuse accepted: message=%+v created=%t err=%v", message, created, err)
			}
			if want := []string{"nonce_lock", "lookup", "rollback"}; !reflect.DeepEqual(tx.calls, want) {
				t.Fatalf("nonce conflict wrote or failed to close transaction: %v", tx.calls)
			}
		})
	}
}

func TestChatTransactionFailuresPreserveDatabaseCauseAndRollback(t *testing.T) {
	for _, stage := range []string{"nonce_lock", "lookup", "room_lock", "insert", "commit"} {
		t.Run(stage, func(t *testing.T) {
			input := transactionChatInput(t)
			failure := errors.New("database operation failed")
			tx := &recordingChatTransaction{
				lookupErr: pgx.ErrNoRows, inserted: transactionChatRecord(input),
				failStage: stage, failure: failure,
				rollbackErr: errors.New("rollback also failed"),
			}
			message, created, err := postChatMessage(context.Background(), tx, transactionChatUser, input)
			if err != failure || !errors.Is(err, failure) || created || !reflect.DeepEqual(message, chatMessage{}) {
				t.Fatalf("failure hidden or unsuccessful message returned: message=%+v created=%t err=%v", message, created, err)
			}
			if tx.calls[len(tx.calls)-1] != "rollback" {
				t.Fatalf("transaction left open after %s: %v", stage, tx.calls)
			}
			if stage != "commit" {
				for _, call := range tx.calls {
					if call == "commit" {
						t.Fatalf("transaction committed after %s failed", stage)
					}
				}
			}
			if tx.committed {
				t.Fatal("failed transaction recorded a successful commit")
			}
		})
	}
}

func TestChatTransactionWrappedNoRowsAllowsCreation(t *testing.T) {
	input := transactionChatInput(t)
	tx := &recordingChatTransaction{
		lookupErr: fmt.Errorf("lookup: %w", pgx.ErrNoRows), inserted: transactionChatRecord(input),
	}
	message, created, err := postChatMessage(context.Background(), tx, transactionChatUser, input)
	if err != nil || !created || message.ID != tx.inserted.ID || !tx.committed {
		t.Fatalf("wrapped missing row was not accepted: message=%+v created=%t err=%v", message, created, err)
	}
}

type transactionChatSQL struct {
	sql  string
	args []any
}

func assertChatLock(t *testing.T, call transactionChatSQL, key string) {
	t.Helper()
	if !strings.Contains(call.sql, "pg_advisory_xact_lock(hashtextextended($1,0))") || !reflect.DeepEqual(call.args, []any{key}) || strings.Contains(call.sql, key) {
		t.Fatalf("incorrect or unparameterized transaction lock: %+v", call)
	}
}

type recordingChatTransaction struct {
	calls       []string
	executions  []transactionChatSQL
	queries     []transactionChatSQL
	existing    chatMessage
	inserted    chatMessage
	lookupErr   error
	failStage   string
	failure     error
	rollbackErr error
	committed   bool
}

func (tx *recordingChatTransaction) record(stage string) error {
	tx.calls = append(tx.calls, stage)
	if tx.failStage == stage {
		return tx.failure
	}
	return nil
}

func (tx *recordingChatTransaction) Exec(_ context.Context, statement string, args ...any) (pgconn.CommandTag, error) {
	tx.executions = append(tx.executions, transactionChatSQL{statement, append([]any(nil), args...)})
	stage := "room_lock"
	if len(args) == 1 {
		if key, ok := args[0].(string); ok && strings.HasPrefix(key, "roam:chat:nonce:") {
			stage = "nonce_lock"
		}
	}
	return pgconn.CommandTag{}, tx.record(stage)
}

func (tx *recordingChatTransaction) QueryRow(_ context.Context, statement string, args ...any) pgx.Row {
	tx.queries = append(tx.queries, transactionChatSQL{statement, append([]any(nil), args...)})
	stage := "lookup"
	message, err := tx.existing, tx.lookupErr
	if strings.Contains(statement, "INSERT INTO chat_messages") {
		stage = "insert"
		message, err = tx.inserted, nil
	}
	if failure := tx.record(stage); failure != nil {
		err = failure
	}
	return transactionChatRow{message: message, err: err}
}

func (tx *recordingChatTransaction) Commit(context.Context) error {
	if err := tx.record("commit"); err != nil {
		return err
	}
	tx.committed = true
	return nil
}

func (tx *recordingChatTransaction) Rollback(context.Context) error {
	_ = tx.record("rollback")
	return tx.rollbackErr
}

type transactionChatRow struct {
	message chatMessage
	err     error
}

func (row transactionChatRow) Scan(dest ...any) error {
	if row.err != nil {
		return row.err
	}
	if len(dest) != 7 {
		return fmt.Errorf("expected 7 public message columns, got %d", len(dest))
	}
	// Use an ID above JavaScript's exact integer range and a local timestamp to
	// exercise decimal-string IDs and UTC serialization on both query paths.
	*(dest[0].(*int64)) = 9007199254740993
	*(dest[1].(*string)) = row.message.Room
	*(dest[2].(*string)) = row.message.Body
	*(dest[3].(*time.Time)) = time.Date(2026, 10, 7, 11, 2, 3, 123456000, time.FixedZone("Lisbon", 3600))
	*(dest[4].(*string)) = row.message.Author.ID
	*(dest[5].(*string)) = row.message.Author.Handle
	*(dest[6].(*string)) = row.message.Author.UserType
	return nil
}
