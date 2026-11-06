-- Per-second dosage string ("1.2, 3.4, ...") read by the dashboard / past records and written by the simulator.
-- The original table definition (004) did not include it; add it only if it is missing so databases that
-- already have the column are not broken.
SET @has_col = (SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = DATABASE() AND table_name = 'innodose_casting_details_v2' AND column_name = 'DOSAGE / SEC');
SET @ddl = IF(@has_col = 0,
              'ALTER TABLE innodose_casting_details_v2 ADD COLUMN `DOSAGE / SEC` TEXT NULL',
              'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
