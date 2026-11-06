-- Settings pane on Administration → DB Details. Single-row store.
-- The password is kept in plaintext here on purpose: the operator pastes a
-- real connection string, and the whole row is admin-only read/write. If you
-- need stricter handling, move the password to a secrets store and leave only
-- a reference here.
CREATE TABLE IF NOT EXISTS db_details (
  id                 TINYINT      NOT NULL DEFAULT 1,
  db_type            VARCHAR(20)  NOT NULL DEFAULT 'mysql',
  host               VARCHAR(255) NOT NULL DEFAULT 'localhost',
  port               VARCHAR(10)  NOT NULL DEFAULT '3306',
  username           VARCHAR(100) NOT NULL DEFAULT 'root',
  password           VARCHAR(255) NOT NULL DEFAULT '',
  db_name            VARCHAR(100) NOT NULL DEFAULT 'inodose_test',
  use_ssh_tunnel     TINYINT(1)   NOT NULL DEFAULT 0,
  ssh_host           VARCHAR(255) NOT NULL DEFAULT '',
  ssh_port           VARCHAR(10)  NOT NULL DEFAULT '22',
  ssh_user           VARCHAR(100) NOT NULL DEFAULT '',
  ssh_private_key_path VARCHAR(500) NOT NULL DEFAULT '',
  updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT single_row_db_details CHECK (id = 1)
) ENGINE=InnoDB;

INSERT IGNORE INTO db_details (id) VALUES (1);
