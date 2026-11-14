ALTER TABLE tickets ADD COLUMN ticket_sequence BIGINT UNSIGNED NULL, ADD UNIQUE KEY tickets_sequence_uq (ticket_sequence);

UPDATE tickets JOIN (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS sequence_value FROM tickets
) AS numbered ON numbered.id = tickets.id
SET tickets.ticket_sequence = numbered.sequence_value;

ALTER TABLE tickets MODIFY ticket_sequence BIGINT UNSIGNED NOT NULL AUTO_INCREMENT;
