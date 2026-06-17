-- Localisations matériel sécurité (bateaux, bases, salles) — indépendantes des structures club

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_materiel_locations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(64) NOT NULL,
  label VARCHAR(120) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_materiel_location_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_materiel_location_structure_links (
  location_id INT UNSIGNED NOT NULL,
  structure_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (location_id, structure_id),
  KEY idx_materiel_lsl_structure (structure_id),
  CONSTRAINT fk_materiel_lsl_location
    FOREIGN KEY (location_id) REFERENCES PORTAIL_CLUB_materiel_locations (id) ON DELETE CASCADE,
  CONSTRAINT fk_materiel_lsl_structure
    FOREIGN KEY (structure_id) REFERENCES PORTAIL_CLUB_materiel_structures (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO PORTAIL_CLUB_materiel_locations (slug, label, sort_order)
SELECT 'caiman', 'Caiman', 10 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_materiel_locations WHERE slug = 'caiman');

INSERT INTO PORTAIL_CLUB_materiel_locations (slug, label, sort_order)
SELECT 'rederis', 'Rederis', 20 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_materiel_locations WHERE slug = 'rederis');

INSERT INTO PORTAIL_CLUB_materiel_locations (slug, label, sort_order)
SELECT 'pdv', 'PDV', 30 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_materiel_locations WHERE slug = 'pdv');

INSERT INTO PORTAIL_CLUB_materiel_locations (slug, label, sort_order)
SELECT 'formation', 'Formation', 40 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_materiel_locations WHERE slug = 'formation');

INSERT INTO PORTAIL_CLUB_materiel_locations (slug, label, sort_order)
SELECT 'aigle', 'Aigle', 50 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_materiel_locations WHERE slug = 'aigle');

INSERT INTO PORTAIL_CLUB_materiel_locations (slug, label, sort_order)
SELECT 'le_vagabond', 'Le Vagabond', 60 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_materiel_locations WHERE slug = 'le_vagabond');

INSERT INTO PORTAIL_CLUB_schema_migrations (version)
SELECT '027_materiel_locations'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM PORTAIL_CLUB_schema_migrations WHERE version = '027_materiel_locations'
);
