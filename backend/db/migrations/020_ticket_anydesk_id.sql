-- Optional AnyDesk remote-support ID captured when a ticket is created.
-- It is a ticket-time snapshot. Existing tickets keep NULL and are not rewritten.
-- Note: the migration runner splits on semicolons, so comments must not contain them.
ALTER TABLE tickets ADD COLUMN anydesk_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NULL AFTER reporter_phone;
