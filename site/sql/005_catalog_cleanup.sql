-- Portail Club — fusion doublons catalogue N1 (préserve les évaluations)

UPDATE PORTAIL_CLUB_session_evaluations e
JOIN PORTAIL_CLUB_catalog_skills old_sk ON old_sk.id = e.skill_id AND old_sk.code = 'mask_clear'
JOIN PORTAIL_CLUB_catalog_skills new_sk ON new_sk.level_id = old_sk.level_id AND new_sk.code = 'vdm'
SET e.skill_id = new_sk.id;

DELETE old_sk FROM PORTAIL_CLUB_catalog_skills old_sk
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = old_sk.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N1' AND old_sk.code = 'mask_clear'
  AND EXISTS (
    SELECT 1 FROM (
      SELECT s.id FROM PORTAIL_CLUB_catalog_skills s
      JOIN PORTAIL_CLUB_catalog_levels l2 ON l2.id = s.level_id
      JOIN PORTAIL_CLUB_catalog_orgs o2 ON o2.id = l2.org_id
      WHERE o2.code = 'FFESSM' AND l2.code = 'N1' AND s.code = 'vdm'
    ) AS keep_vdm
  );

UPDATE PORTAIL_CLUB_session_evaluations e
JOIN PORTAIL_CLUB_catalog_skills old_sk ON old_sk.id = e.skill_id AND old_sk.code = 'buoyancy'
JOIN PORTAIL_CLUB_catalog_skills new_sk ON new_sk.level_id = old_sk.level_id AND new_sk.code = 'flottabilite'
SET e.skill_id = new_sk.id;

DELETE old_sk FROM PORTAIL_CLUB_catalog_skills old_sk
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = old_sk.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
WHERE o.code = 'FFESSM' AND l.code = 'N1' AND old_sk.code = 'buoyancy'
  AND EXISTS (
    SELECT 1 FROM (
      SELECT s.id FROM PORTAIL_CLUB_catalog_skills s
      JOIN PORTAIL_CLUB_catalog_levels l2 ON l2.id = s.level_id
      JOIN PORTAIL_CLUB_catalog_orgs o2 ON o2.id = l2.org_id
      WHERE o2.code = 'FFESSM' AND l2.code = 'N1' AND s.code = 'flottabilite'
    ) AS keep_flot
  );

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'vdm', s.name = 'VDM — Vidage de masque', s.sort_order = 1
WHERE o.code = 'FFESSM' AND l.code = 'N1' AND s.code = 'mask_clear';

UPDATE PORTAIL_CLUB_catalog_skills s
JOIN PORTAIL_CLUB_catalog_levels l ON l.id = s.level_id
JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
SET s.code = 'flottabilite', s.name = 'Flottabilité et stabilisation', s.sort_order = 12
WHERE o.code = 'FFESSM' AND l.code = 'N1' AND s.code = 'buoyancy';

INSERT INTO PORTAIL_CLUB_schema_migrations (version)
SELECT '005_catalog_cleanup'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM PORTAIL_CLUB_schema_migrations WHERE version = '005_catalog_cleanup'
);
