BEGIN;

CREATE TYPE user_type AS ENUM ('tourist', 'local');

CREATE TYPE account_status AS ENUM (
    'active',
    'suspended',
    'banned',
    'deletion_pending'
);

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    handle varchar(24) NOT NULL
        CHECK (handle ~ '^[a-z0-9_]{3,24}$'),
    email varchar(320),
    user_type user_type NOT NULL,
    account_status account_status NOT NULL DEFAULT 'active',
    preferred_locale varchar(10) NOT NULL DEFAULT 'pt-PT'
        CHECK (preferred_locale IN ('pt-PT', 'en')),
    timezone text NOT NULL DEFAULT 'Europe/Lisbon',
    adult_confirmed_at timestamptz,
    email_verified_at timestamptz,
    onboarding_completed_at timestamptz,
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE UNIQUE INDEX users_handle_unique
    ON users (lower(handle));

CREATE UNIQUE INDEX users_email_unique
    ON users (lower(email))
    WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
