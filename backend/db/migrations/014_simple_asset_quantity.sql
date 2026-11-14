ALTER TABLE am_assets ADD quantity INT UNSIGNED NOT NULL DEFAULT 1,
  ADD CONSTRAINT chk_am_assets_quantity CHECK (quantity BETWEEN 1 AND 1000000),
  ADD CONSTRAINT chk_am_assets_batch CHECK (quantity = 1 OR (workstation_id IS NULL AND serial_number IS NULL));
