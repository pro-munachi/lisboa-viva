CREATE TABLE wallets (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    currency char(3) NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
    balance_cents bigint NOT NULL DEFAULT 30000 CHECK (balance_cents >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER wallets_set_updated_at
BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE wallet_ledger (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES wallets(user_id) ON DELETE CASCADE,
    transaction_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('opening', 'spend')),
    amount_cents bigint NOT NULL CHECK (amount_cents <> 0),
    balance_after_cents bigint NOT NULL CHECK (balance_after_cents >= 0),
    purpose text NOT NULL CHECK (purpose IN ('opening', 'travel', 'activity', 'ticket')),
    description varchar(100) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, transaction_id),
    CHECK ((kind = 'opening' AND amount_cents > 0) OR
           (kind = 'spend' AND amount_cents < 0))
);

CREATE INDEX wallet_ledger_user_recent_idx ON wallet_ledger(user_id, id DESC);

INSERT INTO wallets(user_id) SELECT id FROM users WHERE deleted_at IS NULL;
INSERT INTO wallet_ledger(user_id, transaction_id, kind, amount_cents, balance_after_cents, purpose, description)
SELECT id, id, 'opening', 30000, 30000, 'opening', 'Welcome game credits'
FROM users WHERE deleted_at IS NULL;
