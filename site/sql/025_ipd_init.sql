-- Portail Club — Débrief IPD (compagnon mares-ipd)
-- Préfixe : PORTAIL_CLUB_

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_ipd_sessions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  external_id CHAR(36) NOT NULL,
  device_id VARCHAR(128) NOT NULL DEFAULT '',
  device_name VARCHAR(120) NULL DEFAULT NULL,
  dive_fingerprint VARCHAR(64) NULL DEFAULT NULL,
  dive_number INT UNSIGNED NULL DEFAULT NULL,
  dive_held_at DATETIME NOT NULL,
  dive_max_depth_m DECIMAL(6, 2) NULL DEFAULT NULL,
  dive_duration_sec INT UNSIGNED NULL DEFAULT NULL,
  formation_student_id INT UNSIGNED NULL DEFAULT NULL,
  formation_session_id INT UNSIGNED NULL DEFAULT NULL,
  instructor_name VARCHAR(160) NULL DEFAULT NULL,
  source_app VARCHAR(32) NOT NULL DEFAULT 'mares-ipd',
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_portail_club_ipd_external (external_id),
  KEY idx_portail_club_ipd_held (dive_held_at),
  KEY idx_portail_club_ipd_student (formation_student_id),
  KEY idx_portail_club_ipd_formation_session (formation_session_id),
  CONSTRAINT fk_portail_club_ipd_student
    FOREIGN KEY (formation_student_id) REFERENCES PORTAIL_CLUB_formation_students (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_portail_club_ipd_formation_session
    FOREIGN KEY (formation_session_id) REFERENCES PORTAIL_CLUB_formation_sessions (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_ipd_events (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id INT UNSIGNED NOT NULL,
  event_index SMALLINT UNSIGNED NOT NULL,
  is_manual TINYINT(1) NOT NULL DEFAULT 0,
  stabilization_detected TINYINT(1) NOT NULL DEFAULT 1,
  start_depth_m DECIMAL(6, 2) NULL DEFAULT NULL,
  duration_sec INT UNSIGNED NULL DEFAULT NULL,
  ascent_duration_sec INT UNSIGNED NULL DEFAULT NULL,
  max_depth_m DECIMAL(6, 2) NULL DEFAULT NULL,
  min_depth_m DECIMAL(6, 2) NULL DEFAULT NULL,
  avg_ascent_speed_mpm DECIMAL(6, 2) NULL DEFAULT NULL,
  max_ascent_speed_mpm DECIMAL(6, 2) NULL DEFAULT NULL,
  max_speed_critical TINYINT(1) NOT NULL DEFAULT 0,
  redescents_json JSON NULL,
  evaluation_level VARCHAR(16) NULL DEFAULT NULL,
  evaluation_verdict ENUM('conforme', 'a_ameliorer', 'non_conforme', 'non_applicable') NULL DEFAULT NULL,
  evaluation_summary VARCHAR(500) NULL DEFAULT NULL,
  evaluation_criteria_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_portail_club_ipd_event_session_idx (session_id, event_index),
  KEY idx_portail_club_ipd_event_session (session_id),
  CONSTRAINT fk_portail_club_ipd_event_session
    FOREIGN KEY (session_id) REFERENCES PORTAIL_CLUB_ipd_sessions (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
