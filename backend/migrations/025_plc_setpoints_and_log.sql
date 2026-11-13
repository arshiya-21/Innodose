-- Auto Mode setpoint tags (Administration -> PLC Details) and the PLC change log.
--
-- plc_config.setpoint_tags: JSON { pouringTime: {tag, dataType}, flowRate: {tag, dataType} }.
-- On Control Panel "Apply" in Auto Mode the applied pouring time and flow rate are written to these tags.
SET @has_col = (SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = DATABASE() AND table_name = 'plc_config' AND column_name = 'setpoint_tags');
SET @ddl = IF(@has_col = 0,
              'ALTER TABLE plc_config ADD COLUMN setpoint_tags JSON NULL',
              'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- One row per Control Panel "Apply": new values, previous values (shown in brackets), who, when, PLC result.
-- These are temporary (live) changes; the component master is not touched.
CREATE TABLE IF NOT EXISTS plc_change_log (
  id                   INT           NOT NULL AUTO_INCREMENT,
  machine_id           INT           NOT NULL,
  created_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  username             VARCHAR(100)  NOT NULL,
  full_name            VARCHAR(150)  NULL,
  mode                 VARCHAR(10)   NOT NULL,
  prev_mode            VARCHAR(10)   NULL,
  component_id         VARCHAR(20)   NULL,
  component_name       VARCHAR(255)  NULL,
  prev_component_name  VARCHAR(255)  NULL,
  pouring_time         DECIMAL(6,2)  NULL,
  prev_pouring_time    DECIMAL(6,2)  NULL,
  flow_rate            DECIMAL(6,2)  NULL,
  prev_flow_rate       DECIMAL(6,2)  NULL,
  plc_status           VARCHAR(10)   NOT NULL,   -- ok | failed | skipped (not Auto Mode)
  plc_message          VARCHAR(500)  NULL,
  PRIMARY KEY (id),
  KEY idx_plc_change_log_machine_time (machine_id, created_at)
) ENGINE=InnoDB;
