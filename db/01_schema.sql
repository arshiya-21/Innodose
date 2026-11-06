-- Inodose MySQL schema
-- Uses your existing local root@localhost connection.
-- Run with:  mysql -u root -p < 01_schema.sql

CREATE DATABASE IF NOT EXISTS innodose
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE innodose;

-- ============================================================================
-- 1. Main PLC data table — mirrors the CSV exactly (column names preserved with
--    spaces so alert.py's SQL in `check_all_alerts` keeps working).
-- ============================================================================
DROP TABLE IF EXISTS innodose_casting_details_v2;
CREATE TABLE innodose_casting_details_v2 (
  `id`                         BIGINT PRIMARY KEY,
  `datetime`                   DATETIME NOT NULL,
  `WEIGHT OF CASTING`          FLOAT NULL,
  `CONTENT OF INOCULANT`       FLOAT NULL,
  `POURING TIME`               FLOAT NULL,
  `SPECIFIC GRAVITY`           FLOAT NULL,
  `WEIGHT OF INOCULANT`        FLOAT NULL,
  `FLOW OF INOCULANT`          FLOAT NULL,
  `STEP SIZE`                  FLOAT NULL,
  `HEAT NO`                    VARCHAR(128) NULL,
  `PATTERN ID`                 VARCHAR(128) NULL,
  `COMPONENT ID`               VARCHAR(128) NULL,
  `BOX COUNT`                  INT NULL,
  `CUMMULATIVE BOX COUNT`      INT NULL,
  `CUMMULATIVE DOSES`          INT NULL,
  `LOAD PV`                    FLOAT NULL,
  `LOAD MEASURED`              FLOAT NULL,
  `DOSAGE / SEC`               VARCHAR(500) NULL,
  `CURRENT DAY DOSES`          INT NULL,
  `CURRENT DAY MISSED DOSES`   INT NULL,
  `LAST DAY DOSES`             INT NULL,
  `LAST DAY MISSED DOSES`      INT NULL,
  `POURING TIMER`              INT NULL,
  INDEX idx_dt (`datetime`),
  INDEX idx_component (`COMPONENT ID`),
  INDEX idx_dt_comp (`datetime`, `COMPONENT ID`)
) ENGINE=InnoDB;

-- ============================================================================
-- 2. Component properties (from alert.py `add_component_properties`)
-- ============================================================================
DROP TABLE IF EXISTS component_properties;
CREATE TABLE component_properties (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  component_id         VARCHAR(128) NOT NULL UNIQUE,
  component_name       VARCHAR(255) NOT NULL,
  pattern_id           VARCHAR(128) NULL,
  grade                VARCHAR(64)  NULL,

  bunch_weight         FLOAT NULL,
  net_casting_weight   FLOAT NULL,
  cavity_per_box       FLOAT NULL,
  core_weight          FLOAT NULL,
  sand_weight          FLOAT NULL,

  Tensile_Strength_Min FLOAT NULL, Tensile_Strength_Max FLOAT NULL,
  Hardness_Min         FLOAT NULL, Hardness_Max         FLOAT NULL,
  Pouring_Time_Min     FLOAT NULL, Pouring_Time_Max     FLOAT NULL,
  Pouring_Temp_Min     FLOAT NULL, Pouring_Temp_Max     FLOAT NULL,

  CE_Min FLOAT NULL, CE_Max FLOAT NULL,
  C_Min  FLOAT NULL, C_Max  FLOAT NULL,
  Si_Min FLOAT NULL, Si_Max FLOAT NULL,
  S_Min  FLOAT NULL, S_Max  FLOAT NULL,
  P_Min  FLOAT NULL, P_Max  FLOAT NULL,
  Cr_Min FLOAT NULL, Cr_Max FLOAT NULL,
  Mg_Min FLOAT NULL, Mg_Max FLOAT NULL,
  Mn_Min FLOAT NULL, Mn_Max FLOAT NULL,
  Mo_Min FLOAT NULL, Mo_Max FLOAT NULL,
  Ni_Min FLOAT NULL, Ni_Max FLOAT NULL,
  Sn_Min FLOAT NULL, Sn_Max FLOAT NULL,
  Pb_Min FLOAT NULL, Pb_Max FLOAT NULL,
  Al_Min FLOAT NULL, Al_Max FLOAT NULL,
  V_Min  FLOAT NULL, V_Max  FLOAT NULL,
  W_Min  FLOAT NULL, W_Max  FLOAT NULL,

  created_by  VARCHAR(128) NULL,
  modified_by VARCHAR(128) NULL,
  created_on  DATETIME NULL,
  modified_on DATETIME NULL
) ENGINE=InnoDB;

-- ============================================================================
-- 3. Modification history (alert.py `edit_component_properties`)
-- ============================================================================
DROP TABLE IF EXISTS modification_component_history;
CREATE TABLE modification_component_history (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  component_id   INT NOT NULL,
  modified_by    VARCHAR(128) NOT NULL,
  modified_on    DATETIME NOT NULL,
  updated_fields TEXT NOT NULL,
  INDEX idx_comp (component_id),
  INDEX idx_modified_on (modified_on)
) ENGINE=InnoDB;

-- ============================================================================
-- 4. PLC write audit (alert.py `/write_plc_values`)
-- ============================================================================
DROP TABLE IF EXISTS plc_update_log;
CREATE TABLE plc_update_log (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  updated_on            DATETIME NOT NULL,
  component_id          VARCHAR(128) NOT NULL,
  content_of_inoculant  FLOAT NOT NULL,
  pouring_time          FLOAT NOT NULL,
  gms_per_second        FLOAT NOT NULL,
  UNIQUE KEY uq_update (updated_on, component_id),
  INDEX idx_component (component_id)
) ENGINE=InnoDB;

-- ============================================================================
-- 5. Alert recipients (alert.py `/alert_users`)
-- ============================================================================
DROP TABLE IF EXISTS alert_users;
CREATE TABLE alert_users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  alert_name VARCHAR(64) NOT NULL,
  email      VARCHAR(255) NOT NULL,
  enabled    TINYINT(1) NOT NULL DEFAULT 1,
  INDEX idx_alert (alert_name),
  INDEX idx_enabled (enabled)
) ENGINE=InnoDB;

-- ============================================================================
-- 6. Alert tolerances (alert.py `/alert_tolerances`)
-- ============================================================================
DROP TABLE IF EXISTS alert_tolerances;
CREATE TABLE alert_tolerances (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  alert_type     VARCHAR(64) NOT NULL UNIQUE,
  min_tolerance  FLOAT NOT NULL,
  max_tolerance  FLOAT NOT NULL
) ENGINE=InnoDB;

-- ============================================================================
-- 7. Dosage calculations (referenced in alert.py as a flowrate source)
-- ============================================================================
DROP TABLE IF EXISTS dosage_calculations;
CREATE TABLE dosage_calculations (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  `datetime`       DATETIME NOT NULL,
  dosage_value     FLOAT NOT NULL,
  upper_tolerance1 FLOAT NULL,
  lower_tolerance1 FLOAT NULL,
  COMPONENT_ID     VARCHAR(128) NULL,
  BOX_COUNT        INT NULL,
  INDEX idx_dt (`datetime`),
  INDEX idx_component (COMPONENT_ID)
) ENGINE=InnoDB;

-- ============================================================================
-- 8. Dosage alerts (triggered by `/process-alerts`)
-- ============================================================================
DROP TABLE IF EXISTS dosage_alerts;
CREATE TABLE dosage_alerts (
  id                       BIGINT AUTO_INCREMENT PRIMARY KEY,
  dosage_id                BIGINT NULL,
  `datetime`               DATETIME NOT NULL,
  state                    VARCHAR(64) NOT NULL,
  recipient_email          TEXT NULL,
  component_id             VARCHAR(128) NULL,
  `value`                  FLOAT NULL,
  `Weight of Innoculant`   FLOAT NULL,
  `Total Innoculant`       FLOAT NULL,
  box_count                INT NULL,
  INDEX idx_dt (`datetime`),
  INDEX idx_state (state),
  INDEX idx_component (component_id)
) ENGINE=InnoDB;
