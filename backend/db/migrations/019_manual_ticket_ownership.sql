-- IT-created tickets for a selected employee belong to that employee.
-- Older manual tickets without an explicit account link remain unowned.
ALTER TABLE tickets DROP CHECK tickets_ownership_ck;
ALTER TABLE tickets ADD CONSTRAINT tickets_ownership_ck CHECK (
  (source='portal' AND reporter_account_id IS NOT NULL
    AND reporter_account_id=created_by_account_id AND created_by_role='employee'
    AND created_for IS NOT NULL AND requester_type='employee')
  OR (source='manual' AND created_by_role IN ('technician','manager') AND created_for IS NULL
    AND (reporter_account_id IS NULL OR (requester_type='employee'
      AND reporter_user_id IS NOT NULL AND reporter_account_id=reporter_user_id)))
);
UPDATE tickets t JOIN users u ON u.id=t.reporter_user_id
SET t.reporter_account_id=u.id
WHERE t.source='manual' AND t.requester_type='employee'
  AND t.reporter_account_id IS NULL AND t.reporter_user_id IS NOT NULL;
