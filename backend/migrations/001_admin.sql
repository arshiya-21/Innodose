-- Three-table admin schema, created automatically on backend startup.
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS company_info (
  id            TINYINT       NOT NULL DEFAULT 1,
  name          VARCHAR(255)  NOT NULL DEFAULT '',
  address       TEXT          NOT NULL,
  phone         VARCHAR(50)   NOT NULL DEFAULT '',
  email         VARCHAR(255)  NOT NULL DEFAULT '',
  gstin         VARCHAR(50)   NOT NULL DEFAULT '',
  logo_data_url MEDIUMTEXT    NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT single_row CHECK (id = 1)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS permissions (
  role_id      CHAR(36)     NOT NULL,
  name         VARCHAR(100) NOT NULL,
  description  VARCHAR(255) NOT NULL DEFAULT '',
  perms_json   JSON         NOT NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id),
  UNIQUE KEY uq_permissions_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id            CHAR(36)     NOT NULL,
  username      VARCHAR(100) NOT NULL,
  password_hash CHAR(64)     NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL DEFAULT '',
  role_id       CHAR(36)     NOT NULL,
  active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  KEY idx_users_role (role_id),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES permissions(role_id)
) ENGINE=InnoDB;
