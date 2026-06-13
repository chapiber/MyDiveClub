-- Suivi Matériel — corriger subtype des interventions importées (révision vs réparation)

UPDATE PORTAIL_CLUB_materiel_interventions
SET subtype = 'revision'
WHERE subtype = 'repair'
  AND (
    summary LIKE '%Révision importée%'
    OR summary LIKE '%Contrôle périodique%'
    OR summary LIKE '%Maintenance détendeur importée%'
    OR summary LIKE '%NEUF%'
  )
  AND summary NOT LIKE '%REPARATION%'
  AND summary NOT LIKE '%Réparation détendeur importée%';

INSERT INTO PORTAIL_CLUB_schema_migrations (version)
SELECT '021_materiel_int_subtype'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM PORTAIL_CLUB_schema_migrations WHERE version = '021_materiel_int_subtype'
);
