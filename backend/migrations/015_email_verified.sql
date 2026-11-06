-- Email Settings: remember whether the saved account was verified (a real SMTP login succeeded).
-- Alert e-mails are only sent when the account is verified; otherwise the UI asks the admin to configure it.

-- email_settings.verified
SET @x := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'email_settings' AND column_name = 'verified');
SET @sql := IF(@x = 0,
  'ALTER TABLE email_settings ADD COLUMN verified TINYINT(1) NOT NULL DEFAULT 0',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- email_settings.verified_at
SET @x := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'email_settings' AND column_name = 'verified_at');
SET @sql := IF(@x = 0,
  'ALTER TABLE email_settings ADD COLUMN verified_at TIMESTAMP NULL DEFAULT NULL',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
