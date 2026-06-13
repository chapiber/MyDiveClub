-- Libellés N1 tronqués par strip abbr (idempotent)

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.name = 'Panne d''air — relais octopus'
WHERE o.code = 'FFESSM' AND l.code = 'N1' AND s.code = 'FFN1-06-PA' AND s.name <> 'Panne d''air — relais octopus';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.name = 'Communication sous-marine'
WHERE o.code = 'FFESSM' AND l.code = 'N1' AND s.code = 'FFN1-07-COM' AND s.name <> 'Communication sous-marine';
