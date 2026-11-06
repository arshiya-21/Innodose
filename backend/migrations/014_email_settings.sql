-- Administration → Email Settings: SMTP account used to send alert e-mails. Single-row store.
-- Like db_details, the password is kept as plaintext in an admin-only row and is never sent back to the browser.
CREATE TABLE IF NOT EXISTS email_settings (
  id           TINYINT      NOT NULL DEFAULT 1,
  enabled      TINYINT(1)   NOT NULL DEFAULT 0,
  smtp_host    VARCHAR(255) NOT NULL DEFAULT 'smtp.gmail.com',
  smtp_port    VARCHAR(10)  NOT NULL DEFAULT '587',
  security     VARCHAR(10)  NOT NULL DEFAULT 'starttls',   -- starttls | ssl | none
  username     VARCHAR(255) NOT NULL DEFAULT '',
  password     VARCHAR(255) NOT NULL DEFAULT '',
  from_name    VARCHAR(100) NOT NULL DEFAULT 'Inodose Alerts',
  from_email   VARCHAR(255) NOT NULL DEFAULT '',
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by   VARCHAR(100) NULL,
  PRIMARY KEY (id),
  CONSTRAINT single_row_email_settings CHECK (id = 1)
) ENGINE=InnoDB;

INSERT IGNORE INTO email_settings (id) VALUES (1);
