-- Créneau séance : matin / après-midi (idempotent)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'PORTAIL_CLUB_formation_sessions'
    AND COLUMN_NAME = 'time_slot'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE PORTAIL_CLUB_formation_sessions ADD COLUMN time_slot ENUM(''morning'', ''afternoon'') NOT NULL DEFAULT ''morning'' AFTER held_at',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
