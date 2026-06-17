-- Registre sécurité médical : domaine types, location_id, types sécurité, seeds O2

SET @db := DATABASE();

SET @col_domain := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'PORTAIL_CLUB_materiel_equipment_types'
    AND COLUMN_NAME = 'domain'
);
SET @sql_domain := IF(@col_domain = 0,
  'ALTER TABLE PORTAIL_CLUB_materiel_equipment_types
     ADD COLUMN domain ENUM(''epi'',''security'') NOT NULL DEFAULT ''epi'' AFTER slug',
  'SELECT 1');
PREPARE stmt FROM @sql_domain; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_loc := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'PORTAIL_CLUB_materiel_equipment'
    AND COLUMN_NAME = 'location_id'
);
SET @sql_loc := IF(@col_loc = 0,
  'ALTER TABLE PORTAIL_CLUB_materiel_equipment
     ADD COLUMN location_id INT UNSIGNED NULL AFTER structure_id,
     ADD KEY idx_materiel_equipment_location (location_id)',
  'SELECT 1');
PREPARE stmt FROM @sql_loc; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_loc := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'PORTAIL_CLUB_materiel_equipment'
    AND CONSTRAINT_NAME = 'fk_materiel_equipment_location'
);
SET @sql_fk := IF(@fk_loc = 0,
  'ALTER TABLE PORTAIL_CLUB_materiel_equipment
     ADD CONSTRAINT fk_materiel_equipment_location
     FOREIGN KEY (location_id) REFERENCES PORTAIL_CLUB_materiel_locations (id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql_fk; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exp := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'PORTAIL_CLUB_materiel_equipment'
    AND COLUMN_NAME = 'expiry_on'
);
SET @sql_exp := IF(@col_exp = 0,
  'ALTER TABLE PORTAIL_CLUB_materiel_equipment
     ADD COLUMN expiry_on DATE NULL AFTER specs_json',
  'SELECT 1');
PREPARE stmt FROM @sql_exp; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @uq_loc := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'PORTAIL_CLUB_materiel_equipment'
    AND INDEX_NAME = 'uq_materiel_equipment_location_type'
);
SET @sql_uq := IF(@uq_loc = 0,
  'ALTER TABLE PORTAIL_CLUB_materiel_equipment
     ADD UNIQUE KEY uq_materiel_equipment_location_type (location_id, type_id)',
  'SELECT 1');
PREPARE stmt FROM @sql_uq; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Types sécurité
INSERT INTO PORTAIL_CLUB_materiel_equipment_types
  (slug, domain, label, renewal_policy, revision_policy, trackable, sort_order)
SELECT 'o2', 'security', 'Oxygène', 'manual', 'none', 1, 100 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_materiel_equipment_types WHERE slug = 'o2');

INSERT INTO PORTAIL_CLUB_materiel_equipment_types
  (slug, domain, label, renewal_policy, revision_policy, trackable, sort_order)
SELECT 'bavu', 'security', 'Kit BAVU', 'manual', 'none', 1, 110 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_materiel_equipment_types WHERE slug = 'bavu');

INSERT INTO PORTAIL_CLUB_materiel_equipment_types
  (slug, domain, label, renewal_policy, revision_policy, trackable, sort_order)
SELECT 'dae', 'security', 'Défibrillateur', 'manual', 'none', 1, 120 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_materiel_equipment_types WHERE slug = 'dae');

INSERT INTO PORTAIL_CLUB_materiel_equipment_types
  (slug, domain, label, renewal_policy, revision_policy, trackable, sort_order)
SELECT 'aspiration_mucosites', 'security', 'Aspi. mucosités', 'manual', 'none', 0, 130 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_materiel_equipment_types WHERE slug = 'aspiration_mucosites');

INSERT INTO PORTAIL_CLUB_materiel_equipment_types
  (slug, domain, label, renewal_policy, revision_policy, trackable, sort_order)
SELECT 'trousse_secours', 'security', 'Trousse secours', 'manual', 'none', 0, 140 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_materiel_equipment_types WHERE slug = 'trousse_secours');

INSERT INTO PORTAIL_CLUB_materiel_equipment_types
  (slug, domain, label, renewal_policy, revision_policy, trackable, sort_order)
SELECT 'couvertures_survie', 'security', 'Couvertures survie', 'manual', 'none', 0, 150 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_materiel_equipment_types WHERE slug = 'couvertures_survie');

-- Équipements sécurité par localisation (création si absent)
INSERT INTO PORTAIL_CLUB_materiel_equipment (public_id, structure_id, location_id, type_id, brand, state, specs_json)
SELECT CONCAT(UPPER(t.slug), '-', UPPER(REPLACE(l.slug, 'le_', ''))),
       NULL, l.id, t.id, '', 'operational', NULL
FROM PORTAIL_CLUB_materiel_locations l
CROSS JOIN PORTAIL_CLUB_materiel_equipment_types t
WHERE t.domain = 'security'
  AND NOT EXISTS (
    SELECT 1 FROM PORTAIL_CLUB_materiel_equipment e
    WHERE e.location_id = l.id AND e.type_id = t.id
  );

-- Données O2 connues (registre 03/05/2026)
UPDATE PORTAIL_CLUB_materiel_equipment e
INNER JOIN PORTAIL_CLUB_materiel_locations l ON l.id = e.location_id
INNER JOIN PORTAIL_CLUB_materiel_equipment_types t ON t.id = e.type_id AND t.slug = 'o2'
SET e.specs_json = JSON_OBJECT(
      'supplier', 'LINDE',
      'capacity', '5L / 1m3',
      'revision_due_on', '2030-06-01',
      'gauge_status', 'full_ok'
    ),
    e.brand = 'LINDE'
WHERE l.slug = 'caiman'
  AND (e.specs_json IS NULL OR JSON_LENGTH(e.specs_json) = 0 OR e.specs_json = JSON_OBJECT());

UPDATE PORTAIL_CLUB_materiel_equipment e
INNER JOIN PORTAIL_CLUB_materiel_locations l ON l.id = e.location_id
INNER JOIN PORTAIL_CLUB_materiel_equipment_types t ON t.id = e.type_id AND t.slug = 'o2'
SET e.specs_json = JSON_OBJECT(
      'supplier', 'AIR LIQUIDE',
      'capacity', '2.3m3',
      'revision_due_on', '2017-06-01',
      'gauge_status', 'low'
    ),
    e.brand = 'AIR LIQUIDE'
WHERE l.slug = 'rederis';

UPDATE PORTAIL_CLUB_materiel_equipment e
INNER JOIN PORTAIL_CLUB_materiel_locations l ON l.id = e.location_id
INNER JOIN PORTAIL_CLUB_materiel_equipment_types t ON t.id = e.type_id AND t.slug = 'o2'
SET e.specs_json = JSON_OBJECT(
      'supplier', 'LINDE',
      'capacity', '',
      'revision_due_on', '2026-03-01',
      'gauge_status', 'full_ok'
    ),
    e.brand = 'LINDE'
WHERE l.slug = 'pdv';

UPDATE PORTAIL_CLUB_materiel_equipment e
INNER JOIN PORTAIL_CLUB_materiel_locations l ON l.id = e.location_id
INNER JOIN PORTAIL_CLUB_materiel_equipment_types t ON t.id = e.type_id AND t.slug = 'o2'
SET e.specs_json = JSON_OBJECT(
      'supplier', 'LINDE',
      'capacity', '',
      'revision_due_on', '2026-08-01',
      'gauge_status', 'full_ok'
    ),
    e.brand = 'LINDE'
WHERE l.slug = 'formation';

UPDATE PORTAIL_CLUB_materiel_equipment e
INNER JOIN PORTAIL_CLUB_materiel_locations l ON l.id = e.location_id
INNER JOIN PORTAIL_CLUB_materiel_equipment_types t ON t.id = e.type_id AND t.slug = 'o2'
SET e.specs_json = JSON_OBJECT(
      'supplier', 'LINDE',
      'capacity', '',
      'revision_due_on', '2030-08-01',
      'gauge_status', 'full_ok'
    ),
    e.brand = 'LINDE'
WHERE l.slug = 'aigle';

UPDATE PORTAIL_CLUB_materiel_equipment e
INNER JOIN PORTAIL_CLUB_materiel_locations l ON l.id = e.location_id
INNER JOIN PORTAIL_CLUB_materiel_equipment_types t ON t.id = e.type_id AND t.slug = 'o2'
SET e.specs_json = JSON_OBJECT(
      'supplier', 'LINDE',
      'capacity', '',
      'revision_due_on', '2030-08-01',
      'gauge_status', 'full_ok'
    ),
    e.brand = 'LINDE'
WHERE l.slug = 'le_vagabond';

INSERT INTO PORTAIL_CLUB_schema_migrations (version)
SELECT '028_materiel_security'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM PORTAIL_CLUB_schema_migrations WHERE version = '028_materiel_security'
);
