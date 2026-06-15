-- CDM 2026 : pseudo seul (suppression prénom) + retrait compte test loic

DELETE FROM PORTAIL_CLUB_cdm_members WHERE LOWER(pseudo) = 'loic';

ALTER TABLE PORTAIL_CLUB_cdm_members DROP COLUMN IF EXISTS first_name;
