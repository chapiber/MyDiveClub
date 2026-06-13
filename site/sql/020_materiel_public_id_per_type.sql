-- Suivi Matériel — public_id unique par type (pas globalement)

SET @idx_global = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'PORTAIL_CLUB_materiel_equipment'
    AND INDEX_NAME = 'uq_materiel_equipment_public_id'
);
SET @sql = IF(@idx_global > 0,
  'ALTER TABLE PORTAIL_CLUB_materiel_equipment DROP INDEX uq_materiel_equipment_public_id',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_type = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'PORTAIL_CLUB_materiel_equipment'
    AND INDEX_NAME = 'uq_materiel_equipment_type_public_id'
);
SET @sql2 = IF(@idx_type = 0,
  'ALTER TABLE PORTAIL_CLUB_materiel_equipment ADD UNIQUE KEY uq_materiel_equipment_type_public_id (type_id, public_id)',
  'SELECT 1');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

INSERT INTO PORTAIL_CLUB_schema_migrations (version)
SELECT '020_materiel_public_id_per_type'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM PORTAIL_CLUB_schema_migrations WHERE version = '020_materiel_public_id_per_type'
);
