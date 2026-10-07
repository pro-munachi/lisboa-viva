CREATE TABLE player_presence (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    latitude double precision NOT NULL
        CHECK (latitude BETWEEN 38.683 AND 38.832),
    longitude double precision NOT NULL
        CHECK (longitude BETWEEN -9.435 AND -9.085),
    area varchar(80) NOT NULL
        CHECK (char_length(area) BETWEEN 1 AND 80),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX player_presence_last_seen_idx
    ON player_presence (last_seen_at DESC);
