-- Portail Club — seed catalogue minimal (4 orgs + 1 niveau / compétences de base)
-- Idempotent : INSERT … SELECT … WHERE NOT EXISTS

INSERT INTO PORTAIL_CLUB_catalog_orgs (code, name, sort_order)
SELECT 'FFESSM', 'FFESSM', 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_orgs WHERE code = 'FFESSM');

INSERT INTO PORTAIL_CLUB_catalog_orgs (code, name, sort_order)
SELECT 'PADI', 'PADI', 2 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_orgs WHERE code = 'PADI');

INSERT INTO PORTAIL_CLUB_catalog_orgs (code, name, sort_order)
SELECT 'SSI', 'SSI', 3 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_orgs WHERE code = 'SSI');

INSERT INTO PORTAIL_CLUB_catalog_orgs (code, name, sort_order)
SELECT 'ANMP', 'ANMP', 4 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_orgs WHERE code = 'ANMP');

INSERT INTO PORTAIL_CLUB_catalog_levels (org_id, code, name, sort_order)
SELECT o.id, 'N1', 'Niveau 1', 1
FROM PORTAIL_CLUB_catalog_orgs o
WHERE o.code = 'FFESSM'
  AND NOT EXISTS (
    SELECT 1 FROM PORTAIL_CLUB_catalog_levels l
    WHERE l.org_id = o.id AND l.code = 'N1'
  );

INSERT INTO PORTAIL_CLUB_catalog_levels (org_id, code, name, sort_order)
SELECT o.id, 'OW', 'Open Water Diver', 1
FROM PORTAIL_CLUB_catalog_orgs o
WHERE o.code = 'PADI'
  AND NOT EXISTS (
    SELECT 1 FROM PORTAIL_CLUB_catalog_levels l
    WHERE l.org_id = o.id AND l.code = 'OW'
  );

INSERT INTO PORTAIL_CLUB_catalog_levels (org_id, code, name, sort_order)
SELECT o.id, 'OWD', 'Open Water Diver', 1
FROM PORTAIL_CLUB_catalog_orgs o
WHERE o.code = 'SSI'
  AND NOT EXISTS (
    SELECT 1 FROM PORTAIL_CLUB_catalog_levels l
    WHERE l.org_id = o.id AND l.code = 'OWD'
  );

INSERT INTO PORTAIL_CLUB_catalog_levels (org_id, code, name, sort_order)
SELECT o.id, 'NIV1', 'Niveau 1', 1
FROM PORTAIL_CLUB_catalog_orgs o
WHERE o.code = 'ANMP'
  AND NOT EXISTS (
    SELECT 1 FROM PORTAIL_CLUB_catalog_levels l
    WHERE l.org_id = o.id AND l.code = 'NIV1'
  );

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'mask_clear', 'Vidage de masque', 1
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N1'
  AND NOT EXISTS (
    SELECT 1 FROM PORTAIL_CLUB_catalog_skills s
    WHERE s.level_id = l.id AND s.code = 'mask_clear'
  );

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'buoyancy', 'Flottabilité', 2
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N1'
  AND NOT EXISTS (
    SELECT 1 FROM PORTAIL_CLUB_catalog_skills s
    WHERE s.level_id = l.id AND s.code = 'buoyancy'
  );

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'mask_clear', 'Vidage de masque', 1
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'PADI' AND l.code = 'OW'
  AND NOT EXISTS (
    SELECT 1 FROM PORTAIL_CLUB_catalog_skills s
    WHERE s.level_id = l.id AND s.code = 'mask_clear'
  );

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'buoyancy', 'Flottabilité', 2
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'PADI' AND l.code = 'OW'
  AND NOT EXISTS (
    SELECT 1 FROM PORTAIL_CLUB_catalog_skills s
    WHERE s.level_id = l.id AND s.code = 'buoyancy'
  );

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'mask_clear', 'Vidage de masque', 1
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'SSI' AND l.code = 'OWD'
  AND NOT EXISTS (
    SELECT 1 FROM PORTAIL_CLUB_catalog_skills s
    WHERE s.level_id = l.id AND s.code = 'mask_clear'
  );

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'buoyancy', 'Flottabilité', 2
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'SSI' AND l.code = 'OWD'
  AND NOT EXISTS (
    SELECT 1 FROM PORTAIL_CLUB_catalog_skills s
    WHERE s.level_id = l.id AND s.code = 'buoyancy'
  );

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'mask_clear', 'Vidage de masque', 1
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'ANMP' AND l.code = 'NIV1'
  AND NOT EXISTS (
    SELECT 1 FROM PORTAIL_CLUB_catalog_skills s
    WHERE s.level_id = l.id AND s.code = 'mask_clear'
  );

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'buoyancy', 'Flottabilité', 2
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'ANMP' AND l.code = 'NIV1'
  AND NOT EXISTS (
    SELECT 1 FROM PORTAIL_CLUB_catalog_skills s
    WHERE s.level_id = l.id AND s.code = 'buoyancy'
  );

INSERT INTO PORTAIL_CLUB_schema_migrations (version)
SELECT '003_catalog_seed_core'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM PORTAIL_CLUB_schema_migrations WHERE version = '003_catalog_seed_core'
);
