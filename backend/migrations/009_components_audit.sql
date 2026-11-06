-- Add audit columns (who changed it, and when) to the components master.
-- Safe to re-run: both statements are idempotent via information_schema checks.

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name   = 'components'
    AND column_name  = 'updated_at'
);
SET @stmt := IF(@col_exists = 0,
  'ALTER TABLE components ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name   = 'components'
    AND column_name  = 'updated_by'
);
SET @stmt := IF(@col_exists = 0,
  'ALTER TABLE components ADD COLUMN updated_by VARCHAR(100) NULL AFTER updated_at',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
