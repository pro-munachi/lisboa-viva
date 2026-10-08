CREATE TABLE player_homes (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    city_id text NOT NULL DEFAULT 'lisbon' CHECK (city_id = 'lisbon'),
    district text NOT NULL DEFAULT 'Graça' CHECK (district IN ('Graça', 'Baixa', 'Alfama')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO player_homes(user_id)
SELECT id FROM users WHERE deleted_at IS NULL;

CREATE TRIGGER player_homes_set_updated_at
BEFORE UPDATE ON player_homes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
