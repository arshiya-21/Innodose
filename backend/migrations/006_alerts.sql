-- Alert tolerances and notification recipients.
-- Schema mirrors what already exists in the `innodose` schema.

CREATE TABLE IF NOT EXISTS alert_tolerances (
  id             INT          NOT NULL AUTO_INCREMENT,
  alert_type     VARCHAR(64)  NOT NULL,
  min_tolerance  FLOAT        NOT NULL,
  max_tolerance  FLOAT        NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_alert_tolerances_type (alert_type)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS alert_users (
  id          INT          NOT NULL AUTO_INCREMENT,
  alert_name  VARCHAR(64)  NOT NULL,
  email       VARCHAR(255) NOT NULL,
  enabled     TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_alert_users_alert (alert_name),
  KEY idx_alert_users_enabled (enabled)
) ENGINE=InnoDB;

-- `alert_config` tracks whether each alert type is enabled globally
-- (the Enabled/Disabled toggle in the UI). Email recipients live in alert_users.
CREATE TABLE IF NOT EXISTS alert_config (
  alert_type  VARCHAR(100) NOT NULL,
  enabled     TINYINT(1)   NOT NULL DEFAULT 1,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (alert_type)
) ENGINE=InnoDB;

-- Seed tolerances (float min/max around Figma defaults).
INSERT IGNORE INTO alert_tolerances (alert_type, min_tolerance, max_tolerance) VALUES
  ('Over Dose',  0,  5),
  ('Under Dose', 0,  5),
  ('Dose Missed', 0, 0),
  ('Pipe Chocked', 0, 0),
  ('Flow Rate',  2, 3);

-- Seed alert config (every alert enabled except Fault Stepper Motor).
INSERT IGNORE INTO alert_config (alert_type, enabled) VALUES
  ('Over Dose', 1),
  ('Under Dose', 1),
  ('Dose Missed', 1),
  ('Pipe Chocked', 1),
  ('Fault Pressure of Air', 1),
  ('Fault Stepper Motor', 0),
  ('Warning Volume of Inoculant in Intermediate Chamber', 1);

-- No notification recipients are seeded: each installation adds its own on Administration -> Alerts.
