<?php

declare(strict_types=1);



/**

 * Test E2E Suivi Formation — usage :

 * php tools/e2e_formations.php

 * NAS : /usr/local/bin/php82 /volume1/web/portailClub/tools/e2e_formations.php

 */

require_once __DIR__ . '/../lib/db.inc.php';

require_once __DIR__ . '/../lib/formations.inc.php';

require_once __DIR__ . '/e2e_cleanup.inc.php';



const E2E_LEVELS = ['na', 'not_mastered', 'acquiring', 'mastered'];



function e2eFail(string $msg): void

{

    fwrite(STDERR, "ECHEC : {$msg}\n");

    exit(1);

}



function e2eOk(string $msg): void

{

    echo "OK   {$msg}\n";

}



function e2eAssert(bool $cond, string $msg): void

{

    if (!$cond) {

        e2eFail($msg);

    }

}



function e2eReportCleanup(array $result): void

{

    if ($result['formations'] > 0 || $result['instructors'] > 0) {

        echo 'Nettoyage : ' . $result['formations'] . ' formation(s), '

            . $result['instructors'] . " moniteur(s) E2E supprimé(s).\n";

    }

}



$pdo = null;

register_shutdown_function(static function () use (&$pdo): void {

    if (!($pdo instanceof PDO)) {

        return;

    }

    try {

        e2eReportCleanup(e2eCleanupAll($pdo));

    } catch (Throwable $e) {

        fwrite(STDERR, 'Nettoyage E2E (shutdown) en erreur : ' . $e->getMessage() . "\n");

    }

});



function e2ePickLevelId(PDO $pdo): int

{

    $st = $pdo->query(

        'SELECT l.id

         FROM PORTAIL_CLUB_catalog_levels l

         JOIN PORTAIL_CLUB_catalog_skills s ON s.level_id = l.id

         GROUP BY l.id

         HAVING COUNT(s.id) >= 2

         ORDER BY l.id

         LIMIT 1'

    );

    $id = $st ? (int)$st->fetchColumn() : 0;

    if ($id <= 0) {

        e2eFail('Aucun niveau catalogue avec au moins 2 compétences.');

    }

    return $id;

}



/** @return array{0:int,1:int} */

function e2ePickDualLevelIds(PDO $pdo): array

{

    $st = $pdo->query(

        "SELECT l.id, o.code AS org_code

         FROM PORTAIL_CLUB_catalog_levels l

         JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id

         JOIN PORTAIL_CLUB_catalog_skills s ON s.level_id = l.id

         WHERE (o.code = 'FFESSM' AND l.code = 'N2')

            OR (o.code = 'PADI' AND l.code = 'AOW')

         GROUP BY l.id, o.code

         HAVING COUNT(s.id) >= 1"

    );

    $byOrg = [];

    while ($row = $st->fetch()) {

        $byOrg[$row['org_code']] = (int)$row['id'];

    }

    if (isset($byOrg['FFESSM'], $byOrg['PADI'])) {

        return [$byOrg['FFESSM'], $byOrg['PADI']];

    }



    $st = $pdo->query(

        'SELECT l.id, o.id AS org_id

         FROM PORTAIL_CLUB_catalog_levels l

         JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id

         JOIN PORTAIL_CLUB_catalog_skills s ON s.level_id = l.id

         GROUP BY l.id, o.id

         HAVING COUNT(s.id) >= 1

         ORDER BY o.id, l.id'

    );

    $first = null;

    $second = null;

    while ($row = $st->fetch()) {

        $orgId = (int)$row['org_id'];

        $levelId = (int)$row['id'];

        if ($first === null) {

            $first = ['org_id' => $orgId, 'level_id' => $levelId];

            continue;

        }

        if ($orgId !== $first['org_id']) {

            $second = $levelId;

            break;

        }

    }

    if ($first === null || $second === null) {

        e2eFail('Impossible de trouver deux niveaux de organismes distincts pour le double cursus.');

    }

    return [$first['level_id'], $second];

}



try {

    $pdo = portailClubGetPdo();

    e2eReportCleanup(e2eCleanupAll($pdo));



    $levelId = e2ePickLevelId($pdo);

    e2eOk("Niveau catalogue #{$levelId} sélectionné");



    $formation = portailClubCreateFormation($pdo, [

        'level_id' => $levelId,

        'student_mode' => 'group',

        'students' => [

            ['first_name' => E2E_TAG . '_Alice', 'last_name' => 'Test'],

            ['first_name' => E2E_TAG . '_Bob', 'last_name' => 'Test'],

        ],

    ]);

    $formationId = (int)$formation['id'];

    e2eOk("Formation #{$formationId} créée (2 élèves)");



    e2eAssert(count($formation['sessions']) === 0, 'Aucune séance au départ');

    e2eAssert(count($formation['students']) === 2, '2 élèves attendus');



    $skills = $formation['skills'];

    e2eAssert(count($skills) >= 1, 'Compétences catalogue requises');

    $students = $formation['students'];

    $instructors = E2E_INSTRUCTORS;

    $sessionIds = [];



    for ($n = 1; $n <= 6; $n++) {

        $instructor = $instructors[($n - 1) % 3];

        $evalLevel = E2E_LEVELS[$n % count(E2E_LEVELS)];

        $evaluations = [];

        foreach ($students as $student) {

            foreach ($skills as $idx => $skill) {

                $level = ($idx + $n) % 2 === 0 ? $evalLevel : 'na';

                $evaluations[] = [

                    'student_id' => $student['id'],

                    'skill_id' => $skill['id'],

                    'instructor_name' => $instructor,

                    'eval_level' => $level,

                ];

            }

        }

        $heldAt = sprintf('2026-06-%02d 10:00:00', min(28, $n + 1));

        $session = portailClubCreateSessionWithEvaluations($pdo, $formationId, [

            'held_at' => $heldAt,

            'evaluations' => $evaluations,

        ]);

        $sessionIds[] = (int)$session['id'];

        e2eAssert((int)$session['session_number'] === $n, "Séance #{$n} : numéro attendu {$n}");

    }

    e2eOk('6 séances créées avec 3 moniteurs et évaluations');



    $detail = portailClubGetFormationDetail($pdo, $formationId);

    e2eAssert(count($detail['sessions']) === 6, '6 séances en base');

    $numbers = array_column($detail['sessions'], 'session_number');

    sort($numbers);

    e2eAssert($numbers === [1, 2, 3, 4, 5, 6], 'Numéros de séance consécutifs 1-6');



    $report = portailClubGetFormationSkillStatus($pdo, $formationId);

    e2eAssert((int)$report['session_count'] === 6, 'Rapport compétences : 6 séances');

    e2eAssert(count($report['students']) === 2, 'Rapport compétences : 2 élèves');

    foreach ($report['students'] as $st) {

        e2eAssert(count($st['skills']) === count($skills), 'Rapport : une ligne par compétence');

    }

    e2eOk('État des compétences agrégé');



    $closed = portailClubCloseFormation($pdo, $formationId, [

        'ok_to_certify' => true,

        'certification_obtained' => true,

        'instructor_name' => 'MoniteurA',

    ]);

    e2eAssert($closed['status'] === 'archived', 'Formation archivée');

    $row = portailClubFetchFormationRow($pdo, $formationId);

    e2eAssert($row !== null && $row['status'] === 'archived', 'Statut archived en base');

    e2eOk('Formation clôturée');



    $sessionSearchDate = '2026-06-02';

    e2eAssert(DateTime::createFromFormat('Y-m-d', '') === false, 'Date vide rejetée par validation');

    $archivedNoMatch = portailClubSearchArchivedFormations($pdo, '2020-01-01', null, null);

    e2eAssert($archivedNoMatch === [], 'Recherche archives : aucun résultat hors période');

    $archivedByDate = portailClubSearchArchivedFormations($pdo, $sessionSearchDate, null, null);

    e2eAssert(count($archivedByDate) === 1, 'Recherche archives par date de séance');

    e2eAssert((int)$archivedByDate[0]['id'] === $formationId, 'Recherche archives : bonne formation');

    $archivedByInstructor = portailClubSearchArchivedFormations($pdo, $sessionSearchDate, 'MoniteurA', null);

    e2eAssert(count($archivedByInstructor) === 1, 'Recherche archives : filtre moniteur');

    $archivedByStudent = portailClubSearchArchivedFormations($pdo, $sessionSearchDate, null, 'Alice');

    e2eAssert(count($archivedByStudent) === 1, 'Recherche archives : filtre prénom stagiaire');

    $archivedMiss = portailClubSearchArchivedFormations($pdo, $sessionSearchDate, 'MoniteurZ', null);

    e2eAssert($archivedMiss === [], 'Recherche archives : moniteur absent → vide');

    e2eOk('Recherche archives filtrée');



    $restored = portailClubRestoreFormation($pdo, $formationId);

    e2eAssert($restored['status'] === 'in_progress', 'Formation restaurée en cours');

    e2eAssert($restored['archived_at'] === null, 'archived_at effacé après restauration');

    $inProgressList = portailClubListFormations($pdo, 'in_progress');

    $foundInList = false;

    foreach ($inProgressList as $item) {

        if ((int)$item['id'] === $formationId) {

            $foundInList = true;

            break;

        }

    }

    e2eAssert($foundInList, 'Formation restaurée visible dans la liste en cours');

    e2eOk('Restauration formation archivée');



    portailClubCloseFormation($pdo, $formationId, [

        'ok_to_certify' => true,

        'certification_obtained' => true,

        'instructor_name' => 'MoniteurA',

    ]);

    e2eOk('Formation re-clôturée pour suite des tests');



    [$levelFfessmMono, $levelPadiAdd] = e2ePickDualLevelIds($pdo);

    $mono = portailClubCreateFormation($pdo, [

        'level_id' => $levelFfessmMono,

        'student_mode' => 'solo',

        'students' => [

            ['first_name' => E2E_TAG . '_MonoAdd', 'last_name' => 'Test'],

        ],

    ]);

    $monoId = (int)$mono['id'];

    e2eAssert($mono['is_dual'] === false, 'Formation mono avant ajout cursus');



    $upgraded = portailClubUpdateFormationCurricula($pdo, $monoId, [

        'add_level_id' => $levelPadiAdd,

    ]);

    e2eAssert($upgraded['is_dual'] === true, 'Ajout 2e cursus : is_dual');

    e2eAssert(count($upgraded['levels']) === 2, 'Ajout 2e cursus : 2 niveaux');

    e2eOk('Modification formation : ajout 2e organisme');



    [$levelFfessm, $levelPadi] = e2ePickDualLevelIds($pdo);

    e2eOk("Double cursus : niveaux #{$levelFfessm} + #{$levelPadi}");



    $dual = portailClubCreateFormation($pdo, [

        'level_ids' => [$levelFfessm, $levelPadi],

        'student_mode' => 'solo',

        'students' => [

            ['first_name' => E2E_TAG . '_Dual', 'last_name' => 'Test'],

        ],

    ]);

    $dualId = (int)$dual['id'];

    e2eAssert($dual['is_dual'] === true, 'Formation double cursus : is_dual');

    e2eAssert(count($dual['levels']) === 2, 'Formation double cursus : 2 niveaux');

    e2eAssert(count($dual['skills']) >= 2, 'Formation double cursus : compétences des deux cursus');



    $dualStudent = $dual['students'][0];

    $skillFfessm = null;

    $skillPadi = null;

    foreach ($dual['skills'] as $sk) {

        if ((int)$sk['level_id'] === $levelFfessm && $skillFfessm === null) {

            $skillFfessm = $sk;

        }

        if ((int)$sk['level_id'] === $levelPadi && $skillPadi === null) {

            $skillPadi = $sk;

        }

    }

    e2eAssert($skillFfessm !== null && $skillPadi !== null, 'Compétences distinctes par cursus');



    portailClubCreateSessionWithEvaluations($pdo, $dualId, [

        'held_at' => '2026-06-15 10:00:00',

        'evaluations' => [

            [

                'student_id' => $dualStudent['id'],

                'skill_id' => $skillFfessm['id'],

                'instructor_name' => 'MoniteurDual',

                'eval_level' => 'mastered',

            ],

            [

                'student_id' => $dualStudent['id'],

                'skill_id' => $skillPadi['id'],

                'instructor_name' => 'MoniteurDual',

                'eval_level' => 'acquiring',

            ],

        ],

    ]);

    e2eOk('Séance double cursus : 1 compétence par organisme');



    $dualReport = portailClubGetFormationSkillStatus($pdo, $dualId);

    $dualSt = $dualReport['students'][0];

    e2eAssert(count($dualSt['curricula']) === 2, 'Synthèse double cursus : 2 blocs curricula');

    e2eOk('Synthèse double cursus agrégée');



    portailClubCloseFormation($pdo, $dualId, [

        'closures' => [

            [

                'level_id' => $levelFfessm,

                'ok_to_certify' => true,

                'certification_obtained' => true,

            ],

            [

                'level_id' => $levelPadi,

                'ok_to_certify' => true,

                'certification_obtained' => false,

            ],

        ],

        'instructor_name' => 'MoniteurDual',

    ]);

    $dualClosed = portailClubGetFormationDetail($pdo, $dualId);

    e2eAssert($dualClosed['status'] === 'archived', 'Double cursus archivé');

    e2eAssert(count($dualClosed['closures']) === 2, 'Clôture par cursus enregistrée');

    e2eAssert(count($dualClosed['student_closures']) === 2, 'Clôture par élève × cursus enregistrée');

    e2eOk('Double cursus clôturé');



    e2eReportCleanup(e2eCleanupAll($pdo));

    echo "\nTous les tests E2E Suivi Formation ont réussi.\n";

    exit(0);

} catch (Throwable $e) {

    e2eFail($e->getMessage());

}

