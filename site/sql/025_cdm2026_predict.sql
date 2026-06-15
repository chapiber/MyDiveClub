-- Pronostics CDM 2026 — membres + prédictions (compétition unique)

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_cdm_members (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  pseudo VARCHAR(40) NOT NULL,
  first_name VARCHAR(80) NOT NULL,
  client_token VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cdm_member_pseudo (pseudo),
  UNIQUE KEY uq_cdm_member_token (client_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_cdm_predictions (
  member_id INT UNSIGNED NOT NULL,
  match_id VARCHAR(8) NOT NULL,
  pred_home TINYINT UNSIGNED NOT NULL,
  pred_away TINYINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (member_id, match_id),
  KEY idx_cdm_prediction_match (match_id),
  CONSTRAINT fk_cdm_prediction_member
    FOREIGN KEY (member_id) REFERENCES PORTAIL_CLUB_cdm_members (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
