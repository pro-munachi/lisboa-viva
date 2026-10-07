CREATE TABLE character_appearances (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    outfit_style text NOT NULL DEFAULT 'casual'
        CHECK (outfit_style IN ('casual', 'jacket', 'dress', 'tourist')),
    top_color char(7) NOT NULL DEFAULT '#b47459'
        CHECK (top_color ~ '^#[0-9a-f]{6}$'),
    bottom_color char(7) NOT NULL DEFAULT '#34444f'
        CHECK (bottom_color ~ '^#[0-9a-f]{6}$'),
    hair_style text NOT NULL DEFAULT 'short'
        CHECK (hair_style IN ('short', 'curly', 'bob', 'bun')),
    hair_color char(7) NOT NULL DEFAULT '#302823'
        CHECK (hair_color ~ '^#[0-9a-f]{6}$'),
    skin_tone char(7) NOT NULL DEFAULT '#a87955'
        CHECK (skin_tone ~ '^#[0-9a-f]{6}$'),
    shoe_color char(7) NOT NULL DEFAULT '#eee8df'
        CHECK (shoe_color ~ '^#[0-9a-f]{6}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER character_appearances_set_updated_at
BEFORE UPDATE ON character_appearances
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

INSERT INTO character_appearances(user_id)
SELECT id FROM users
ON CONFLICT (user_id) DO NOTHING;
