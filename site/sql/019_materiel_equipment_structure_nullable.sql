-- Suivi Matériel — structure_id nullable sur équipement (items sans structure)

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'PORTAIL_CLUB_materiel_equipment'
    AND CONSTRAINT_NAME = 'fk_materiel_equipment_structure'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql = IF(@fk_exists > 0,
  'ALTER TABLE PORTAIL_CLUB_materiel_equipment DROP FOREIGN KEY fk_materiel_equipment_structure',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_nullable = (
  SELECT IS_NULLABLE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'PORTAIL_CLUB_materiel_equipment'
    AND COLUMN_NAME = 'structure_id'
  LIMIT 1
);
SET @sql2 = IF(@col_nullable = 'NO',
  'ALTER TABLE PORTAIL_CLUB_materiel_equipment MODIFY structure_id INT UNSIGNED NULL',
  'SELECT 1');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SET @fk_exists2 = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'PORTAIL_CLUB_materiel_equipment'
    AND CONSTRAINT_NAME = 'fk_materiel_equipment_structure'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql3 = IF(@fk_exists2 = 0,
  'ALTER TABLE PORTAIL_CLUB_materiel_equipment ADD CONSTRAINT fk_materiel_equipment_structure FOREIGN KEY (structure_id) REFERENCES PORTAIL_CLUB_materiel_structures (id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt3 FROM @sql3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

INSERT INTO PORTAIL_CLUB_schema_migrations (version)
SELECT '019_materiel_equipment_structure_nullable'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM PORTAIL_CLUB_schema_migrations WHERE version = '019_materiel_equipment_structure_nullable'
);
