-- A private conversation has one store across the legacy room and inbox APIs.
-- Readers retain old messages; imports receive new direct_messages cursor IDs.
LOCK TABLE chat_messages IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE direct_messages IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM chat_messages
        WHERE room LIKE 'direct:%'
        AND room !~ '^direct:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    ) THEN
        RAISE EXCEPTION 'legacy private chat contains an unrecognized pair key; reconcile before migrating';
    END IF;
END;
$$;

CREATE TEMPORARY TABLE legacy_direct_import ON COMMIT DROP AS
SELECT id AS legacy_id, user_id AS sender_id,
    split_part(room, ':', 2)::uuid AS first_id,
    split_part(room, ':', 3)::uuid AS second_id,
    CASE WHEN user_id=split_part(room, ':', 2)::uuid
        THEN split_part(room, ':', 3)::uuid
        ELSE split_part(room, ':', 2)::uuid END AS recipient_id,
    client_id, body, sent_at
FROM chat_messages
WHERE room LIKE 'direct:%';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM legacy_direct_import l
        WHERE l.first_id=l.second_id OR l.sender_id NOT IN (l.first_id,l.second_id)
        OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id=l.recipient_id)
    ) THEN
        RAISE EXCEPTION 'legacy private chat contains an invalid or missing participant; reconcile before migrating';
    END IF;
    IF EXISTS (
        SELECT 1 FROM legacy_direct_import l
        JOIN direct_messages d ON d.sender_id=l.sender_id AND d.client_id=l.client_id
        WHERE d.recipient_id<>l.recipient_id OR d.body<>l.body OR d.sent_at<>l.sent_at
    ) THEN
        RAISE EXCEPTION 'legacy private chat conflicts with an existing sender nonce; reconcile before migrating';
    END IF;
END;
$$;

INSERT INTO direct_messages(sender_id,recipient_id,client_id,body,sent_at)
SELECT l.sender_id,l.recipient_id,l.client_id,l.body,l.sent_at
FROM legacy_direct_import l
WHERE NOT EXISTS (
    SELECT 1 FROM direct_messages d WHERE d.sender_id=l.sender_id AND d.client_id=l.client_id
)
ORDER BY l.legacy_id;

-- Source rows remain as a recoverable record. Both public APIs now read only
-- direct_messages for private conversations, never the internal legacy keys.
