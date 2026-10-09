-- Scenery XP and consequences are simulated game state, not legal fines.
CREATE TABLE scenery_actions (
    user_id uuid NOT NULL REFERENCES wallets(user_id) ON DELETE CASCADE,
    request_id uuid NOT NULL,
    object_id varchar(96) NOT NULL,
    object_kind varchar(24) NOT NULL,
    action_id varchar(32) NOT NULL,
    points smallint NOT NULL CHECK (points BETWEEN 0 AND 10),
    action_day date NOT NULL,
    fine_id uuid,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, request_id),
    CHECK (object_id ~ '^[a-zA-Z0-9][a-zA-Z0-9:_.-]{0,95}$')
);
CREATE INDEX scenery_actions_user_day_idx ON scenery_actions(user_id, action_day);
CREATE INDEX scenery_actions_object_day_idx ON scenery_actions(user_id, object_id, action_id, action_day);
CREATE INDEX scenery_actions_user_recent_idx ON scenery_actions(user_id, created_at DESC);

CREATE TABLE scenery_fines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES wallets(user_id) ON DELETE CASCADE,
    request_id uuid NOT NULL,
    amount_cents bigint NOT NULL CHECK (amount_cents IN (200,300,500)),
    description varchar(100) NOT NULL,
    created_at timestamptz NOT NULL,
    settled_at timestamptz,
    UNIQUE (user_id, request_id),
    FOREIGN KEY (user_id, request_id) REFERENCES scenery_actions(user_id, request_id) ON DELETE CASCADE
);
ALTER TABLE scenery_actions ADD CONSTRAINT scenery_action_fine_fk
    FOREIGN KEY (fine_id) REFERENCES scenery_fines(id) ON DELETE SET NULL;
CREATE INDEX scenery_fines_user_recent_idx ON scenery_fines(user_id, settled_at, created_at DESC);
