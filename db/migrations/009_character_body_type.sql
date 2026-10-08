ALTER TABLE character_appearances
ADD COLUMN body_type text NOT NULL DEFAULT 'male'
    CHECK (body_type IN ('male', 'female'));
