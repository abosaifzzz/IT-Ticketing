CREATE TABLE notification_events (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  ticket_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  type ENUM('new_ticket', 'ticket_assignment', 'ticket_resolved', 'ticket_reopened') NOT NULL,
  title VARCHAR(160) NOT NULL,
  message VARCHAR(512) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  CONSTRAINT notification_events_history_fk FOREIGN KEY (id) REFERENCES ticket_history(id) ON DELETE CASCADE,
  CONSTRAINT notification_events_ticket_fk FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notification_accounts (
  account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT notification_accounts_user_fk FOREIGN KEY (account_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  event_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  recipient_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_revision BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  read_at DATETIME(3) NULL,
  UNIQUE KEY notifications_event_recipient_uq (event_id, recipient_id),
  UNIQUE KEY notifications_recipient_revision_uq (recipient_id, created_revision),
  INDEX notifications_recipient_unread_idx (recipient_id, read_at),
  CONSTRAINT notifications_event_fk FOREIGN KEY (event_id) REFERENCES notification_events(id) ON DELETE CASCADE,
  CONSTRAINT notifications_recipient_fk FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
