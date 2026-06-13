-- Badge NFC partagé (ex. paire de bouteilles)

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_materiel_nfc_groups (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @col_nfc_group = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'PORTAIL_CLUB_materiel_equipment'
    AND COLUMN_NAME = 'nfc_group_id'
);
SET @sql_nfc_group = IF(@col_nfc_group = 0,
  'ALTER TABLE PORTAIL_CLUB_materiel_equipment ADD COLUMN nfc_group_id INT UNSIGNED NULL AFTER nfc_linked_at',
  'SELECT 1');
PREPARE stmt FROM @sql_nfc_group;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO PORTAIL_CLUB_schema_migrations (version)
SELECT '022_materiel_nfc_group'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM PORTAIL_CLUB_schema_migrations WHERE version = '022_materiel_nfc_group'
);
