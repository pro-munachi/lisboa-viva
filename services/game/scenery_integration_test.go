package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

// Reuse the existing loopback-only, random-schema fixture. It never opens an
// application account, and cleanup is independently confirmed by the harness.
func sceneryHarness(t *testing.T) (*activityTestHarness, *time.Time) {
	t.Helper()
	h := newActivityTestHarness(t)
	now := time.Now().UTC()
	s := newServer(h.pool, false)
	s.now = func() time.Time { return now }
	h.handler = s.routes()
	return h, &now
}
func sceneryTestInput(n int, kind, action string) sceneryActionInput {
	return sceneryActionInput{RequestID: activityTestNonce(n), ObjectID: fmt.Sprintf("lisbon:%s:%d", kind, n), Kind: kind, ActionID: action}
}
func sceneryResult(t *testing.T, response *httptest.ResponseRecorder) sceneryActionResult {
	t.Helper()
	var result sceneryActionResult
	if json.Unmarshal(response.Body.Bytes(), &result) != nil {
		t.Fatal("invalid scenery response")
	}
	return result
}
func sceneryTestSnapshot(t *testing.T, h *activityTestHarness, person int) scenerySnapshot {
	t.Helper()
	response := h.request(http.MethodGet, "/v1/player/scenery", nil, h.people[person].cookie)
	h.expectStatus(response, http.StatusOK)
	var result scenerySnapshot
	if json.Unmarshal(response.Body.Bytes(), &result) != nil {
		t.Fatal("invalid persisted scenery snapshot")
	}
	return result
}
func sceneryTestSettlement(t *testing.T, response *httptest.ResponseRecorder) scenerySettlementResult {
	t.Helper()
	var result scenerySettlementResult
	if json.Unmarshal(response.Body.Bytes(), &result) != nil || result.Wallet.Currency != "EUR" {
		t.Fatal("invalid scenery settlement envelope")
	}
	return result
}

func TestSceneryPostgresRewardsRetriesFinePrivacyAndSettlement(t *testing.T) {
	h, now := sceneryHarness(t)
	if initial := sceneryTestSnapshot(t, h, 0); initial.TotalPoints != 0 || len(initial.Fines) != 0 {
		t.Fatal("new account did not start with empty scenery state")
	}
	input := sceneryTestInput(1, "bench", "sit")
	send := func(value sceneryActionInput) sceneryActionResult {
		response := h.request(http.MethodPost, "/v1/player/scenery", value, h.people[0].cookie)
		h.expectStatus(response, http.StatusOK)
		return sceneryResult(t, response)
	}
	if result := send(input); result.Points != 5 || result.TotalPoints != 5 || result.Fine != nil {
		t.Fatal("bench action did not award exactly 5 XP")
	}
	if result := send(input); result.Points != 5 || result.TotalPoints != 5 {
		t.Fatal("identical retry mutated XP")
	}
	changed := input
	changed.ObjectID = "different:bench"
	h.expectStatus(h.request(http.MethodPost, "/v1/player/scenery", changed, h.people[0].cookie), http.StatusConflict)
	next := sceneryTestInput(2, "bench", "relax")
	h.expectStatus(h.request(http.MethodPost, "/v1/player/scenery", next, h.people[0].cookie), http.StatusTooManyRequests)
	*now = now.Add(11 * time.Second)
	revisit := input
	revisit.RequestID = activityTestNonce(3)
	if result := send(revisit); result.Points != 0 || result.TotalPoints != 5 {
		t.Fatal("second request token farmed the same daily reward")
	}
	h.expectStatus(h.request(http.MethodPost, "/v1/player/scenery", map[string]any{
		"requestId": activityTestNonce(4), "objectId": "bench:bad", "kind": "bench", "actionId": "sit", "amountCents": 10000,
	}, h.people[0].cookie), http.StatusBadRequest)
	*now = now.Add(11 * time.Second)
	climbing := sceneryTestInput(5, "tree", "climb")
	result := send(climbing)
	if result.Points != 2 || result.TotalPoints != 7 || result.Fine == nil || result.Fine.AmountCents != 500 || result.Fine.Settled {
		t.Fatal("climbing consequence or XP was not server controlled")
	}
	climbID := result.Fine.ID
	var balance int64
	if h.pool.QueryRow(h.ctx, `SELECT balance_cents FROM wallets WHERE user_id=$1`, h.people[0].user.ID).Scan(&balance) != nil || balance != 30000 {
		t.Fatal("a pending fine debited the wallet before settlement")
	}
	invalidFruit := sceneryTestInput(6, "tree", "pick-fruit")
	h.expectStatus(h.request(http.MethodPost, "/v1/player/scenery", invalidFruit, h.people[0].cookie), http.StatusBadRequest)
	*now = now.Add(11 * time.Second)
	fruit := invalidFruit
	fruit.ObjectID = "fruit-tree:illustrated-olive-1"
	if result := send(fruit); result.Fine == nil || result.Fine.AmountCents != 200 {
		t.Fatal("fruit consequence differs from the fixed catalog")
	}
	*now = now.Add(11 * time.Second)
	flower := send(sceneryTestInput(7, "flowers", "pick-flower"))
	if flower.Fine == nil || flower.Fine.AmountCents != 300 {
		t.Fatal("flower consequence differs from the fixed catalog")
	}
	state := sceneryTestSnapshot(t, h, 0)
	if state.TotalPoints != 11 || len(state.Fines) != 3 {
		t.Fatal("scenery XP or fine state did not persist")
	}
	if other := sceneryTestSnapshot(t, h, 1); other.TotalPoints != 0 || len(other.Fines) != 0 {
		t.Fatal("another account observed private scenery state")
	}
	path := "/v1/player/scenery/fines/" + climbID + "/settle"
	h.expectStatus(h.request(http.MethodPost, path, nil, h.people[1].cookie), http.StatusNotFound)
	response := h.request(http.MethodPost, path, nil, h.people[0].cookie)
	h.expectStatus(response, http.StatusOK)
	paid := sceneryTestSettlement(t, response)
	if paid.TotalPoints != 11 || paid.Wallet.BalanceCents != 29500 || len(paid.Wallet.Entries) != 2 || paid.Wallet.Entries[0].AmountCents != -500 || paid.Wallet.Entries[0].Purpose != "activity" {
		t.Fatal("fine settlement did not atomically debit the existing wallet and ledger")
	}
	response = h.request(http.MethodPost, path, nil, h.people[0].cookie)
	h.expectStatus(response, http.StatusOK)
	again := sceneryTestSettlement(t, response)
	if again.Wallet.BalanceCents != 29500 || len(again.Wallet.Entries) != 2 {
		t.Fatal("fine retry debited the wallet twice")
	}
	if result := send(climbing); result.Fine == nil || !result.Fine.Settled || result.TotalPoints != 11 {
		t.Fatal("retry lost settled fine state")
	}
	if _, err := h.pool.Exec(h.ctx, `UPDATE wallets SET balance_cents=200 WHERE user_id=$1`, h.people[0].user.ID); err != nil {
		t.Fatal(err)
	}
	flowerPath := "/v1/player/scenery/fines/" + flower.Fine.ID + "/settle"
	h.expectStatus(h.request(http.MethodPost, flowerPath, nil, h.people[0].cookie), http.StatusConflict)
	var settled bool
	if h.pool.QueryRow(h.ctx, `SELECT settled_at IS NOT NULL FROM scenery_fines WHERE id=$1`, flower.Fine.ID).Scan(&settled) != nil || settled {
		t.Fatal("insufficient funds marked the fine paid")
	}
	if h.pool.QueryRow(h.ctx, `SELECT balance_cents FROM wallets WHERE user_id=$1`, h.people[0].user.ID).Scan(&balance) != nil || balance != 200 {
		t.Fatal("failed settlement changed balance")
	}
}

func TestSceneryPostgresDailyCapAndDayRollover(t *testing.T) {
	h, now := sceneryHarness(t)
	for n := 1; n <= 21; n++ {
		*now = now.Add(11 * time.Second)
		response := h.request(http.MethodPost, "/v1/player/scenery", sceneryTestInput(n, "bin", "recycle"), h.people[0].cookie)
		h.expectStatus(response, http.StatusOK)
		result := sceneryResult(t, response)
		want := int64(10)
		if n == 21 {
			want = 0
		}
		if result.Points != want || result.TotalPoints > 200 {
			t.Fatalf("daily scenery cap failed at action %d", n)
		}
	}
	if state := sceneryTestSnapshot(t, h, 0); state.TotalPoints != 200 {
		t.Fatal("daily XP did not persist at the cap")
	}
	*now = now.Add(24 * time.Hour)
	input := sceneryTestInput(22, "bin", "recycle")
	input.ObjectID = "lisbon:bin:1"
	response := h.request(http.MethodPost, "/v1/player/scenery", input, h.people[0].cookie)
	h.expectStatus(response, http.StatusOK)
	if result := sceneryResult(t, response); result.Points != 10 || result.TotalPoints != 210 {
		t.Fatal("new UTC day did not reopen the reward allowance")
	}
}

func TestSceneryPostgresConcurrentRetriesAndWalletSettlement(t *testing.T) {
	h, _ := sceneryHarness(t)
	input := sceneryTestInput(1, "tree", "climb")
	responses := make(chan *httptest.ResponseRecorder, 12)
	var pending sync.WaitGroup
	for n := 0; n < 12; n++ {
		pending.Add(1)
		go func() {
			defer pending.Done()
			responses <- h.request(http.MethodPost, "/v1/player/scenery", input, h.people[0].cookie)
		}()
	}
	pending.Wait()
	close(responses)
	var fineID string
	for response := range responses {
		h.expectStatus(response, http.StatusOK)
		result := sceneryResult(t, response)
		if result.Points != 2 || result.TotalPoints != 2 || result.Fine == nil {
			t.Fatal("parallel retry did not replay one committed action")
		}
		if fineID != "" && fineID != result.Fine.ID {
			t.Fatal("parallel retries created different fines")
		}
		fineID = result.Fine.ID
	}
	var actions, fines int
	if h.pool.QueryRow(h.ctx, `SELECT count(*) FROM scenery_actions WHERE user_id=$1`, h.people[0].user.ID).Scan(&actions) != nil || actions != 1 {
		t.Fatal("parallel action replay inserted duplicate rewards")
	}
	if h.pool.QueryRow(h.ctx, `SELECT count(*) FROM scenery_fines WHERE user_id=$1`, h.people[0].user.ID).Scan(&fines) != nil || fines != 1 {
		t.Fatal("parallel action replay inserted duplicate consequences")
	}
	settleResponses := make(chan *httptest.ResponseRecorder, 8)
	for n := 0; n < 8; n++ {
		pending.Add(1)
		go func() {
			defer pending.Done()
			settleResponses <- h.request(http.MethodPost, "/v1/player/scenery/fines/"+fineID+"/settle", nil, h.people[0].cookie)
		}()
	}
	spend := walletSpendInput{TransactionID: activityTestNonce(99), AmountCents: 300, Purpose: "travel", Description: "Bus to Baixa"}
	spendResult := make(chan *httptest.ResponseRecorder, 1)
	pending.Add(1)
	go func() {
		defer pending.Done()
		spendResult <- h.request(http.MethodPost, "/v1/player/wallet/spend", spend, h.people[0].cookie)
	}()
	pending.Wait()
	close(settleResponses)
	for response := range settleResponses {
		h.expectStatus(response, http.StatusOK)
	}
	h.expectStatus(<-spendResult, http.StatusOK)
	var balance int64
	var fees int
	if h.pool.QueryRow(h.ctx, `SELECT balance_cents FROM wallets WHERE user_id=$1`, h.people[0].user.ID).Scan(&balance) != nil || balance != 29200 {
		t.Fatal("concurrent fine and travel spend lost or repeated a debit")
	}
	if h.pool.QueryRow(h.ctx, `SELECT count(*) FROM wallet_ledger WHERE user_id=$1 AND transaction_id=$2`, h.people[0].user.ID, fineID).Scan(&fees) != nil || fees != 1 {
		t.Fatal("concurrent settlement did not create exactly one fine ledger entry")
	}
}
