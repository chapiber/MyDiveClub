-- Portail Club — compétences essentielles N1 / OW (idempotent, ré-exécutable)

-- FFESSM N1 — nouvelles compétences (les renommages sont dans 005)
INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'lre', 'LRE — Lâcher Reprise d\'Embout', 2
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N1'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'lre');

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'panne_air_relais', 'Panne d\'air — relais octopus', 3
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N1'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'panne_air_relais');

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'equilibrage', 'Équilibrage (oreilles / BTV)', 4
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N1'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'equilibrage');

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'immersion', 'Immersion contrôlée', 5
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N1'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'immersion');

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'propulsion', 'Propulsion / palmage', 6
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N1'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'propulsion');

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'mise_eau', 'Mise à l\'eau et sortie', 7
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N1'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'mise_eau');

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'equipement', 'Équipement et déséquipement', 8
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N1'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'equipement');

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'communication', 'Communication sous-marine', 9
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N1'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'communication');

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'palanquee', 'Évolution en palanquée guidée', 10
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N1'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'palanquee');

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'remontee', 'Remontée contrôlée', 11
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N1'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'remontee');

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'flottabilite', 'Flottabilité et stabilisation', 12
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N1'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'flottabilite');

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'securite', 'Conduites de sécurité', 13
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N1'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'securite');

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'binome_check', 'Contrôle binôme', 14
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N1'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'binome_check');

-- PADI OW — équivalents essentiels
INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'lre', 'LRE — Récupération détendeur', 3
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'PADI' AND l.code = 'OW'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'lre');

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'panne_air_relais', 'Panne d\'air — source alternative', 4
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'PADI' AND l.code = 'OW'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'panne_air_relais');

INSERT INTO PORTAIL_CLUB_schema_migrations (version)
SELECT '004_catalog_n1_essentials'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM PORTAIL_CLUB_schema_migrations WHERE version = '004_catalog_n1_essentials'
);
