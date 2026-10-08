-- Preserve older display names, but reject whitespace in new or renamed usernames.
CREATE FUNCTION reject_handle_whitespace() RETURNS trigger AS $$
BEGIN
    IF NEW.handle ~ '[[:space:]]'
        OR NEW.handle <> translate(
            NEW.handle,
            U&'\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000',
            ''
        ) THEN
        RAISE EXCEPTION 'username cannot contain whitespace'
            USING ERRCODE = '23514', CONSTRAINT = 'users_handle_no_whitespace';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_reject_handle_whitespace
BEFORE INSERT OR UPDATE OF handle ON users
FOR EACH ROW EXECUTE FUNCTION reject_handle_whitespace();
