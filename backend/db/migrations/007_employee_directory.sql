CREATE TABLE employee_directory (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  employee_number VARCHAR(80) NOT NULL UNIQUE,
  full_name VARCHAR(160) NOT NULL,
  department_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX employee_directory_name_idx (full_name),
  INDEX employee_directory_department_idx (department_id),
  CONSTRAINT employee_directory_department_fk FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
  CONSTRAINT employee_directory_creator_fk FOREIGN KEY (created_by_account_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
