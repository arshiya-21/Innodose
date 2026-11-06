-- Which table / column the alert calculation reads the dosed amount from.
-- Defaults to the casting details table + `WEIGHT OF INOCULANT` (what alert.py uses).
CREATE TABLE IF NOT EXISTS alert_source (
  id           TINYINT      NOT NULL,
  table_name   VARCHAR(128) NOT NULL DEFAULT 'innodose_casting_details_v2',
  dose_column  VARCHAR(128) NOT NULL DEFAULT 'WEIGHT OF INOCULANT',
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

INSERT IGNORE INTO alert_source (id) VALUES (1);
