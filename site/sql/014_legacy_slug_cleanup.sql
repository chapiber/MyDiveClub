-- Supprime les slugs legacy 003/004 lorsque le niveau possède déjà des codes normalisés.
-- Les évaluations doivent être fusionnées avant (tools/dedupe_catalog.php).

DELETE s FROM PORTAIL_CLUB_catalog_skills s
JOIN (
  SELECT DISTINCT level_id AS level_id
  FROM PORTAIL_CLUB_catalog_skills
  WHERE code REGEXP '^[A-Z]{2}[A-Z0-9]{1,10}-[0-9]{2}-[A-Z0-9]{2,8}$'
) norm ON norm.level_id = s.level_id
WHERE s.code NOT REGEXP '^[A-Z]{2}[A-Z0-9]{1,10}-[0-9]{2}-[A-Z0-9]{2,8}$';
