-- IT tickets are direct manager commands, not fault reports, so they have no fault category.
-- Every other ticket type still requires a category (enforced by the check below).
-- Note: the migration runner splits on semicolons, so comments must not contain them.
ALTER TABLE tickets MODIFY category_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;
ALTER TABLE tickets ADD CONSTRAINT tickets_category_required_ck CHECK (category_id IS NOT NULL OR requester_type = 'it_internal');
