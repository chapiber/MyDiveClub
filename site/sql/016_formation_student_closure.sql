-- Clôture par élève et par cursus (idempotent)

CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_formation_student_closure (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  formation_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  level_id INT UNSIGNED NOT NULL,
  ok_to_certify TINYINT(1) NOT NULL,
  certification_obtained TINYINT(1) NOT NULL,
  UNIQUE KEY uq_portail_club_fsc (formation_id, student_id, level_id),
  KEY idx_portail_club_fsc_formation (formation_id),
  KEY idx_portail_club_fsc_student (student_id),
  CONSTRAINT fk_portail_club_fsc_formation
    FOREIGN KEY (formation_id) REFERENCES PORTAIL_CLUB_formations (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_portail_club_fsc_student
    FOREIGN KEY (student_id) REFERENCES PORTAIL_CLUB_formation_students (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_portail_club_fsc_level
    FOREIGN KEY (level_id) REFERENCES PORTAIL_CLUB_catalog_levels (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @col_closed_by = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'PORTAIL_CLUB_formations'
    AND COLUMN_NAME = 'closed_by_instructor'
);
SET @sql_closed_by = IF(@col_closed_by = 0,
  'ALTER TABLE PORTAIL_CLUB_formations ADD COLUMN closed_by_instructor VARCHAR(80) NULL DEFAULT NULL AFTER archived_at',
  'SELECT 1');
PREPARE stmt_closed_by FROM @sql_closed_by;
EXECUTE stmt_closed_by;
DEALLOCATE PREPARE stmt_closed_by;

-- Rétro-migration : décisions par cursus → tous les élèves de la formation
INSERT IGNORE INTO PORTAIL_CLUB_formation_student_closure
  (formation_id, student_id, level_id, ok_to_certify, certification_obtained)
SELECT flc.formation_id, fs.id, flc.level_id, flc.ok_to_certify, flc.certification_obtained
FROM PORTAIL_CLUB_formation_level_closure flc
JOIN PORTAIL_CLUB_formation_students fs ON fs.formation_id = flc.formation_id
WHERE flc.ok_to_certify IS NOT NULL AND flc.certification_obtained IS NOT NULL;
