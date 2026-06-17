<?php

declare(strict_types=1);

/**
 * Initialisation formation FFESSM N2 — stage J2/J3 (16-17 juin 2026).
 * Usage NAS : /usr/local/bin/php82 /volume1/web/portailClub/tools/init_formation_n2_jun2026.php
 */

require_once __DIR__ . '/../lib/db.inc.php';
require_once __DIR__ . '/../lib/formations.inc.php';

const INSTRUCTOR = 'Léo';

/** @var array<string,int> */
const SKILL_CODES = [
    'vdm' => 0,
    'lre' => 0,
    'bal' => 0,
    'par' => 0,
    'ipd' => 0,
    'plan' => 0,
];

function initFail(string $msg): void
{
    fwrite(STDERR, "ECHEC : {$msg}\n");
    exit(1);
}

function initOk(string $msg): void
{
    echo "OK   {$msg}\n";
}

function initResolveSkillIds(PDO $pdo, int $levelId): array
{
    $st = $pdo->prepare(
        'SELECT id, code FROM PORTAIL_CLUB_catalog_skills WHERE level_id = ?'
    );
    $st->execute([$levelId]);
    $map = [];
    while ($row = $st->fetch()) {
        $map[$row['code']] = (int)$row['id'];
    }

    $need = [
        'vdm' => 'FFN2-01-VDM',
        'lre' => 'FFN2-02-LRE',
        'bal' => 'FFN2-03-BAL',
        'par' => 'FFN2-04-PAR',
        'ipd' => 'FFN2-07-IPD',
        'plan' => 'FFN2-10-PLAN',
    ];
    $out = [];
    foreach ($need as $key => $code) {
        if (!isset($map[$code])) {
            initFail("Compétence catalogue manquante : {$code}");
        }
        $out[$key] = $map[$code];
    }

    return $out;
}

/** @param list<array{id:int,first_name:string}> $students */
function initStudentIdByFirstName(array $students, string $firstName): int
{
    $needle = mb_strtolower($firstName);
    foreach ($students as $student) {
        if (mb_strtolower($student['first_name']) === $needle) {
            return (int)$student['id'];
        }
    }
    initFail("Élève introuvable : {$firstName}");
}

/** @param list<array{id:int,first_name:string}> $students */
function initEvalAll(array $students, int $skillId, string $level, string $instructor): array
{
    $items = [];
    foreach ($students as $student) {
        $items[] = [
            'student_id' => (int)$student['id'],
            'skill_id' => $skillId,
            'instructor_name' => $instructor,
            'eval_level' => $level,
        ];
    }

    return $items;
}

/** @param list<array{id:int,first_name:string}> $students */
function initCommentAll(array $students, string $comment, string $instructor): array
{
    $items = [];
    foreach ($students as $student) {
        $items[] = [
            'student_id' => (int)$student['id'],
            'instructor_name' => $instructor,
            'comment' => $comment,
        ];
    }

    return $items;
}

try {
    $pdo = portailClubGetPdo();

    $stLevel = $pdo->query(
        "SELECT l.id FROM PORTAIL_CLUB_catalog_levels l
         JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
         WHERE o.code = 'FFESSM' AND l.code = 'N2' LIMIT 1"
    );
    $levelId = $stLevel ? (int)$stLevel->fetchColumn() : 0;
    if ($levelId <= 0) {
        initFail('Niveau FFESSM N2 introuvable.');
    }

    $skills = initResolveSkillIds($pdo, $levelId);

    $formation = portailClubCreateFormation($pdo, [
        'level_id' => $levelId,
        'student_mode' => 'group',
        'students' => [
            ['first_name' => 'Ingrid', 'last_name' => ''],
            ['first_name' => 'Frédéric', 'last_name' => ''],
            ['first_name' => 'Laurence', 'last_name' => ''],
            ['first_name' => 'Benoit', 'last_name' => ''],
        ],
    ]);

    $formationId = (int)$formation['id'];
    $students = $formation['students'];
    initOk("Formation #{$formationId} créée (FFESSM N2, 4 élèves)");

    $sid = [
        'ingrid' => initStudentIdByFirstName($students, 'Ingrid'),
        'frederic' => initStudentIdByFirstName($students, 'Frédéric'),
        'laurence' => initStudentIdByFirstName($students, 'Laurence'),
        'benoit' => initStudentIdByFirstName($students, 'Benoit'),
    ];

    // J2 matin — BALLO / perfectionnement techniques d'immersion
    $j2amComment = 'Perfectionnement techniques d\'immersion : saut droit/phoque, flottabilité, communication, cohésion de palanquée.';
    $j2amEvals = array_merge(
        initEvalAll($students, $skills['bal'], 'mastered', INSTRUCTOR),
        initEvalAll($students, $skills['vdm'], 'mastered', INSTRUCTOR),
        initEvalAll($students, $skills['lre'], 'mastered', INSTRUCTOR),
        initEvalAll($students, $skills['par'], 'mastered', INSTRUCTOR),
    );
    $s1 = portailClubCreateSessionWithEvaluations($pdo, $formationId, [
        'held_at' => '2026-06-16 09:00:00',
        'time_slot' => 'morning',
        'evaluations' => $j2amEvals,
        'comments' => initCommentAll($students, $j2amComment, INSTRUCTOR),
    ]);
    initOk("Séance #{$s1['session_number']} — J2 matin BALLO (id {$s1['id']})");

    // J2 après-midi — travail autonomie
    $j2pmComment = 'Travail autonomie. Briefing très bon. Ne pas parler en surface : tout se dit sur le bateau avant de plonger. Bien fixer les paramètres de fin de plongée avant l\'immersion, et se mettre au clair avec le palier de principe.';
    $s2 = portailClubCreateSessionWithEvaluations($pdo, $formationId, [
        'held_at' => '2026-06-16 14:00:00',
        'time_slot' => 'afternoon',
        'evaluations' => initEvalAll($students, $skills['plan'], 'acquiring', INSTRUCTOR),
        'comments' => initCommentAll($students, $j2pmComment, INSTRUCTOR),
    ]);
    initOk("Séance #{$s2['session_number']} — J2 après-midi autonomie (id {$s2['id']})");

    // J3 matin — remontées assistées 20 m → 6 m (IPD)
    $j3amEvals = [
        ['student_id' => $sid['ingrid'], 'skill_id' => $skills['ipd'], 'instructor_name' => INSTRUCTOR, 'eval_level' => 'acquiring'],
        ['student_id' => $sid['frederic'], 'skill_id' => $skills['ipd'], 'instructor_name' => INSTRUCTOR, 'eval_level' => 'acquiring'],
        ['student_id' => $sid['laurence'], 'skill_id' => $skills['ipd'], 'instructor_name' => INSTRUCTOR, 'eval_level' => 'not_mastered'],
        ['student_id' => $sid['benoit'], 'skill_id' => $skills['ipd'], 'instructor_name' => INSTRUCTOR, 'eval_level' => 'not_mastered'],
    ];
    $j3amComments = [
        ['student_id' => $sid['ingrid'], 'instructor_name' => INSTRUCTOR, 'comment' => 'Remontée assistée 20 m → 6 m. Décollage plus franc à travailler, très bon feeling de la vitesse.'],
        ['student_id' => $sid['frederic'], 'instructor_name' => INSTRUCTOR, 'comment' => 'Remontée assistée 20 m → 6 m. Vitesse à soigner, un peu trop rapide tout du long, purge trop d\'un coup au dernier moment.'],
        ['student_id' => $sid['laurence'], 'instructor_name' => INSTRUCTOR, 'comment' => 'Remontée assistée 20 m → 6 m. Décollage beaucoup trop lent, pas d\'utilisation du gilet, remontée trop lente.'],
        ['student_id' => $sid['benoit'], 'instructor_name' => INSTRUCTOR, 'comment' => 'Remontée assistée 20 m → 6 m. Prise pas adaptée (dét de secours pour un essoufflement), décollage sans décollage, puis trop rapide sans réaction, pas de feeling de la vitesse.'],
    ];
    $s3 = portailClubCreateSessionWithEvaluations($pdo, $formationId, [
        'held_at' => '2026-06-17 09:00:00',
        'time_slot' => 'morning',
        'evaluations' => $j3amEvals,
        'comments' => $j3amComments,
    ]);
    initOk("Séance #{$s3['session_number']} — J3 matin IPD (id {$s3['id']})");

    // J3 après-midi — remédiation + autonomie
    $j3pmComment = 'Remédiation plongée du matin + travail autonomie.';
    $s4 = portailClubCreateSessionWithEvaluations($pdo, $formationId, [
        'held_at' => '2026-06-17 14:00:00',
        'time_slot' => 'afternoon',
        'evaluations' => initEvalAll($students, $skills['ipd'], 'acquiring', INSTRUCTOR),
        'comments' => initCommentAll($students, $j3pmComment, INSTRUCTOR),
    ]);
    initOk("Séance #{$s4['session_number']} — J3 après-midi remédiation (id {$s4['id']})");

    echo "\nFormation initialisée : id={$formationId}\n";
    echo "Moniteur : " . INSTRUCTOR . "\n";
    echo "URL : https://diveapps.serveblog.net/portailClub/apps/formations/index.html#/formation/{$formationId}\n";
    exit(0);
} catch (Throwable $e) {
    initFail($e->getMessage());
}
