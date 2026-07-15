-- 003_collector_role.sql
-- Adds the 'collector' role, which already exists in app code (login routing,
-- nav, QR-collection handoff) but was never added to the DB enum.
--
-- ALTER TYPE ... ADD VALUE cannot run in the same transaction as a statement
-- that uses the new value, so run this on its own (no surrounding BEGIN/COMMIT
-- needed — paste and run by itself in the SQL Editor).

alter type user_role add value if not exists 'collector';
