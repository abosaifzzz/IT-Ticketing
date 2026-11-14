START TRANSACTION;

INSERT INTO ticket_history
  (id, ticket_id, type, status, actor_account_id, actor_name, actor_role, occurred_at, sequence_number, note, visibility, event_data)
SELECT UUID(), t.id, 'status', 'closed',
  COALESCE(t.assigned_technician_id, t.created_by_account_id),
  COALESCE(t.assigned_technician_name, t.created_by_name),
  IF(t.assigned_technician_id IS NULL, t.created_by_role, 'technician'),
  UTC_TIMESTAMP(3),
  (SELECT COALESCE(MAX(h.sequence_number), 0) + 1 FROM ticket_history h WHERE h.ticket_id = t.id),
  'أُغلق البلاغ تلقائيًا بعد تسجيل الحل', 'public',
  JSON_OBJECT('previousStatus', 'resolved', 'source', 'migration_011')
FROM tickets t
WHERE t.status = 'resolved';

UPDATE tickets
SET status = 'closed', version = version + 1, updated_at = UTC_TIMESTAMP(3)
WHERE status = 'resolved';

COMMIT;
