-- Suppression catalogue : les évaluations liées sont retirées automatiquement.
ALTER TABLE PORTAIL_CLUB_session_evaluations
  DROP FOREIGN KEY fk_portail_club_eval_skill;

ALTER TABLE PORTAIL_CLUB_session_evaluations
  ADD CONSTRAINT fk_portail_club_eval_skill
    FOREIGN KEY (skill_id) REFERENCES PORTAIL_CLUB_catalog_skills (id)
    ON DELETE CASCADE ON UPDATE CASCADE;
