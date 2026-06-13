-- Portail Club — migration initiale (DiveKit)
-- Préfixe : PORTAIL_CLUB_

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_schema_migrations (
  version VARCHAR(32) NOT NULL PRIMARY KEY,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_spaces (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id VARCHAR(80) NOT NULL,
  assistance_ref VARCHAR(32) NOT NULL,
  public_url VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_portail_club_client_id (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO PORTAIL_CLUB_spaces (client_id, assistance_ref, public_url)
SELECT '0002-Loic-SuiviFormationsClub', 'ASS-20260609-E8E93C', 'https://diveapps.serveblog.net/portailClub/'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM PORTAIL_CLUB_spaces WHERE client_id = '0002-Loic-SuiviFormationsClub'
);

INSERT INTO PORTAIL_CLUB_schema_migrations (version)
SELECT '001_init_portail_club'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM PORTAIL_CLUB_schema_migrations WHERE version = '001_init_portail_club'
);
