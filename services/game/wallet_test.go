package main

import "testing"

func TestValidWalletSpend(t *testing.T) {
	base := walletSpendInput{
		TransactionID: "30202de8-c29c-435c-b224-fd958398b389",
		AmountCents:   300,
		Purpose:       "travel",
		Description:   "Bus to Baixa",
	}
	if !validWalletSpend(base) {
		t.Fatal("valid transport debit rejected")
	}
	for _, change := range []func(*walletSpendInput){
		func(v *walletSpendInput) { v.TransactionID = "not-a-uuid" },
		func(v *walletSpendInput) { v.AmountCents = 0 },
		func(v *walletSpendInput) { v.AmountCents = -300 },
		func(v *walletSpendInput) { v.Purpose = "opening" },
		func(v *walletSpendInput) { v.Description = "\n" },
	} {
		input := base
		change(&input)
		if validWalletSpend(input) {
			t.Fatalf("invalid wallet debit accepted: %+v", input)
		}
	}
}
