-- Add `updated_at` / `updated_by` audit columns to every editable table.
-- Idempotent: each ALTER is guarded by an information_schema check so re-runs
-- are no-ops. DELIMITER / stored procedures are NOT used because this script
-- runs via mysql2's pool.query, which is a single connection without the
-- mysql-client's DELIMITER directive.

-- machines.updated_at
SET @x := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'machines' AND column_name = 'updated_at');
SET @sql := IF(@x = 0,
  'ALTER TABLE machines ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- machines.updated_by
SET @x := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'machines' AND column_name = 'updated_by');
SET @sql := IF(@x = 0,
  'ALTER TABLE machines ADD COLUMN updated_by VARCHAR(100) NULL',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- users.updated_at
SET @x := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'updated_at');
SET @sql := IF(@x = 0,
  'ALTER TABLE users ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- users.updated_by
SET @x := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'updated_by');
SET @sql := IF(@x = 0,
  'ALTER TABLE users ADD COLUMN updated_by VARCHAR(100) NULL',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- alert_config.updated_at
SET @x := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'alert_config' AND column_name = 'updated_at');
SET @sql := IF(@x = 0,
  'ALTER TABLE alert_config ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- alert_config.updated_by
SET @x := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'alert_config' AND column_name = 'updated_by');
SET @sql := IF(@x = 0,
  'ALTER TABLE alert_config ADD COLUMN updated_by VARCHAR(100) NULL',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- alert_tolerances.updated_at
SET @x := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'alert_tolerances' AND column_name = 'updated_at');
SET @sql := IF(@x = 0,
  'ALTER TABLE alert_tolerances ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- alert_tolerances.updated_by
SET @x := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'alert_tolerances' AND column_name = 'updated_by');
SET @sql := IF(@x = 0,
  'ALTER TABLE alert_tolerances ADD COLUMN updated_by VARCHAR(100) NULL',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- alert_users.updated_at
SET @x := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'alert_users' AND column_name = 'updated_at');
SET @sql := IF(@x = 0,
  'ALTER TABLE alert_users ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- alert_users.updated_by
SET @x := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'alert_users' AND column_name = 'updated_by');
SET @sql := IF(@x = 0,
  'ALTER TABLE alert_users ADD COLUMN updated_by VARCHAR(100) NULL',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- company_info.updated_at
SET @x := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'company_info' AND column_name = 'updated_at');
SET @sql := IF(@x = 0,
  'ALTER TABLE company_info ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- company_info.updated_by
SET @x := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'company_info' AND column_name = 'updated_by');
SET @sql := IF(@x = 0,
  'ALTER TABLE company_info ADD COLUMN updated_by VARCHAR(100) NULL',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- db_details.updated_at
SET @x := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'db_details' AND column_name = 'updated_at');
SET @sql := IF(@x = 0,
  'ALTER TABLE db_details ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- db_details.updated_by
SET @x := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'db_details' AND column_name = 'updated_by');
SET @sql := IF(@x = 0,
  'ALTER TABLE db_details ADD COLUMN updated_by VARCHAR(100) NULL',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
