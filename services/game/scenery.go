package main

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var sceneryObjectID = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9:_.-]{0,95}$`)

// Prices and XP are defined here, never accepted from the client. A consequence
// is an explicitly simulated park fine, not a statement of Lisbon law.
type sceneryRule struct {
	Points      int64
	FineCents   int64
	Description string
}

var sceneryRules = map[string]map[string]sceneryRule{
	"bench": {"sit": {Points: 5}, "relax": {Points: 5}},
	"tree": {"identify": {Points: 5}, "climb": {Points: 2, FineCents: 500, Description: "Simulated park fine: climbing a public tree"},
		"pick-fruit": {Points: 2, FineCents: 200, Description: "Simulated park fine: picking public fruit"}},
	"flowers":     {"identify": {Points: 5}, "pick-flower": {Points: 2, FineCents: 300, Description: "Simulated park fine: picking public flowers"}},
	"bin":         {"recycle": {Points: 10}},
	"fountain":    {"drink": {Points: 5}},
	"bike_rack":   {"check-bikes": {Points: 5}},
	"bus_stop":    {"read-timetable": {Points: 5}},
	"crosswalk":   {"cross-safely": {Points: 5}},
	"lamp":        {"observe": {Points: 5}},
	"street_sign": {"read-sign": {Points: 5}},
}

type sceneryActionInput struct {
	RequestID string `json:"requestId"`
	ObjectID  string `json:"objectId"`
	Kind      string `json:"kind"`
	ActionID  string `json:"actionId"`
}
type sceneryFine struct {
	ID          string `json:"id"`
	AmountCents int64  `json:"amountCents"`
	Description string `json:"description"`
	Settled     bool   `json:"settled"`
}
type scenerySnapshot struct {
	TotalPoints int64         `json:"totalPoints"`
	Fines       []sceneryFine `json:"fines"`
}
type sceneryActionResult struct {
	Points      int64        `json:"points"`
	TotalPoints int64        `json:"totalPoints"`
	Fine        *sceneryFine `json:"fine,omitempty"`
}
type scenerySettlementResult struct {
	scenerySnapshot
	Wallet walletSnapshot `json:"wallet"`
}

type sceneryReader interface {
	QueryRow(context.Context, string, ...any) pgx.Row
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

func normalizeSceneryInput(input sceneryActionInput) (sceneryActionInput, sceneryRule, error) {
	rule, exists := sceneryRules[input.Kind][input.ActionID]
	if !exists || !walletTransactionID.MatchString(input.RequestID) ||
		input.RequestID == "00000000-0000-0000-0000-000000000000" || !sceneryObjectID.MatchString(input.ObjectID) ||
		(input.ActionID == "pick-fruit" && !strings.HasPrefix(input.ObjectID, "fruit-tree:")) {
		return input, sceneryRule{}, apiError("invalid_scenery_action")
	}
	input.RequestID = strings.ToLower(input.RequestID)
	return input, rule, nil
}

func loadScenerySnapshot(ctx context.Context, reader sceneryReader, userID string) (scenerySnapshot, error) {
	result := scenerySnapshot{Fines: []sceneryFine{}}
	if err := reader.QueryRow(ctx, `SELECT COALESCE(sum(points),0)::bigint FROM scenery_actions WHERE user_id=$1`, userID).Scan(&result.TotalPoints); err != nil {
		return result, err
	}
	rows, err := reader.Query(ctx, `SELECT id::text,amount_cents,description,(settled_at IS NOT NULL)
        FROM scenery_fines WHERE user_id=$1 ORDER BY (settled_at IS NOT NULL),created_at DESC,id DESC LIMIT 100`, userID)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var fine sceneryFine
		if err = rows.Scan(&fine.ID, &fine.AmountCents, &fine.Description, &fine.Settled); err != nil {
			return result, err
		}
		result.Fines = append(result.Fines, fine)
	}
	return result, rows.Err()
}

func (s *server) getScenery(w http.ResponseWriter, r *http.Request) {
	tx, err := s.db.BeginTx(r.Context(), pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		fail(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	result, err := loadScenerySnapshot(r.Context(), tx, currentUser(r).ID)
	if err != nil {
		fail(w, err)
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusOK, result)
}

func sceneryActionResponse(ctx context.Context, tx pgx.Tx, userID string, points int64, fineID *string) (sceneryActionResult, error) {
	result := sceneryActionResult{Points: points}
	err := tx.QueryRow(ctx, `SELECT COALESCE(sum(points),0)::bigint FROM scenery_actions WHERE user_id=$1`, userID).Scan(&result.TotalPoints)
	if err != nil {
		return result, err
	}
	if fineID != nil {
		result.Fine = &sceneryFine{}
		err = tx.QueryRow(ctx, `SELECT id::text,amount_cents,description,(settled_at IS NOT NULL)
            FROM scenery_fines WHERE user_id=$1 AND id=$2`, userID, *fineID).Scan(&result.Fine.ID, &result.Fine.AmountCents, &result.Fine.Description, &result.Fine.Settled)
	}
	return result, err
}

func (s *server) performScenery(w http.ResponseWriter, r *http.Request) {
	var input sceneryActionInput
	if err := decodeJSON(r, &input); err != nil {
		fail(w, err)
		return
	}
	input, rule, err := normalizeSceneryInput(input)
	if err != nil {
		fail(w, err)
		return
	}
	ctx, userID := r.Context(), currentUser(r).ID
	tx, err := s.db.Begin(ctx)
	if err != nil {
		fail(w, err)
		return
	}
	defer tx.Rollback(ctx)
	// All XP and fine changes share the existing wallet lock. Parallel actions,
	// spending and settlement therefore serialize for the same trusted user.
	var balance int64
	if err = tx.QueryRow(ctx, `SELECT balance_cents FROM wallets WHERE user_id=$1 FOR UPDATE`, userID).Scan(&balance); err != nil {
		fail(w, err)
		return
	}
	var previous sceneryActionInput
	var points int64
	var fineID *string
	err = tx.QueryRow(ctx, `SELECT object_id,object_kind,action_id,points,fine_id::text
        FROM scenery_actions WHERE user_id=$1 AND request_id=$2`, userID, input.RequestID).
		Scan(&previous.ObjectID, &previous.Kind, &previous.ActionID, &points, &fineID)
	if err == nil {
		if previous.ObjectID != input.ObjectID || previous.Kind != input.Kind || previous.ActionID != input.ActionID {
			fail(w, apiError("scenery_conflict"))
			return
		}
		result, responseErr := sceneryActionResponse(ctx, tx, userID, points, fineID)
		if responseErr != nil {
			fail(w, responseErr)
			return
		}
		if err = tx.Commit(ctx); err != nil {
			fail(w, err)
			return
		}
		respond(w, http.StatusOK, result)
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		fail(w, err)
		return
	}
	now := s.now().UTC()
	day := now.Format("2006-01-02")
	var recent *time.Time
	if err = tx.QueryRow(ctx, `SELECT max(created_at) FROM scenery_actions WHERE user_id=$1`, userID).Scan(&recent); err != nil {
		fail(w, err)
		return
	}
	if recent != nil && now.Sub(*recent) < 10*time.Second {
		fail(w, apiError("scenery_cooldown"))
		return
	}
	var daily int64
	if err = tx.QueryRow(ctx, `SELECT COALESCE(sum(points),0)::bigint FROM scenery_actions WHERE user_id=$1 AND action_day=$2::date`, userID, day).Scan(&daily); err != nil {
		fail(w, err)
		return
	}
	// A second deliberate visit does not award another daily reward or issue a
	// duplicate fine for the same object/action. A retry token is kept separately.
	var originalFine *string
	err = tx.QueryRow(ctx, `SELECT fine_id::text FROM scenery_actions
        WHERE user_id=$1 AND object_id=$2 AND object_kind=$3 AND action_id=$4 AND action_day=$5::date
        ORDER BY created_at,request_id LIMIT 1`, userID, input.ObjectID, input.Kind, input.ActionID, day).Scan(&originalFine)
	alreadyToday := err == nil
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		fail(w, err)
		return
	}
	points = rule.Points
	if alreadyToday {
		points = 0
		fineID = originalFine
	}
	if remaining := int64(200) - daily; remaining < points {
		points = remaining
	}
	if points < 0 {
		points = 0
	}
	if rule.FineCents > 0 && !alreadyToday {
		var pending int
		if err = tx.QueryRow(ctx, `SELECT count(*) FROM scenery_fines WHERE user_id=$1 AND settled_at IS NULL`, userID).Scan(&pending); err != nil {
			fail(w, err)
			return
		}
		if pending >= 50 {
			fail(w, apiError("scenery_fines_full"))
			return
		}
	}
	_, err = tx.Exec(ctx, `INSERT INTO scenery_actions(user_id,request_id,object_id,object_kind,action_id,points,action_day,fine_id,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7::date,$8,$9)`, userID, input.RequestID, input.ObjectID, input.Kind, input.ActionID, points, day, fineID, now)
	if err != nil {
		fail(w, err)
		return
	}
	if rule.FineCents > 0 && !alreadyToday {
		var id string
		err = tx.QueryRow(ctx, `INSERT INTO scenery_fines(user_id,request_id,amount_cents,description,created_at)
            VALUES($1,$2,$3,$4,$5) RETURNING id::text`, userID, input.RequestID, rule.FineCents, rule.Description, now).Scan(&id)
		if err == nil {
			_, err = tx.Exec(ctx, `UPDATE scenery_actions SET fine_id=$3 WHERE user_id=$1 AND request_id=$2`, userID, input.RequestID, id)
		}
		if err != nil {
			fail(w, err)
			return
		}
		fineID = &id
	}
	result, err := sceneryActionResponse(ctx, tx, userID, points, fineID)
	if err != nil {
		fail(w, err)
		return
	}
	if err = tx.Commit(ctx); err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusOK, result)
}

func (s *server) settleScenery(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !walletTransactionID.MatchString(id) || id == "00000000-0000-0000-0000-000000000000" {
		fail(w, apiError("invalid_scenery_action"))
		return
	}
	id = strings.ToLower(id)
	ctx, userID := r.Context(), currentUser(r).ID
	tx, err := s.db.Begin(ctx)
	if err != nil {
		fail(w, err)
		return
	}
	defer tx.Rollback(ctx)
	var balance, amount int64
	if err = tx.QueryRow(ctx, `SELECT balance_cents FROM wallets WHERE user_id=$1 FOR UPDATE`, userID).Scan(&balance); err != nil {
		fail(w, err)
		return
	}
	var description string
	var settled *time.Time
	err = tx.QueryRow(ctx, `SELECT amount_cents,description,settled_at FROM scenery_fines WHERE user_id=$1 AND id=$2 FOR UPDATE`, userID, id).Scan(&amount, &description, &settled)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, apiError("scenery_fine_unavailable"))
		return
	}
	if err != nil {
		fail(w, err)
		return
	}
	if settled == nil {
		if balance < amount {
			fail(w, apiError("insufficient_funds"))
			return
		}
		// A client cannot collide its generic wallet request UUID with this fine
		// to mark an unrelated purchase settled. Such a conflict fails unchanged.
		var collision bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM wallet_ledger WHERE user_id=$1 AND transaction_id=$2)`, userID, id).Scan(&collision); err != nil {
			fail(w, err)
			return
		}
		if collision {
			fail(w, apiError("wallet_conflict"))
			return
		}
		newBalance := balance - amount
		if _, err = tx.Exec(ctx, `UPDATE wallets SET balance_cents=$2 WHERE user_id=$1`, userID, newBalance); err == nil {
			_, err = tx.Exec(ctx, `INSERT INTO wallet_ledger(user_id,transaction_id,kind,amount_cents,balance_after_cents,purpose,description)
                VALUES($1,$2,'spend',$3,$4,'activity',$5)`, userID, id, -amount, newBalance, description)
		}
		if err == nil {
			_, err = tx.Exec(ctx, `UPDATE scenery_fines SET settled_at=$3 WHERE user_id=$1 AND id=$2`, userID, id, s.now().UTC())
		}
		if err != nil {
			fail(w, err)
			return
		}
	}
	snapshot, err := loadScenerySnapshot(ctx, tx, userID)
	if err != nil {
		fail(w, err)
		return
	}
	wallet, err := loadWalletSnapshot(ctx, tx, userID)
	if err != nil {
		fail(w, err)
		return
	}
	if err = tx.Commit(ctx); err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusOK, scenerySettlementResult{scenerySnapshot: snapshot, Wallet: wallet})
}
