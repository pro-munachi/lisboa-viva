ALTER TABLE users ALTER COLUMN handle TYPE varchar(40);

ALTER TABLE users DROP CONSTRAINT users_handle_check;
ALTER TABLE users ADD CONSTRAINT users_handle_display_check CHECK (
    char_length(handle) BETWEEN 2 AND 40
    AND handle = btrim(handle)
    AND position('@' IN handle) = 0
    AND handle !~ '[[:cntrl:]]'
);
