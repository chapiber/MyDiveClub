-- Commentaire libre moniteur par stagiaire et séance
CREATE TABLE IF NOT EXISTS PORTAIL_CLUB_session_student_comments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  instructor_name VARCHAR(80) NOT NULL,
  comment VARCHAR(2000) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_portail_club_session_student_comment (session_id, student_id),
  KEY idx_portail_club_session_comment_session (session_id),
  CONSTRAINT fk_portail_club_comment_session
    FOREIGN KEY (session_id) REFERENCES PORTAIL_CLUB_formation_sessions (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_portail_club_comment_student
    FOREIGN KEY (student_id) REFERENCES PORTAIL_CLUB_formation_students (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
