ALTER TABLE users MODIFY role ENUM('employee','technician','manager','admin') NOT NULL,
  ADD last_login_at DATETIME(3) NULL,
  ADD admin_password_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE am_audit ADD actor_role VARCHAR(24) NULL;
CREATE TABLE admin_guard (id TINYINT NOT NULL PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO admin_guard(id) VALUES(1);
CREATE TABLE admin_role_permissions (
 role VARCHAR(24) NOT NULL,permission VARCHAR(80) NOT NULL,enabled BOOLEAN NOT NULL,
 PRIMARY KEY(role,permission),CHECK(role='admin'),CHECK(permission LIKE 'admin.%')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO admin_role_permissions(role,permission,enabled) VALUES
 ('admin','admin.dashboard.read',TRUE),('admin','admin.users.read',TRUE),('admin','admin.users.create',TRUE),
 ('admin','admin.users.update',TRUE),('admin','admin.users.disable',TRUE),('admin','admin.users.reset_password',TRUE),
 ('admin','admin.roles.read',TRUE),('admin','admin.permissions.manage',TRUE),('admin','admin.audit.read',TRUE),
 ('admin','admin.settings.read',TRUE),('admin','admin.settings.update',TRUE),('admin','admin.backups.read',TRUE),
 ('admin','admin.backups.create',TRUE),('admin','admin.backups.restore',FALSE),('admin','admin.monitoring.read',TRUE),
 ('admin','admin.errors.read',TRUE),('admin','admin.sessions.revoke',TRUE);
CREATE TABLE admin_settings (
 section VARCHAR(40) NOT NULL PRIMARY KEY,settings_data JSON NOT NULL,version INT UNSIGNED NOT NULL DEFAULT 0,
 updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO admin_settings(section,settings_data,updated_at) VALUES
 ('identity',JSON_OBJECT('hospitalName','Hospital','systemName','IT Helpdesk','timezone','Africa/Cairo'),UTC_TIMESTAMP(3)),
 ('application',JSON_OBJECT('supportEmail','','defaultPageSize',25),UTC_TIMESTAMP(3)),
 ('authentication',JSON_OBJECT('adminSessionMinutes',30,'recentAuthenticationMinutes',5),UTC_TIMESTAMP(3)),
 ('notifications',JSON_OBJECT('pollSeconds',30,'realtimeEnabled',TRUE),UTC_TIMESTAMP(3)),
 ('maintenance',JSON_OBJECT('enabled',FALSE,'message','System maintenance'),UTC_TIMESTAMP(3));
CREATE TABLE admin_audit (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,actor_role VARCHAR(24) NOT NULL,
 action VARCHAR(100) NOT NULL,module VARCHAR(40) NOT NULL,entity_id VARCHAR(160) NULL,
 previous_values JSON NULL,new_values JSON NULL,occurred_at DATETIME(3) NOT NULL,
 request_ip VARCHAR(64) NULL,status ENUM('SUCCESS','FAILURE') NOT NULL,
 INDEX admin_audit_time(occurred_at,id),INDEX admin_audit_actor(actor_id),INDEX admin_audit_module(module,action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE admin_requests (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 type ENUM('PASSWORD_RESET','ROLE_CHANGE') NOT NULL,target_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 requested_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,expected_role VARCHAR(24) NOT NULL,
 requested_role VARCHAR(24) NULL,reason VARCHAR(300) NOT NULL,
 status ENUM('PENDING','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING',
 created_at DATETIME(3) NOT NULL,expires_at DATETIME(3) NOT NULL,completed_at DATETIME(3) NULL,
 INDEX admin_requests_target(target_id,status),FOREIGN KEY(target_id) REFERENCES users(id),FOREIGN KEY(requested_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE admin_backups (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 requested_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 status ENUM('QUEUED','RUNNING','COMPLETED','FAILED') NOT NULL,
 created_at DATETIME(3) NOT NULL,finished_at DATETIME(3) NULL,
 byte_length BIGINT UNSIGNED NULL,sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 failure_code VARCHAR(64) NULL,INDEX admin_backups_time(created_at,id),FOREIGN KEY(requested_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
