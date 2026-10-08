package main

import (
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

var walletTransactionID = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type walletEntry struct {
	ID                int64     `json:"id"`
	TransactionID     string    `json:"transactionId"`
	Kind              string    `json:"kind"`
	AmountCents       int64     `json:"amountCents"`
	BalanceAfterCents int64     `json:"balanceAfterCents"`
	Purpose           string    `json:"purpose"`
	Description       string    `json:"description"`
	CreatedAt         time.Time `json:"createdAt"`
}

type walletSnapshot struct {
	Currency     string        `json:"currency"`
	BalanceCents int64         `json:"balanceCents"`
	Entries      []walletEntry `json:"entries"`
}

type walletSpendInput struct {
	TransactionID string `json:"transactionId"`
	AmountCents   int64  `json:"amountCents"`
	Purpose       string `json:"purpose"`
	Description   string `json:"description"`
}

func validWalletSpend(input walletSpendInput) bool {
	input.Description = strings.TrimSpace(input.Description)
	if !walletTransactionID.MatchString(input.TransactionID) || input.AmountCents < 1 || input.AmountCents > 500000 ||
		(input.Purpose != "travel" && input.Purpose != "activity" && input.Purpose != "ticket") ||
		utf8.RuneCountInString(input.Description) < 1 || utf8.RuneCountInString(input.Description) > 100 {
		return false
	}
	for _, r := range input.Description {
		if unicode.IsControl(r) || unicode.Is(unicode.Cf, r) {
			return false
		}
	}
	return true
}

func (s *server) getWallet(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	var snapshot walletSnapshot
	err := s.db.QueryRow(r.Context(), `SELECT currency,balance_cents FROM wallets WHERE user_id=$1`, user.ID).Scan(&snapshot.Currency, &snapshot.BalanceCents)
	if err != nil {
		fail(w, err)
		return
	}
	snapshot.Entries = []walletEntry{}
	rows, err := s.db.Query(r.Context(), `SELECT id,transaction_id::text,kind,amount_cents,balance_after_cents,purpose,description,created_at
		FROM wallet_ledger WHERE user_id=$1 ORDER BY id DESC LIMIT 20`, user.ID)
	if err != nil {
		fail(w, err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var entry walletEntry
		if err = rows.Scan(&entry.ID, &entry.TransactionID, &entry.Kind, &entry.AmountCents, &entry.BalanceAfterCents, &entry.Purpose, &entry.Description, &entry.CreatedAt); err != nil {
			fail(w, err)
			return
		}
		snapshot.Entries = append(snapshot.Entries, entry)
	}
	if err = rows.Err(); err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusOK, snapshot)
}

func (s *server) spendWallet(w http.ResponseWriter, r *http.Request) {
	var input walletSpendInput
	if err := decodeJSON(r, &input); err != nil {
		fail(w, err)
		return
	}
	input.Description = strings.TrimSpace(input.Description)
	if !validWalletSpend(input) {
		fail(w, apiError("invalid_wallet_spend"))
		return
	}
	user := currentUser(r)
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var balance int64
	err = tx.QueryRow(r.Context(), `SELECT balance_cents FROM wallets WHERE user_id=$1 FOR UPDATE`, user.ID).Scan(&balance)
	if err != nil {
		fail(w, err)
		return
	}
	var oldAmount int64
	var oldPurpose, oldDescription string
	err = tx.QueryRow(r.Context(), `SELECT amount_cents,purpose,description FROM wallet_ledger
		WHERE user_id=$1 AND transaction_id=$2`, user.ID, input.TransactionID).Scan(&oldAmount, &oldPurpose, &oldDescription)
	if err == nil {
		if oldAmount != -input.AmountCents || oldPurpose != input.Purpose || oldDescription != input.Description {
			fail(w, apiError("wallet_conflict"))
			return
		}
		if err = tx.Commit(r.Context()); err != nil {
			fail(w, err)
			return
		}
		s.getWallet(w, r)
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		fail(w, err)
		return
	}
	if balance < input.AmountCents {
		fail(w, apiError("insufficient_funds"))
		return
	}
	newBalance := balance - input.AmountCents
	_, err = tx.Exec(r.Context(), `UPDATE wallets SET balance_cents=$2 WHERE user_id=$1`, user.ID, newBalance)
	if err == nil {
		_, err = tx.Exec(r.Context(), `INSERT INTO wallet_ledger
			(user_id,transaction_id,kind,amount_cents,balance_after_cents,purpose,description)
			VALUES($1,$2,'spend',$3,$4,$5,$6)`, user.ID, input.TransactionID, -input.AmountCents, newBalance, input.Purpose, input.Description)
	}
	if err != nil {
		fail(w, err)
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		fail(w, err)
		return
	}
	s.getWallet(w, r)
}
