-- Server-side login sessions. Persisted so that backend restarts (dev reloads,
-- production restarts) don't log everyone out. Entries are cleaned up by the
-- app on logout and on expiry; a background sweep in mysqlStore drops stale
-- rows periodically.
CREATE TABLE IF NOT EXISTS sessions (
  token      CHAR(36)   NOT NULL,
  user_id    CHAR(36)   NOT NULL,
  expires_at DATETIME   NOT NULL,
  created_at TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expires (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
