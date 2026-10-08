-- Keyset pages in a busy public venue use (place_id, user_id) instead of
-- sorting every active member on each request. The existing place/seen index
-- still supports the initial live occupancy count.
CREATE INDEX player_presence_place_user_idx
    ON player_presence (place_id, user_id)
    WHERE place_id IS NOT NULL;
