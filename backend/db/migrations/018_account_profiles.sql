ALTER TABLE users
  ADD COLUMN phone VARCHAR(32) NULL,
  ADD COLUMN must_complete_profile BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN profile_completed_at DATETIME(3) NULL,
  ADD COLUMN roster_source_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL;

-- Existing operational users complete their profile without resetting passwords.
UPDATE users SET must_complete_profile=TRUE WHERE role<>'admin';

CREATE TABLE user_departments (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  department_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (user_id, department_id),
  CONSTRAINT user_departments_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT user_departments_department_fk FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_roster_imports (
  source_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_count INT UNSIGNED NOT NULL,
  retired_directory_count INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  CONSTRAINT user_roster_import_actor_fk FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE tickets
  ADD COLUMN reporter_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN reporter_username VARCHAR(254) NULL,
  ADD COLUMN reporter_phone VARCHAR(32) NULL,
  ADD INDEX tickets_reporter_user_idx (reporter_user_id);
-- Historical labels and missing historical contact details remain unchanged.
