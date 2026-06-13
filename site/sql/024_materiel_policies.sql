-- Politiques révision / renouvellement par type + marquage manuel + score santé

SET @db := DATABASE();

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'PORTAIL_CLUB_materiel_equipment_types'
    AND COLUMN_NAME = 'renewal_policy'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE PORTAIL_CLUB_materiel_equipment_types
     ADD COLUMN renewal_policy ENUM(''manufacturer'',''health_score'',''manual'') NOT NULL DEFAULT ''manufacturer'' AFTER renewal_years,
     ADD COLUMN renewal_health_threshold TINYINT UNSIGNED NOT NULL DEFAULT 40 AFTER renewal_policy,
     ADD COLUMN revision_policy ENUM(''annual_anniversary'',''annual_season'',''none'') NOT NULL DEFAULT ''annual_season'' AFTER renewal_health_threshold,
     ADD COLUMN revision_season_month TINYINT UNSIGNED NULL DEFAULT 1 AFTER revision_policy',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'PORTAIL_CLUB_materiel_equipment'
    AND COLUMN_NAME = 'renewal_flagged'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE PORTAIL_CLUB_materiel_equipment
     ADD COLUMN renewal_flagged TINYINT(1) NOT NULL DEFAULT 0 AFTER notes,
     ADD COLUMN renewal_flagged_at DATETIME NULL AFTER renewal_flagged,
     ADD COLUMN health_score TINYINT UNSIGNED NULL AFTER renewal_flagged_at,
     ADD COLUMN health_score_at DATETIME NULL AFTER health_score',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE PORTAIL_CLUB_materiel_equipment_types
SET revision_policy = 'none', revision_season_month = NULL
WHERE trackable = 0;

UPDATE PORTAIL_CLUB_materiel_equipment_types
SET revision_policy = 'annual_season', revision_season_month = 1
WHERE trackable = 1;

UPDATE PORTAIL_CLUB_materiel_equipment_types
SET renewal_policy = 'manufacturer'
WHERE renewal_years IS NOT NULL;

UPDATE PORTAIL_CLUB_materiel_equipment_types
SET renewal_policy = 'manual'
WHERE renewal_years IS NULL;

INSERT INTO PORTAIL_CLUB_schema_migrations (version)
SELECT '024_materiel_policies'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM PORTAIL_CLUB_schema_migrations WHERE version = '024_materiel_policies'
);
