ALTER TABLE tickets MODIFY department_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;
ALTER TABLE tickets MODIFY department_label VARCHAR(160) NULL;
