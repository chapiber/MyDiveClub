-- Détendeur : specs équipement + détail maintenance ; retrait checks détendeur catalogue

SET @col_specs = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'PORTAIL_CLUB_materiel_equipment'
    AND COLUMN_NAME = 'specs_json'
);
SET @sql_specs = IF(@col_specs = 0,
  'ALTER TABLE PORTAIL_CLUB_materiel_equipment ADD COLUMN specs_json JSON NULL COMMENT ''Détendeur: modèles et N° série par étage''',
  'SELECT 1');
PREPARE stmt FROM @sql_specs;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_detail = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'PORTAIL_CLUB_materiel_interventions'
    AND COLUMN_NAME = 'detail_json'
);
SET @sql_detail = IF(@col_detail = 0,
  'ALTER TABLE PORTAIL_CLUB_materiel_interventions ADD COLUMN detail_json JSON NULL COMMENT ''Détendeur: fiche maintenance structurée''',
  'SELECT 1');
PREPARE stmt FROM @sql_detail;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

DELETE c FROM PORTAIL_CLUB_materiel_equipment_type_checks c
INNER JOIN PORTAIL_CLUB_materiel_equipment_types t ON t.id = c.type_id
WHERE t.slug = 'regulator';

INSERT INTO PORTAIL_CLUB_schema_migrations (version)
SELECT '019_materiel_regulator'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM PORTAIL_CLUB_schema_migrations WHERE version = '019_materiel_regulator'
);
