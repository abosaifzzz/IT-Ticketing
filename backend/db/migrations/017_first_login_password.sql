-- Existing identities and passwords remain valid. New flags default to false.
ALTER TABLE users
  MODIFY email VARCHAR(254) NULL,
  ADD COLUMN username VARCHAR(100) NULL,
  ADD UNIQUE KEY users_username_unique (username),
  ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN password_changed_at DATETIME(3) NULL;
