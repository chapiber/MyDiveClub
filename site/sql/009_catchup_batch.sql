-- Lot de séances déclarées en rattrapage (idempotent)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'PORTAIL_CLUB_formation_sessions'
    AND COLUMN_NAME = 'catchup_batch_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE PORTAIL_CLUB_formation_sessions ADD COLUMN catchup_batch_id CHAR(36) NULL DEFAULT NULL AFTER time_slot, ADD KEY idx_portail_club_sessions_catchup (catchup_batch_id)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
