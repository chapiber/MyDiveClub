-- Paire logique entre équipements (ex. twinset — badges NFC distincts)

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_materiel_pairs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @col_pair_id = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'PORTAIL_CLUB_materiel_equipment'
    AND COLUMN_NAME = 'pair_id'
);
SET @sql_pair_id = IF(@col_pair_id = 0,
  'ALTER TABLE PORTAIL_CLUB_materiel_equipment ADD COLUMN pair_id INT UNSIGNED NULL AFTER nfc_group_id',
  'SELECT 1');
PREPARE stmt FROM @sql_pair_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_allows_pairing = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'PORTAIL_CLUB_materiel_equipment_types'
    AND COLUMN_NAME = 'allows_pairing'
);
SET @sql_allows_pairing = IF(@col_allows_pairing = 0,
  'ALTER TABLE PORTAIL_CLUB_materiel_equipment_types ADD COLUMN allows_pairing TINYINT(1) NOT NULL DEFAULT 0 AFTER trackable',
  'SELECT 1');
PREPARE stmt FROM @sql_allows_pairing;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE PORTAIL_CLUB_materiel_equipment_types SET allows_pairing = 1 WHERE slug = 'bottle';

INSERT INTO PORTAIL_CLUB_schema_migrations (version)
SELECT '023_materiel_equipment_pair'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM PORTAIL_CLUB_schema_migrations WHERE version = '023_materiel_equipment_pair'
);
