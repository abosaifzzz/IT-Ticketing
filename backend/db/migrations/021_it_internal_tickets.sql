-- IT tickets: internal manager-to-engineer tasks with no employee requester or department.
-- They are manual, unowned (reporter_account_id NULL) and allowed by the existing ownership check.
-- Note: the migration runner splits on semicolons, so comments must not contain them.
ALTER TABLE tickets MODIFY requester_type ENUM('employee', 'top_management', 'it_internal') NOT NULL;
