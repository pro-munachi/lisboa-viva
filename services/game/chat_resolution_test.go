package main

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

type resolutionChatQuery struct {
	value any
	err   error
	args  []any
	calls int
}

func (query *resolutionChatQuery) QueryRow(_ context.Context, _ string, args ...any) pgx.Row {
	query.calls++
	query.args = args
	return resolutionChatRow{query.value, query.err}
}

type resolutionChatRow struct {
	value any
	err   error
}

func (row resolutionChatRow) Scan(dest ...any) error {
	if row.err != nil {
		return row.err
	}
	switch value := row.value.(type) {
	case string:
		*(dest[0].(*string)) = value
	case bool:
		*(dest[0].(*bool)) = value
	}
	return nil
}

func TestRoomResolverKeepsPublicRoomsAndRequiresCurrentNearbyPresence(t *testing.T) {
	ctx := context.Background()
	query := &resolutionChatQuery{}
	if room, err := resolveChatRoom(ctx, query, directTestViewer, "lisbon:city"); err != nil || room != "lisbon:city" || query.calls != 0 {
		t.Fatal("ordinary public chat unexpectedly requires presence")
	}
	query.value = "Cais do Sodré"
	if room, err := resolveChatRoom(ctx, query, directTestViewer, "nearby:Cais do Sodré"); err != nil || room != "nearby:Cais do Sodré" || !reflect.DeepEqual(query.args, []any{directTestViewer}) {
		t.Fatal("nearby room did not resolve from trusted account presence")
	}
	if _, err := resolveChatRoom(ctx, query, directTestViewer, "nearby:Alfama"); err != apiError("chat_presence_required") {
		t.Fatal("an unrelated requested area bypassed current presence")
	}
	query.err = fmt.Errorf("presence lookup: %w", pgx.ErrNoRows)
	if _, err := resolveChatRoom(ctx, query, directTestViewer, "nearby:Cais do Sodré"); err != apiError("chat_presence_required") {
		t.Fatal("missing or expired presence did not reject nearby access")
	}
	query.err = errors.New("presence database unavailable")
	if _, err := resolveChatRoom(ctx, query, directTestViewer, "nearby:Cais do Sodré"); !errors.Is(err, query.err) {
		t.Fatal("database failure was disguised as an account presence denial")
	}
}

func TestLegacyDirectAliasesValidatePeerAndPreserveCompatibleErrors(t *testing.T) {
	if peer, err := legacyDirectPeer("direct:"+strings.ToUpper(directTestPeer), directTestViewer); err != nil || peer != directTestPeer {
		t.Fatal("compatible private room did not normalize its requested peer")
	}
	for _, requested := range []string{"direct:" + directTestViewer, "direct:00000000-0000-0000-0000-000000000000", "direct:not-a-user", "direct:" + directTestViewer + ":" + directTestPeer, "lisbon:city"} {
		if _, err := legacyDirectPeer(requested, directTestViewer); err != apiError("invalid_room") {
			t.Fatal("compatible private room accepted a self, malformed or internal pair key")
		}
	}
	if legacyDirectError(apiError("peer_unavailable")) != apiError("invalid_room") || legacyDirectError(apiError("invalid_peer")) != apiError("invalid_room") {
		t.Fatal("compatible room lost its original invalid_room error contract")
	}
	if legacyDirectError(apiError("nonce_conflict")) != apiError("nonce_conflict") {
		t.Fatal("compatible room hid private nonce conflicts")
	}
	failure := errors.New("private database unavailable")
	if !errors.Is(legacyDirectError(failure), failure) {
		t.Fatal("compatible private room lost its database failure cause")
	}
}
