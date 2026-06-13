-- Portail Club — Suivi Formation V1 (schéma métier)
-- Préfixe : PORTAIL_CLUB_

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_catalog_orgs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(16) NOT NULL,
  name VARCHAR(80) NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_portail_club_catalog_org_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_catalog_levels (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(120) NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_portail_club_catalog_level_org_code (org_id, code),
  KEY idx_portail_club_catalog_level_org (org_id),
  CONSTRAINT fk_portail_club_level_org
    FOREIGN KEY (org_id) REFERENCES PORTAIL_CLUB_catalog_orgs (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_catalog_skills (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  level_id INT UNSIGNED NOT NULL,
  code VARCHAR(48) NOT NULL,
  name VARCHAR(160) NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_portail_club_catalog_skill_level_code (level_id, code),
  KEY idx_portail_club_catalog_skill_level (level_id),
  CONSTRAINT fk_portail_club_skill_level
    FOREIGN KEY (level_id) REFERENCES PORTAIL_CLUB_catalog_levels (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_formations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  level_id INT UNSIGNED NOT NULL,
  student_mode ENUM('solo', 'group') NOT NULL DEFAULT 'solo',
  status ENUM('in_progress', 'archived') NOT NULL DEFAULT 'in_progress',
  ok_to_certify TINYINT(1) NULL DEFAULT NULL,
  certification_obtained TINYINT(1) NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at DATETIME NULL DEFAULT NULL,
  KEY idx_portail_club_formations_status (status),
  KEY idx_portail_club_formations_created (created_at),
  CONSTRAINT fk_portail_club_formation_level
    FOREIGN KEY (level_id) REFERENCES PORTAIL_CLUB_catalog_levels (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_formation_students (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  formation_id INT UNSIGNED NOT NULL,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  KEY idx_portail_club_students_formation (formation_id),
  CONSTRAINT fk_portail_club_student_formation
    FOREIGN KEY (formation_id) REFERENCES PORTAIL_CLUB_formations (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_formation_sessions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  formation_id INT UNSIGNED NOT NULL,
  session_number SMALLINT UNSIGNED NOT NULL,
  held_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_portail_club_session_formation_number (formation_id, session_number),
  KEY idx_portail_club_sessions_held (held_at),
  CONSTRAINT fk_portail_club_session_formation
    FOREIGN KEY (formation_id) REFERENCES PORTAIL_CLUB_formations (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_session_evaluations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  skill_id INT UNSIGNED NOT NULL,
  instructor_name VARCHAR(80) NOT NULL,
  eval_level ENUM('na', 'not_mastered', 'acquiring', 'mastered') NOT NULL DEFAULT 'na',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_portail_club_eval_session_student_skill (session_id, student_id, skill_id),
  KEY idx_portail_club_eval_session (session_id),
  CONSTRAINT fk_portail_club_eval_session
    FOREIGN KEY (session_id) REFERENCES PORTAIL_CLUB_formation_sessions (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_portail_club_eval_student
    FOREIGN KEY (student_id) REFERENCES PORTAIL_CLUB_formation_students (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_portail_club_eval_skill
    FOREIGN KEY (skill_id) REFERENCES PORTAIL_CLUB_catalog_skills (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_recent_instructors (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(80) NOT NULL,
  last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_portail_club_recent_instructor_name (first_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO PORTAIL_CLUB_schema_migrations (version)
SELECT '002_formations'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM PORTAIL_CLUB_schema_migrations WHERE version = '002_formations'
);
