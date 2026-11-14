ALTER TABLE am_categories ADD serial_mode ENUM('REQUIRED','OPTIONAL','DISABLED') NOT NULL DEFAULT 'OPTIONAL', ADD unique_serial BOOLEAN NOT NULL DEFAULT TRUE;
UPDATE am_categories SET serial_mode=CASE WHEN requires_serial THEN 'REQUIRED' ELSE 'DISABLED' END;
ALTER TABLE am_assets ADD usage_condition ENUM('NEW','USED') NOT NULL DEFAULT 'USED', ADD archived_at DATETIME(3) NULL;
ALTER TABLE am_workstations MODIFY location_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL, ADD description TEXT NULL, ADD archived_at DATETIME(3) NULL;
CREATE TABLE am_group_memberships (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 group_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 asset_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 joined_at DATETIME(3) NOT NULL,
 ended_at DATETIME(3) NULL,
 added_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 ended_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 end_reason VARCHAR(40) NULL,
 replaced_by_asset_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 active_asset_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin GENERATED ALWAYS AS (CASE WHEN ended_at IS NULL THEN asset_id ELSE NULL END) STORED UNIQUE,
 FOREIGN KEY(group_id) REFERENCES am_workstations(id), FOREIGN KEY(asset_id) REFERENCES am_assets(id),
 FOREIGN KEY(added_by) REFERENCES users(id), FOREIGN KEY(ended_by) REFERENCES users(id), FOREIGN KEY(replaced_by_asset_id) REFERENCES am_assets(id),
 INDEX(group_id,ended_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO am_group_memberships(id,group_id,asset_id,joined_at,added_by)
 SELECT UUID(),a.workstation_id,a.id,a.created_at,(SELECT h.actor_id FROM am_workstation_history h WHERE h.asset_id=a.id AND h.workstation_id=a.workstation_id ORDER BY h.created_at DESC,h.id DESC LIMIT 1)
 FROM am_assets a WHERE a.workstation_id IS NOT NULL;
