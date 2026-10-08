CREATE TABLE direct_messages (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id uuid NOT NULL,
    body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
    sent_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT direct_messages_other_account CHECK (sender_id <> recipient_id),
    CONSTRAINT direct_messages_sender_nonce_unique UNIQUE (sender_id, client_id)
);

CREATE INDEX direct_messages_pair_cursor_idx
    ON direct_messages (LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id), id);
CREATE INDEX direct_messages_sender_recent_idx ON direct_messages (sender_id, id DESC);
CREATE INDEX direct_messages_recipient_recent_idx ON direct_messages (recipient_id, id DESC);
