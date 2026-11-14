ALTER TABLE tickets
  ADD COLUMN assigned_by_technician_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN assigned_by_technician_name VARCHAR(160) NULL,
  ADD COLUMN pending_reason TEXT NULL,
  ADD COLUMN pending_at DATETIME(3) NULL,
  ADD COLUMN solution_description TEXT NULL,
  ADD COLUMN resolved_at DATETIME(3) NULL,
  ADD COLUMN resolution_confirmed_at DATETIME(3) NULL,
  ADD COLUMN reopening_reason TEXT NULL,
  ADD COLUMN reopened_at DATETIME(3) NULL,
  ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 0,
  ADD CONSTRAINT tickets_self_assigner_fk FOREIGN KEY (assigned_by_technician_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE ticket_history
  MODIFY COLUMN type ENUM('status', 'assignment', 'claim', 'technician_note', 'comment', 'resolution', 'confirmation', 'reopened') NOT NULL,
  MODIFY COLUMN sequence_number BIGINT NOT NULL,
  ADD COLUMN note TEXT NULL,
  ADD COLUMN visibility ENUM('public', 'internal') NOT NULL DEFAULT 'public',
  ADD COLUMN event_data JSON NULL;

UPDATE ticket_history h JOIN tickets t ON t.id = h.ticket_id
SET h.event_data = JSON_OBJECT('technicianId', t.assigned_technician_id, 'technicianName', t.assigned_technician_name,
  'assignedByManagerId', t.assigned_by_manager_id, 'assignedByManagerName', t.assigned_by_manager_name)
WHERE h.type = 'assignment' AND h.event_data IS NULL;
