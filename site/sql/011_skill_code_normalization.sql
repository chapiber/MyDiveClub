-- Portail Club — normalisation codes skills (ORG+LEVEL-NN-ABBR)
-- Idempotent : UPDATE uniquement si code non normalisé ; INSERT si absent.

-- FFESSM PE12
UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFPE12-01-EQU', s.name = 'Équipement et mise à l''eau', s.sort_order = 1
WHERE o.code = 'FFESSM' AND l.code = 'PE12' AND s.code = 'equipment';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFPE12-02-VDM', s.name = 'Vidage de masque', s.sort_order = 2
WHERE o.code = 'FFESSM' AND l.code = 'PE12' AND s.code = 'mask_clear';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFPE12-03-LRE', s.name = 'Récupération détendeur', s.sort_order = 3
WHERE o.code = 'FFESSM' AND l.code = 'PE12' AND s.code = 'regulator_recovery';

-- FFESSM N1
UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN1-01-MAT', s.name = 'Équipement et déséquipement', s.sort_order = 1
WHERE o.code = 'FFESSM' AND l.code = 'N1' AND s.code IN ('equipement', 'equipment');

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN1-02-VDM', s.name = 'Vidage de masque', s.sort_order = 2
WHERE o.code = 'FFESSM' AND l.code = 'N1' AND s.code IN ('vdm', 'mask_clear');

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN1-03-LRE', s.name = 'Lâcher reprise d''embout', s.sort_order = 3
WHERE o.code = 'FFESSM' AND l.code = 'N1' AND s.code = 'lre';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN1-04-BTV', s.name = 'Équilibrage oreilles', s.sort_order = 4
WHERE o.code = 'FFESSM' AND l.code = 'N1' AND s.code = 'equilibrage';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN1-05-FLT', s.name = 'Flottabilité et stabilisation', s.sort_order = 5
WHERE o.code = 'FFESSM' AND l.code = 'N1' AND s.code IN ('flottabilite', 'buoyancy');

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN1-06-PA', s.name = 'Panne d''air — relais octopus', s.sort_order = 6
WHERE o.code = 'FFESSM' AND l.code = 'N1' AND s.code = 'panne_air_relais';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN1-07-COM', s.name = 'Communication sous-marine', s.sort_order = 7
WHERE o.code = 'FFESSM' AND l.code = 'N1' AND s.code = 'communication';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN1-08-PRP', s.name = 'Propulsion / palmage', s.sort_order = 8
WHERE o.code = 'FFESSM' AND l.code = 'N1' AND s.code = 'propulsion';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN1-09-IMM', s.name = 'Immersion contrôlée', s.sort_order = 9
WHERE o.code = 'FFESSM' AND l.code = 'N1' AND s.code = 'immersion';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN1-10-MEE', s.name = 'Mise à l''eau et sortie', s.sort_order = 10
WHERE o.code = 'FFESSM' AND l.code = 'N1' AND s.code = 'mise_eau';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN1-11-PAL', s.name = 'Évolution en palanquée guidée', s.sort_order = 11
WHERE o.code = 'FFESSM' AND l.code = 'N1' AND s.code = 'palanquee';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN1-12-RMT', s.name = 'Remontée contrôlée', s.sort_order = 12
WHERE o.code = 'FFESSM' AND l.code = 'N1' AND s.code = 'remontee';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN1-13-SEC', s.name = 'Conduites de sécurité', s.sort_order = 13
WHERE o.code = 'FFESSM' AND l.code = 'N1' AND s.code = 'securite';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN1-14-CHK', s.name = 'Contrôle binôme', s.sort_order = 14
WHERE o.code = 'FFESSM' AND l.code = 'N1' AND s.code = 'binome_check';

-- FFESSM N2
UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN2-01-VDM', s.name = 'VDM complet', s.sort_order = 1
WHERE o.code = 'FFESSM' AND l.code = 'N2' AND s.code = 'custom_vdm';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN2-02-LRE', s.name = 'LRE complet', s.sort_order = 2
WHERE o.code = 'FFESSM' AND l.code = 'N2' AND s.code = 'custom_lre';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN2-03-BAL', s.name = 'Check matériel croisé', s.sort_order = 3
WHERE o.code = 'FFESSM' AND l.code = 'N2' AND s.code = 'custom_ballo';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN2-04-PAR', s.name = 'Parachute de palier', s.sort_order = 4
WHERE o.code = 'FFESSM' AND l.code = 'N2' AND s.code = 'custom_parachute';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN2-05-NAV', s.name = 'Orientation sans instrument', s.sort_order = 5
WHERE o.code = 'FFESSM' AND l.code = 'N2' AND s.code = 'navigation';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN2-06-NAVB', s.name = 'Orientation boussole', s.sort_order = 6
WHERE o.code = 'FFESSM' AND l.code = 'N2' AND s.code = 'deep_dive';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN2-07-IPD', s.name = 'IPD remontée assistée 20 m', s.sort_order = 7
WHERE o.code = 'FFESSM' AND l.code = 'N2' AND s.code = 'custom_ipd';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN2-08-PROF', s.name = 'Plongée profonde 40 m', s.sort_order = 8
WHERE o.code = 'FFESSM' AND l.code = 'N2' AND s.code = 'custom_plong_e_profonde';

-- FFESSM N3
UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN3-01-PLAN', s.name = 'Planification', s.sort_order = 1
WHERE o.code = 'FFESSM' AND l.code = 'N3' AND s.code = 'planning';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN3-02-BRF', s.name = 'Briefing profonde', s.sort_order = 2
WHERE o.code = 'FFESSM' AND l.code = 'N3' AND s.code = 'custom_briefing_autonome_profonde';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN3-03-AUTP', s.name = 'Autonomie profonde', s.sort_order = 3
WHERE o.code = 'FFESSM' AND l.code = 'N3' AND s.code = 'custom_autonomie_profonde';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN3-04-AUTO', s.name = 'Autonomie orientation', s.sort_order = 4
WHERE o.code = 'FFESSM' AND l.code = 'N3' AND s.code = 'custom_autonomie_orientation';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN3-05-IPD', s.name = 'IPD assistance 40 m', s.sort_order = 5
WHERE o.code = 'FFESSM' AND l.code = 'N3' AND s.code = 'custom_ipd';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'FFN3-06-RIF', s.name = 'RIFAP — secourisme', s.sort_order = 6
WHERE o.code = 'FFESSM' AND l.code = 'N3' AND s.code = 'custom_rifap';

-- PADI OW
UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'PAOW-01-MSK', s.name = 'Mask clearing', s.sort_order = 1
WHERE o.code = 'PADI' AND l.code = 'OW' AND s.code = 'mask_clear';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'PAOW-02-BUO', s.name = 'Buoyancy control', s.sort_order = 2
WHERE o.code = 'PADI' AND l.code = 'OW' AND s.code = 'buoyancy';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'PAOW-03-LRE', s.name = 'Regulator recovery', s.sort_order = 3
WHERE o.code = 'PADI' AND l.code = 'OW' AND s.code = 'regulator_recovery';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'PAOW-04-ASC', s.name = 'Controlled ascent', s.sort_order = 4
WHERE o.code = 'PADI' AND l.code = 'OW' AND s.code = 'ascend_control';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'PAOW-05-AAS', s.name = 'Alternate air source', s.sort_order = 5
WHERE o.code = 'PADI' AND l.code = 'OW' AND s.code = 'panne_air_relais';

-- PADI AOW
UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'PAAOW-01-DEEP', s.name = 'Deep dive', s.sort_order = 1
WHERE o.code = 'PADI' AND l.code = 'AOW' AND s.code = 'deep_dive';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'PAAOW-02-NAV', s.name = 'Underwater navigation', s.sort_order = 2
WHERE o.code = 'PADI' AND l.code = 'AOW' AND s.code = 'navigation';

-- PADI RESCUE
UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'PARESCUE-01-STR', s.name = 'Stress recognition', s.sort_order = 1
WHERE o.code = 'PADI' AND l.code = 'RESCUE' AND s.code = 'stress_recognition';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'PARESCUE-02-TIR', s.name = 'Rescue assistance', s.sort_order = 2
WHERE o.code = 'PADI' AND l.code = 'RESCUE' AND s.code = 'rescue_assist';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'PARESCUE-07-EAP', s.name = 'Emergency assistance plan', s.sort_order = 7
WHERE o.code = 'PADI' AND l.code = 'RESCUE' AND s.code = 'emergency_plan';

-- SSI OWD
UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'SIOWD-01-VDM', s.name = 'Vidage de masque', s.sort_order = 1
WHERE o.code = 'SSI' AND l.code = 'OWD' AND s.code = 'mask_clear';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'SIOWD-02-FLT', s.name = 'Flottabilité', s.sort_order = 2
WHERE o.code = 'SSI' AND l.code = 'OWD' AND s.code = 'buoyancy';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'SIOWD-03-LRE', s.name = 'Récupération détendeur', s.sort_order = 3
WHERE o.code = 'SSI' AND l.code = 'OWD' AND s.code = 'regulator_recovery';

-- SSI AOWD
UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'SIAOWD-01-PROF', s.name = 'Plongée profonde', s.sort_order = 1
WHERE o.code = 'SSI' AND l.code = 'AOWD' AND s.code = 'deep_dive';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'SIAOWD-02-NAV', s.name = 'Navigation', s.sort_order = 2
WHERE o.code = 'SSI' AND l.code = 'AOWD' AND s.code = 'navigation';

-- SSI STRESS
UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'SISTRESS-01-STR', s.name = 'Gestion du stress', s.sort_order = 1
WHERE o.code = 'SSI' AND l.code = 'STRESS' AND s.code = 'stress_management';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'SISTRESS-02-SEC', s.name = 'Secourisme', s.sort_order = 2
WHERE o.code = 'SSI' AND l.code = 'STRESS' AND s.code = 'rescue';

-- ANMP
UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'ANINIT-01-DEC', s.name = 'Découverte matériel', s.sort_order = 1
WHERE o.code = 'ANMP' AND l.code = 'INIT' AND s.code = 'discovery';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'ANINIT-02-VDM', s.name = 'Vidage de masque', s.sort_order = 2
WHERE o.code = 'ANMP' AND l.code = 'INIT' AND s.code = 'mask_clear';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'ANNIV1-01-VDM', s.name = 'Vidage de masque', s.sort_order = 1
WHERE o.code = 'ANMP' AND l.code = 'NIV1' AND s.code = 'mask_clear';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'ANNIV1-02-FLT', s.name = 'Flottabilité', s.sort_order = 2
WHERE o.code = 'ANMP' AND l.code = 'NIV1' AND s.code = 'buoyancy';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'ANNIV1-03-RMT', s.name = 'Contrôle de remontée', s.sort_order = 3
WHERE o.code = 'ANMP' AND l.code = 'NIV1' AND s.code = 'ascend_control';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'ANNIV2-01-NAV', s.name = 'Navigation', s.sort_order = 1
WHERE o.code = 'ANMP' AND l.code = 'NIV2' AND s.code = 'navigation';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'ANNIV2-02-PROF', s.name = 'Plongée profonde', s.sort_order = 2
WHERE o.code = 'ANMP' AND l.code = 'NIV2' AND s.code = 'deep_dive';

-- Nettoyage libellés « ABBR — libellé » → libellé seul
UPDATE PORTAIL_CLUB_catalog_skills
SET name = TRIM(SUBSTRING_INDEX(name, '—', -1))
WHERE name LIKE '%—%' AND name REGEXP '^[A-Z0-9]{2,12}[[:space:]]*—';

UPDATE PORTAIL_CLUB_catalog_skills
SET name = TRIM(SUBSTRING_INDEX(name, '–', -1))
WHERE name LIKE '%–%' AND name REGEXP '^[A-Z0-9]{2,12}[[:space:]]*–';

-- Insertions nouveaux skills (idempotent)
INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'FFN1-15-VDMP', 'Vidage masque complet / retrait masque', 15
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N1'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'FFN1-15-VDMP');

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'FFN1-16-GRE', 'Gréer / dégréer bloc-gilet', 16
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N1'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'FFN1-16-GRE');

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'FFN1-17-CON', 'Surveillance consommation / manomètre', 17
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N1'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'FFN1-17-CON');

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'FFN1-18-MIL', 'Milieu et environnement marin', 18
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N1'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'FFN1-18-MIL');

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'FFN2-09-ORDI', 'Ordinateur de plongée', 9
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N2'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'FFN2-09-ORDI');

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'FFN2-10-PLAN', 'Planification sans palier', 10
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N2'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'FFN2-10-PLAN');

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'FFN2-11-DTR', 'Durée totale remontée', 11
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N2'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'FFN2-11-DTR');

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'FFN2-12-PA', 'Panne d''air en relais', 12
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N2'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'FFN2-12-PA');

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'FFN3-07-IPD35', 'IPD 35 → 5 m', 7
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N3'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'FFN3-07-IPD35');

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'FFN3-08-DTR', 'Planification DTR', 8
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N3'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'FFN3-08-DTR');

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, 'FFN3-09-SITE', 'Choix site de plongée', 9
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N3'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = 'FFN3-09-SITE');

-- PADI OW nouveaux
INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, v.code, v.name, v.sort_order
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
JOIN (
  SELECT 'PAOW-06-EQU' AS code, 'Equipment setup and buddy check' AS name, 6 AS sort_order UNION ALL
  SELECT 'PAOW-07-BCD', 'BCD inflate / deflate', 7 UNION ALL
  SELECT 'PAOW-08-MSKR', 'Mask removal and replacement', 8 UNION ALL
  SELECT 'PAOW-09-CESA', 'Controlled emergency swimming ascent', 9 UNION ALL
  SELECT 'PAOW-10-HOV', 'Hovering / neutral buoyancy', 10 UNION ALL
  SELECT 'PAOW-11-TOW', 'Tired diver tow', 11 UNION ALL
  SELECT 'PAOW-12-SSP', 'Safety stop', 12
) v
WHERE o.code = 'PADI' AND l.code = 'OW'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = v.code);

-- PADI AOW nouveaux
INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, v.code, v.name, v.sort_order
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
JOIN (
  SELECT 'PAAOW-03-NIGHT' AS code, 'Night dive' AS name, 3 AS sort_order UNION ALL
  SELECT 'PAAOW-04-PEAK', 'Peak performance buoyancy', 4 UNION ALL
  SELECT 'PAAOW-05-SEARCH', 'Search and recovery', 5
) v
WHERE o.code = 'PADI' AND l.code = 'AOW'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = v.code);

-- PADI RESCUE nouveaux
INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, v.code, v.name, v.sort_order
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
JOIN (
  SELECT 'PARESCUE-03-PAN' AS code, 'Panicked diver rescue' AS name, 3 AS sort_order UNION ALL
  SELECT 'PARESCUE-04-DIS', 'Distressed diver underwater', 4 UNION ALL
  SELECT 'PARESCUE-05-MIS', 'Missing diver search', 5 UNION ALL
  SELECT 'PARESCUE-06-SURF', 'Surfacing unresponsive diver', 6 UNION ALL
  SELECT 'PARESCUE-08-O2', 'Oxygen administration / first aid', 8
) v
WHERE o.code = 'PADI' AND l.code = 'RESCUE'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = v.code);

-- SSI OWD nouveaux
INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, v.code, v.name, v.sort_order
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
JOIN (
  SELECT 'SIOWD-04-ASC' AS code, 'Remontée contrôlée' AS name, 4 AS sort_order UNION ALL
  SELECT 'SIOWD-05-PA', 'Partage d''air stationnaire', 5 UNION ALL
  SELECT 'SIOWD-06-EQU', 'Montage et contrôle matériel', 6 UNION ALL
  SELECT 'SIOWD-07-MSKR', 'Retrait et remise du masque', 7 UNION ALL
  SELECT 'SIOWD-08-HOV', 'Stabilisation / vol stationnaire', 8 UNION ALL
  SELECT 'SIOWD-09-CESA', 'Remontée d''urgence contrôlée', 9 UNION ALL
  SELECT 'SIOWD-10-ENT', 'Entrée / sortie de l''eau', 10 UNION ALL
  SELECT 'SIOWD-11-ASA', 'Remontée partage d''air', 11 UNION ALL
  SELECT 'SIOWD-12-SSP', 'Palier de sécurité', 12
) v
WHERE o.code = 'SSI' AND l.code = 'OWD'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = v.code);

-- SSI AOWD / STRESS nouveaux
INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, v.code, v.name, v.sort_order
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
JOIN (
  SELECT 'SIAOWD-03-NIGHT' AS code, 'Plongée de nuit' AS name, 3 AS sort_order UNION ALL
  SELECT 'SIAOWD-04-DSMB', 'Déploiement parachute de surface', 4 UNION ALL
  SELECT 'SIAOWD-05-PEAK', 'Flottabilité perfectionnée', 5
) v
WHERE o.code = 'SSI' AND l.code = 'AOWD'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = v.code);

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, v.code, v.name, v.sort_order
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
JOIN (
  SELECT 'SISTRESS-03-PAN' AS code, 'Plongeur paniqué' AS name, 3 AS sort_order UNION ALL
  SELECT 'SISTRESS-04-INC', 'Plongeur inconscient', 4 UNION ALL
  SELECT 'SISTRESS-05-MIS', 'Plongeur manquant', 5 UNION ALL
  SELECT 'SISTRESS-06-SRF', 'Secours en surface', 6 UNION ALL
  SELECT 'SISTRESS-07-EAP', 'Plan d''action urgence', 7 UNION ALL
  SELECT 'SISTRESS-08-O2', 'Administration oxygène', 8
) v
WHERE o.code = 'SSI' AND l.code = 'STRESS'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = v.code);

-- ANMP nouveaux
INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, v.code, v.name, v.sort_order
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
JOIN (
  SELECT 'ANINIT-03-FLT' AS code, 'Flottabilité de base' AS name, 3 AS sort_order UNION ALL
  SELECT 'ANINIT-04-COM', 'Signes de communication', 4
) v
WHERE o.code = 'ANMP' AND l.code = 'INIT'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = v.code);

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, v.code, v.name, v.sort_order
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
JOIN (
  SELECT 'ANNIV1-04-LRE' AS code, 'Lâcher reprise d''embout' AS name, 4 AS sort_order UNION ALL
  SELECT 'ANNIV1-05-PA', 'Panne d''air — relais', 5 UNION ALL
  SELECT 'ANNIV1-06-EQU', 'Équipement et gréement', 6 UNION ALL
  SELECT 'ANNIV1-07-IMM', 'Immersion contrôlée', 7 UNION ALL
  SELECT 'ANNIV1-08-COM', 'Communication sous-marine', 8 UNION ALL
  SELECT 'ANNIV1-09-BTV', 'Équilibrage oreilles', 9 UNION ALL
  SELECT 'ANNIV1-10-MEE', 'Mise à l''eau et sortie', 10 UNION ALL
  SELECT 'ANNIV1-11-PAL', 'Évolution en palanquée', 11 UNION ALL
  SELECT 'ANNIV1-12-CHK', 'Contrôle binôme', 12
) v
WHERE o.code = 'ANMP' AND l.code = 'NIV1'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = v.code);

INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
SELECT l.id, v.code, v.name, v.sort_order
FROM PORTAIL_CLUB_catalog_levels l
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
JOIN (
  SELECT 'ANNIV2-03-PAR' AS code, 'Parachute de palier' AS name, 3 AS sort_order UNION ALL
  SELECT 'ANNIV2-04-ORDI', 'Ordinateur de plongée', 4 UNION ALL
  SELECT 'ANNIV2-05-IPD', 'Remontée assistée / paliers', 5 UNION ALL
  SELECT 'ANNIV2-06-PLAN', 'Planification de plongée', 6 UNION ALL
  SELECT 'ANNIV2-07-PA', 'Panne d''air en relais', 7 UNION ALL
  SELECT 'ANNIV2-08-NAVB', 'Navigation boussole', 8
) v
WHERE o.code = 'ANMP' AND l.code = 'NIV2'
  AND NOT EXISTS (SELECT 1 FROM PORTAIL_CLUB_catalog_skills s WHERE s.level_id = l.id AND s.code = v.code);

INSERT INTO PORTAIL_CLUB_schema_migrations (version)
SELECT '011_skill_code_normalization'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM PORTAIL_CLUB_schema_migrations WHERE version = '011_skill_code_normalization'
);
