-- Suivi Matériel V1 — tables + seeds (DiveKit, préfixe PORTAIL_CLUB_materiel_)

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_materiel_settings (
  setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
  value_json JSON NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_materiel_structures (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(64) NOT NULL,
  label VARCHAR(120) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_materiel_structure_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_materiel_roles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(64) NOT NULL,
  label VARCHAR(120) NOT NULL,
  description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_materiel_role_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_materiel_persons (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  display_name VARCHAR(120) NOT NULL,
  structure_id INT UNSIGNED NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_materiel_person_structure (structure_id),
  CONSTRAINT fk_materiel_person_structure
    FOREIGN KEY (structure_id) REFERENCES PORTAIL_CLUB_materiel_structures (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_materiel_person_role_links (
  person_id INT UNSIGNED NOT NULL,
  role_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (person_id, role_id),
  KEY idx_materiel_prl_role (role_id),
  CONSTRAINT fk_materiel_prl_person
    FOREIGN KEY (person_id) REFERENCES PORTAIL_CLUB_materiel_persons (id) ON DELETE CASCADE,
  CONSTRAINT fk_materiel_prl_role
    FOREIGN KEY (role_id) REFERENCES PORTAIL_CLUB_materiel_roles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_materiel_equipment_types (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(64) NOT NULL,
  label VARCHAR(120) NOT NULL,
  renewal_years INT UNSIGNED NULL,
  min_stock_alert INT UNSIGNED NULL,
  trackable TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_materiel_type_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_materiel_equipment_type_checks (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  type_id INT UNSIGNED NOT NULL,
  field_key VARCHAR(64) NOT NULL,
  label VARCHAR(120) NOT NULL,
  input_type VARCHAR(32) NOT NULL DEFAULT 'text',
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_materiel_type_check (type_id, field_key),
  CONSTRAINT fk_materiel_type_check_type
    FOREIGN KEY (type_id) REFERENCES PORTAIL_CLUB_materiel_equipment_types (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_materiel_equipment (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  public_id VARCHAR(64) NOT NULL,
  structure_id INT UNSIGNED NOT NULL,
  type_id INT UNSIGNED NOT NULL,
  brand VARCHAR(120) NOT NULL DEFAULT '',
  purchase_year SMALLINT UNSIGNED NULL,
  model VARCHAR(120) NOT NULL DEFAULT '',
  serial VARCHAR(120) NOT NULL DEFAULT '',
  state ENUM('operational','in_repair','scrapped','for_sale') NOT NULL DEFAULT 'operational',
  nfc_linked TINYINT(1) NOT NULL DEFAULT 0,
  nfc_linked_at DATETIME NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_materiel_equipment_type_public_id (type_id, public_id),
  KEY idx_materiel_equipment_structure (structure_id),
  KEY idx_materiel_equipment_type (type_id),
  KEY idx_materiel_equipment_state (state),
  CONSTRAINT fk_materiel_equipment_structure
    FOREIGN KEY (structure_id) REFERENCES PORTAIL_CLUB_materiel_structures (id),
  CONSTRAINT fk_materiel_equipment_type
    FOREIGN KEY (type_id) REFERENCES PORTAIL_CLUB_materiel_equipment_types (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_materiel_equipment_state_log (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  equipment_id INT UNSIGNED NOT NULL,
  old_state VARCHAR(32) NULL,
  new_state VARCHAR(32) NOT NULL,
  person_id INT UNSIGNED NULL,
  responsible_free VARCHAR(120) NULL,
  logged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_materiel_state_log_equipment (equipment_id),
  CONSTRAINT fk_materiel_state_log_equipment
    FOREIGN KEY (equipment_id) REFERENCES PORTAIL_CLUB_materiel_equipment (id) ON DELETE CASCADE,
  CONSTRAINT fk_materiel_state_log_person
    FOREIGN KEY (person_id) REFERENCES PORTAIL_CLUB_materiel_persons (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_materiel_interventions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  equipment_id INT UNSIGNED NOT NULL,
  subtype ENUM('revision','repair') NOT NULL,
  done_on DATE NOT NULL,
  person_id INT UNSIGNED NULL,
  responsible_free VARCHAR(120) NULL,
  summary TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_materiel_intervention_equipment (equipment_id),
  KEY idx_materiel_intervention_done (done_on),
  CONSTRAINT fk_materiel_intervention_equipment
    FOREIGN KEY (equipment_id) REFERENCES PORTAIL_CLUB_materiel_equipment (id) ON DELETE CASCADE,
  CONSTRAINT fk_materiel_intervention_person
    FOREIGN KEY (person_id) REFERENCES PORTAIL_CLUB_materiel_persons (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_materiel_intervention_check_values (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  intervention_id INT UNSIGNED NOT NULL,
  field_key VARCHAR(64) NOT NULL,
  value TEXT NOT NULL,
  UNIQUE KEY uq_materiel_intervention_check (intervention_id, field_key),
  CONSTRAINT fk_materiel_intervention_check
    FOREIGN KEY (intervention_id) REFERENCES PORTAIL_CLUB_materiel_interventions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seeds réglages
INSERT INTO PORTAIL_CLUB_materiel_settings (setting_key, value_json)
SELECT 'nfc_enabled', JSON_OBJECT('value', false)
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_materiel_settings WHERE setting_key = 'nfc_enabled');

INSERT INTO PORTAIL_CLUB_materiel_settings (setting_key, value_json)
SELECT 'id_prefix', JSON_OBJECT('value', 'EQ-')
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_materiel_settings WHERE setting_key = 'id_prefix');

INSERT INTO PORTAIL_CLUB_materiel_settings (setting_key, value_json)
SELECT 'default_structure_id', JSON_OBJECT('value', NULL)
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_materiel_settings WHERE setting_key = 'default_structure_id');

-- Rôles métier seed
INSERT INTO PORTAIL_CLUB_materiel_roles (slug, label, description, sort_order)
SELECT 'referent_materiel', 'Référent matériel', 'Responsable du parc EPI', 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_materiel_roles WHERE slug = 'referent_materiel');

INSERT INTO PORTAIL_CLUB_materiel_roles (slug, label, description, sort_order)
SELECT 'inspecteur_tiv', 'Inspecteur TIV', 'Contrôle bouteilles et TIV', 2 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_materiel_roles WHERE slug = 'inspecteur_tiv');

INSERT INTO PORTAIL_CLUB_materiel_roles (slug, label, description, sort_order)
SELECT 'technicien_detendeur', 'Technicien détendeur', 'Révision détendeurs et stab', 3 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_materiel_roles WHERE slug = 'technicien_detendeur');

-- Types EPI seed
INSERT INTO PORTAIL_CLUB_materiel_equipment_types (slug, label, renewal_years, min_stock_alert, trackable, sort_order)
SELECT 'bottle', 'Bouteille', 5, 10, 1, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_materiel_equipment_types WHERE slug = 'bottle');

INSERT INTO PORTAIL_CLUB_materiel_equipment_types (slug, label, renewal_years, min_stock_alert, trackable, sort_order)
SELECT 'regulator', 'Détendeur', 2, 5, 1, 2 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_materiel_equipment_types WHERE slug = 'regulator');

INSERT INTO PORTAIL_CLUB_materiel_equipment_types (slug, label, renewal_years, min_stock_alert, trackable, sort_order)
SELECT 'bcd', 'Gilet stabilisateur', 5, 5, 1, 3 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_materiel_equipment_types WHERE slug = 'bcd');

INSERT INTO PORTAIL_CLUB_materiel_equipment_types (slug, label, renewal_years, min_stock_alert, trackable, sort_order)
SELECT 'mask', 'Masque', 3, 8, 1, 4 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_materiel_equipment_types WHERE slug = 'mask');

INSERT INTO PORTAIL_CLUB_materiel_equipment_types (slug, label, renewal_years, min_stock_alert, trackable, sort_order)
SELECT 'fins', 'Palmes', 4, 6, 1, 5 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_materiel_equipment_types WHERE slug = 'fins');

-- Grilles contrôle bouteille
INSERT INTO PORTAIL_CLUB_materiel_equipment_type_checks (type_id, field_key, label, input_type, sort_order)
SELECT t.id, 'visual_inspection', 'Contrôle visuel', 'select_ok_ko', 1
FROM PORTAIL_CLUB_materiel_equipment_types t
WHERE t.slug = 'bottle'
  AND NOT EXISTS (
    SELECT 1 FROM PORTAIL_CLUB_materiel_equipment_type_checks c
    WHERE c.type_id = t.id AND c.field_key = 'visual_inspection'
  );

INSERT INTO PORTAIL_CLUB_materiel_equipment_type_checks (type_id, field_key, label, input_type, sort_order)
SELECT t.id, 'hydro_test', 'Épreuve hydrostatique', 'select_ok_ko', 2
FROM PORTAIL_CLUB_materiel_equipment_types t
WHERE t.slug = 'bottle'
  AND NOT EXISTS (
    SELECT 1 FROM PORTAIL_CLUB_materiel_equipment_type_checks c
    WHERE c.type_id = t.id AND c.field_key = 'hydro_test'
  );

INSERT INTO PORTAIL_CLUB_materiel_equipment_type_checks (type_id, field_key, label, input_type, sort_order)
SELECT t.id, 'valve_check', 'Contrôle robinet', 'select_ok_ko', 3
FROM PORTAIL_CLUB_materiel_equipment_types t
WHERE t.slug = 'bottle'
  AND NOT EXISTS (
    SELECT 1 FROM PORTAIL_CLUB_materiel_equipment_type_checks c
    WHERE c.type_id = t.id AND c.field_key = 'valve_check'
  );

-- Grille détendeur
INSERT INTO PORTAIL_CLUB_materiel_equipment_type_checks (type_id, field_key, label, input_type, sort_order)
SELECT t.id, 'first_stage', '1er détendeur', 'select_ok_ko', 1
FROM PORTAIL_CLUB_materiel_equipment_types t
WHERE t.slug = 'regulator'
  AND NOT EXISTS (
    SELECT 1 FROM PORTAIL_CLUB_materiel_equipment_type_checks c
    WHERE c.type_id = t.id AND c.field_key = 'first_stage'
  );

INSERT INTO PORTAIL_CLUB_materiel_equipment_type_checks (type_id, field_key, label, input_type, sort_order)
SELECT t.id, 'second_stage', '2e détendeur', 'select_ok_ko', 2
FROM PORTAIL_CLUB_materiel_equipment_types t
WHERE t.slug = 'regulator'
  AND NOT EXISTS (
    SELECT 1 FROM PORTAIL_CLUB_materiel_equipment_type_checks c
    WHERE c.type_id = t.id AND c.field_key = 'second_stage'
  );

INSERT INTO PORTAIL_CLUB_schema_migrations (version)
SELECT '017_materiel_init'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM PORTAIL_CLUB_schema_migrations WHERE version = '017_materiel_init'
);
