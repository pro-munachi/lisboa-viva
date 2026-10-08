ALTER TABLE player_presence
    ADD COLUMN place_id varchar(145)
        CHECK (place_id IS NULL OR char_length(place_id) BETWEEN 1 AND 145);

CREATE INDEX player_presence_place_seen_idx
    ON player_presence (place_id, last_seen_at DESC)
    WHERE place_id IS NOT NULL;
