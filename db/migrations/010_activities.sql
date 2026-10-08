-- These credits are simulated game currency, with no cash value or payments.
CREATE TABLE activity_wallets (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance integer NOT NULL DEFAULT 200 CHECK (balance >= 0),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE activities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title varchar(80) NOT NULL CHECK (char_length(title) BETWEEN 3 AND 80),
    category text NOT NULL CHECK (category IN ('nightlife','coffee','outdoors','culture','wellness')),
    traveller_type text NOT NULL CHECK (traveller_type IN ('everyone','tourist','nomad','expat','local')),
    venue_id varchar(145) NOT NULL,
    starts_at timestamptz NOT NULL,
    capacity integer NOT NULL CHECK (capacity BETWEEN 2 AND 12),
    client_id uuid NOT NULL,
    creation_payload text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    closed_at timestamptz,
    CONSTRAINT activities_host_nonce_unique UNIQUE (host_id, client_id)
);
CREATE INDEX activities_discovery_idx ON activities (starts_at, created_at DESC) WHERE closed_at IS NULL;

CREATE TABLE activity_members (
    activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    social_opt_in boolean NOT NULL DEFAULT false,
    left_at timestamptz,
    PRIMARY KEY (activity_id,user_id)
);
CREATE INDEX activity_members_account_idx ON activity_members (user_id,activity_id) WHERE left_at IS NULL;

CREATE TABLE activity_messages (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id uuid NOT NULL,
    body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
    sent_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT activity_messages_account_nonce_unique UNIQUE (user_id,client_id)
);
CREATE INDEX activity_messages_room_cursor_idx ON activity_messages (activity_id,id DESC);

CREATE TABLE activity_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id uuid REFERENCES users(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('drink','dance','wave','compliment','flirt','challenge','accept-challenge','decline-challenge')),
    label text NOT NULL,
    invite_id uuid,
    client_id uuid NOT NULL,
    action_payload text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT activity_events_actor_nonce_unique UNIQUE (actor_id,client_id)
);
CREATE INDEX activity_events_room_cursor_idx ON activity_events (activity_id,sequence DESC);

CREATE TABLE activity_invitations (
    id uuid PRIMARY KEY REFERENCES activity_events(id) ON DELETE CASCADE,
    activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_joined_at timestamptz NOT NULL,
    target_joined_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired')),
    expires_at timestamptz NOT NULL,
    resolved_event_id uuid UNIQUE REFERENCES activity_events(id) ON DELETE CASCADE,
    CHECK (actor_id <> target_id),
    CHECK ((status IN ('pending','expired') AND resolved_event_id IS NULL)
        OR (status IN ('accepted','declined') AND resolved_event_id IS NOT NULL))
);
CREATE UNIQUE INDEX activity_invitations_pending_pair_idx
    ON activity_invitations (activity_id,actor_id,target_id) WHERE status='pending';

CREATE TABLE activity_credit_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES activity_wallets(user_id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('initial','drink')),
    delta integer NOT NULL,
    event_id uuid UNIQUE REFERENCES activity_events(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK ((kind='initial' AND delta=200 AND event_id IS NULL)
        OR (kind='drink' AND delta IN (-8,-12,-15) AND event_id IS NOT NULL))
);
CREATE UNIQUE INDEX activity_credit_ledger_initial_idx ON activity_credit_ledger (user_id) WHERE kind='initial';
CREATE INDEX activity_credit_ledger_account_idx ON activity_credit_ledger (user_id,created_at);
