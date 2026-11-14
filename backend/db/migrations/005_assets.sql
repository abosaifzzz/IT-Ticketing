CREATE TABLE assets (
  asset_id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  manufacturer VARCHAR(160) NOT NULL,
  model VARCHAR(160) NOT NULL,
  serial_number VARCHAR(160) NOT NULL DEFAULT '',
  holding_type ENUM('department', 'it_storage') NOT NULL,
  department_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  department_label VARCHAR(160) NOT NULL,
  location VARCHAR(200) NOT NULL,
  purchase_date DATE NULL,
  operational_status ENUM('working', 'needs_maintenance', 'out_of_service', 'under_repair', 'retired', 'withdrawn') NOT NULL,
  condition_description TEXT NOT NULL,
  maintenance_notes TEXT NOT NULL,
  last_maintenance_date DATE NULL,
  archived_at DATETIME(3) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX assets_inventory_idx (archived_at, operational_status, asset_id),
  CONSTRAINT assets_quantity_ck CHECK (quantity BETWEEN 1 AND 1000000),
  CONSTRAINT assets_withdrawn_quantity_ck CHECK (operational_status <> 'withdrawn' OR quantity = 1),
  CONSTRAINT assets_holding_ck CHECK ((holding_type = 'department' AND department_id IS NOT NULL) OR (holding_type = 'it_storage' AND department_id IS NULL)),
  CONSTRAINT assets_department_fk FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE asset_history (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  asset_id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  type ENUM('created', 'updated', 'archived', 'withdrawn') NOT NULL,
  actor_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  actor_name VARCHAR(160) NOT NULL,
  actor_role ENUM('technician', 'manager') NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  sequence_number BIGINT NOT NULL,
  event_data JSON NOT NULL,
  UNIQUE KEY asset_history_sequence_uq (asset_id, sequence_number),
  CONSTRAINT asset_history_asset_fk FOREIGN KEY (asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE,
  CONSTRAINT asset_history_actor_fk FOREIGN KEY (actor_account_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE asset_withdrawals (
  ticket_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  asset_id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  source_asset_id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  engineer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  engineer_name VARCHAR(160) NOT NULL,
  withdrawn_at DATETIME(3) NOT NULL,
  CONSTRAINT asset_withdrawals_ticket_fk FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE RESTRICT,
  CONSTRAINT asset_withdrawals_asset_fk FOREIGN KEY (asset_id) REFERENCES assets(asset_id) ON DELETE RESTRICT,
  CONSTRAINT asset_withdrawals_source_fk FOREIGN KEY (source_asset_id) REFERENCES assets(asset_id) ON DELETE RESTRICT,
  CONSTRAINT asset_withdrawals_engineer_fk FOREIGN KEY (engineer_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE tickets
  ADD COLUMN related_asset_id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD CONSTRAINT tickets_related_asset_fk FOREIGN KEY (related_asset_id) REFERENCES assets(asset_id) ON DELETE RESTRICT;

ALTER TABLE ticket_history MODIFY COLUMN type ENUM('status', 'assignment', 'claim', 'technician_note', 'comment', 'resolution', 'confirmation', 'reopened', 'asset_withdrawal') NOT NULL;
