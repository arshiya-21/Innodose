-- When the Control Panel values were applied. Applied values are temporary: after 3 hours, or when the plant
-- day changes, the backend writes the component master values back to the PLC and clears the override.
SET @has_col = (SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = DATABASE() AND table_name = 'machine_state' AND column_name = 'applied_at');
SET @ddl = IF(@has_col = 0,
              'ALTER TABLE machine_state ADD COLUMN applied_at TIMESTAMP NULL DEFAULT NULL',
              'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
