-- Network address the employee's browser used when submitting a portal ticket.
-- Recorded by the server from the request, never supplied by the client, and shown to IT only.
-- Note: the migration runner splits on semicolons, so comments must not contain them.
ALTER TABLE tickets ADD COLUMN reporter_ip VARCHAR(45) CHARACTER SET ascii COLLATE ascii_general_ci NULL AFTER anydesk_id;
