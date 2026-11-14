ALTER TABLE am_assets ADD is_stock BOOLEAN NOT NULL DEFAULT FALSE,
  ADD source_asset_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD CONSTRAINT fk_am_asset_source FOREIGN KEY (source_asset_id) REFERENCES am_assets(id),
  DROP CHECK chk_am_assets_quantity,
  ADD CONSTRAINT chk_am_assets_quantity CHECK (quantity BETWEEN 0 AND 1000000),
  ADD CONSTRAINT chk_am_assets_empty_stock CHECK (quantity > 0 OR (is_stock=TRUE AND serial_number IS NULL AND workstation_id IS NULL AND custodian_type='none')),
  ADD CONSTRAINT chk_am_assets_stock_serial CHECK (is_stock=FALSE OR serial_number IS NULL);
UPDATE am_assets SET is_stock=TRUE WHERE quantity>1;
CREATE TABLE am_group_components (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  group_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_asset_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  allocated_asset_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  added_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  added_at DATETIME(3) NOT NULL,
  removed_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  removed_at DATETIME(3) NULL,
  active_source_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin GENERATED ALWAYS AS (CASE WHEN removed_at IS NULL THEN source_asset_id ELSE NULL END) STORED,
  UNIQUE KEY uq_group_component(group_id,active_source_id),
  UNIQUE KEY uq_group_allocated_asset(allocated_asset_id),
  FOREIGN KEY(group_id) REFERENCES am_workstations(id),
  FOREIGN KEY(source_asset_id) REFERENCES am_assets(id),
  FOREIGN KEY(allocated_asset_id) REFERENCES am_assets(id),
  FOREIGN KEY(added_by) REFERENCES users(id),
  FOREIGN KEY(removed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO am_group_components(id,group_id,source_asset_id,allocated_asset_id,added_at)
  SELECT UUID(),workstation_id,id,id,created_at FROM am_assets WHERE workstation_id IS NOT NULL AND archived_at IS NULL;
