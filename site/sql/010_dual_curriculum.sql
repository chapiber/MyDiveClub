-- Double cursus : plusieurs niveaux catalogue par formation (idempotent)

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_formation_levels (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  formation_id INT UNSIGNED NOT NULL,
  level_id INT UNSIGNED NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_portail_club_formation_level (formation_id, level_id),
  KEY idx_portail_club_formation_levels_formation (formation_id),
  KEY idx_portail_club_formation_levels_level (level_id),
  CONSTRAINT fk_portail_club_fl_formation
    FOREIGN KEY (formation_id) REFERENCES PORTAIL_CLUB_formations (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_portail_club_fl_level
    FOREIGN KEY (level_id) REFERENCES PORTAIL_CLUB_catalog_levels (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_formation_level_closure (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  formation_id INT UNSIGNED NOT NULL,
  level_id INT UNSIGNED NOT NULL,
  ok_to_certify TINYINT(1) NULL DEFAULT NULL,
  certification_obtained TINYINT(1) NULL DEFAULT NULL,
  UNIQUE KEY uq_portail_club_flc_formation_level (formation_id, level_id),
  KEY idx_portail_club_flc_formation (formation_id),
  CONSTRAINT fk_portail_club_flc_formation
    FOREIGN KEY (formation_id) REFERENCES PORTAIL_CLUB_formations (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_portail_club_flc_level
    FOREIGN KEY (level_id) REFERENCES PORTAIL_CLUB_catalog_levels (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration des formations existantes (cursus principal)
INSERT IGNORE INTO PORTAIL_CLUB_formation_levels (formation_id, level_id, sort_order)
SELECT f.id, f.level_id, 0
FROM PORTAIL_CLUB_formations f;

-- Migration des décisions de clôture existantes
INSERT IGNORE INTO PORTAIL_CLUB_formation_level_closure (formation_id, level_id, ok_to_certify, certification_obtained)
SELECT f.id, f.level_id, f.ok_to_certify, f.certification_obtained
FROM PORTAIL_CLUB_formations f
WHERE f.ok_to_certify IS NOT NULL OR f.certification_obtained IS NOT NULL;
