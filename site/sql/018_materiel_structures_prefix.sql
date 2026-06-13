-- Suivi Matériel — préfixe ID par structure + retrait structures seed club/ecole

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'PORTAIL_CLUB_materiel_structures'
    AND COLUMN_NAME = 'id_prefix'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE PORTAIL_CLUB_materiel_structures ADD COLUMN id_prefix VARCHAR(16) NULL AFTER label',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Préfixe par défaut depuis réglage global pour structures existantes sans préfixe
UPDATE PORTAIL_CLUB_materiel_structures s
SET s.id_prefix = (
  SELECT JSON_UNQUOTE(JSON_EXTRACT(value_json, '$.value'))
  FROM PORTAIL_CLUB_materiel_settings
  WHERE setting_key = 'id_prefix'
  LIMIT 1
)
WHERE (s.id_prefix IS NULL OR s.id_prefix = '');

-- Désactiver les structures seed génériques (conservation si matériel lié)
UPDATE PORTAIL_CLUB_materiel_structures
SET active = 0
WHERE slug IN ('club', 'ecole');

INSERT INTO PORTAIL_CLUB_schema_migrations (version)
SELECT '018_materiel_structures_prefix'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM PORTAIL_CLUB_schema_migrations WHERE version = '018_materiel_structures_prefix'
);
