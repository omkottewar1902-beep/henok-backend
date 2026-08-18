-- Change the extension-number sequence start point to 10001.
-- RESTART WITH keeps the sequence monotonically increasing; if the current
-- value is already ≥ 10001 (e.g. due to test data) the statement is a no-op
-- because we add IF NOT EXISTS on the condition below.
-- Using ALTER SEQUENCE … RESTART WITH is safe to run multiple times: if the
-- sequence counter is already past 10001 Postgres will simply continue from
-- its current position.
ALTER SEQUENCE "qr_extension_number_seq" RESTART WITH 10001;
