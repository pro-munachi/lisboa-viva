package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"testing"
)

// Every receipt must describe one committed wallet state. Its newest ledger
// balance cannot disagree with its header when other purchases are in flight.
func TestWalletPostgresConcurrentReceipts(t *testing.T) {
	h := newActivityTestHarness(t)
	const buyers, purchases, readers, reads = 3, 20, 4, 30
	problems := make(chan string, buyers*purchases+readers*reads)
	start := make(chan struct{})
	var work sync.WaitGroup
	check := func(method, path string, input any) {
		response := h.request(method, path, input, h.people[0].cookie)
		var receipt walletSnapshot
		if response.Code != http.StatusOK || json.Unmarshal(response.Body.Bytes(), &receipt) != nil {
			problems <- fmt.Sprintf("invalid wallet response: status %d", response.Code)
			return
		}
		if len(receipt.Entries) == 0 || receipt.BalanceCents != receipt.Entries[0].BalanceAfterCents {
			problems <- "wallet balance and latest ledger receipt describe different states"
		}
	}
	for buyer := 0; buyer < buyers; buyer++ {
		work.Add(1)
		go func(buyer int) {
			defer work.Done()
			<-start
			for purchase := 0; purchase < purchases; purchase++ {
				check(http.MethodPost, "/v1/player/wallet/spend", walletSpendInput{
					TransactionID: activityTestNonce(500 + buyer*purchases + purchase),
					AmountCents:   100, Purpose: "travel", Description: "Concurrent city journey",
				})
			}
		}(buyer)
	}
	for reader := 0; reader < readers; reader++ {
		work.Add(1)
		go func() {
			defer work.Done()
			<-start
			for read := 0; read < reads; read++ {
				check(http.MethodGet, "/v1/player/wallet", nil)
			}
		}()
	}
	close(start)
	work.Wait()
	close(problems)
	for problem := range problems {
		t.Error(problem)
	}
	response := h.request(http.MethodGet, "/v1/player/wallet", nil, h.people[0].cookie)
	h.expectStatus(response, http.StatusOK)
	var final walletSnapshot
	if json.Unmarshal(response.Body.Bytes(), &final) != nil || final.BalanceCents != 30000-buyers*purchases*100 {
		t.Fatal("concurrent journeys did not debit each purchase exactly once")
	}
}
