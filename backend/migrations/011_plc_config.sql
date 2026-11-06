-- Administration -> DB Details -> PLC (Allen-Bradley SLC/MicroLogix) settings.
-- Single-row store. `tags` is a JSON array, one entry per manual operation:
--   { key, label, openTag, openValue, closeTag, closeValue }
CREATE TABLE IF NOT EXISTS plc_config (
  id          TINYINT      NOT NULL DEFAULT 1,
  ip_address  VARCHAR(100) NOT NULL DEFAULT '192.168.0.12',
  tags        JSON         NOT NULL,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT single_row_plc_config CHECK (id = 1)
) ENGINE=InnoDB;

INSERT IGNORE INTO plc_config (id, tags) VALUES (1, JSON_ARRAY(
  JSON_OBJECT('key','mixingChamber',       'label','Mixing Chamber',       'openTag','','openValue',1,'closeTag','','closeValue',0),
  JSON_OBJECT('key','intermediateChamber', 'label','Intermediate Chamber', 'openTag','','openValue',1,'closeTag','','closeValue',0),
  JSON_OBJECT('key','purging',             'label','Purging',              'openTag','','openValue',1,'closeTag','','closeValue',0),
  JSON_OBJECT('key','vibrator',            'label','Vibrator',             'openTag','','openValue',1,'closeTag','','closeValue',0)
));
