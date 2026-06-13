-- Nettoyage skills legacy (custom_*, doublons pré-migration) — idempotent

DELETE s FROM PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N2' AND s.code IN ('custom_pa', 'custom_brief');

DELETE s FROM PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'PADI' AND l.code = 'OW' AND s.code = 'lre';

INSERT INTO PORTAIL_CLUB_schema_migrations (version)
SELECT '012_skill_legacy_cleanup'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM PORTAIL_CLUB_schema_migrations WHERE version = '012_skill_legacy_cleanup'
);
