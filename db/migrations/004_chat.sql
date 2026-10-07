CREATE TABLE chat_messages (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room varchar(160) NOT NULL,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id uuid NOT NULL,
    body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
    sent_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chat_messages_account_nonce_unique UNIQUE (user_id, client_id)
);

CREATE INDEX chat_messages_room_cursor_idx ON chat_messages (room, id);
