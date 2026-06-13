<?php
declare(strict_types=1);

require_once __DIR__ . '/api.inc.php';

const PORTAIL_CLUB_EVAL_LEVELS = ['na', 'not_mastered', 'acquiring', 'mastered'];

function portailClubNormalizeEvalLevel(mixed $value): string
{
    $v = strtolower(trim((string)$value));
    if (!in_array($v, PORTAIL_CLUB_EVAL_LEVELS, true)) {
        portailClubJsonFail('Niveau d\'évaluation invalide.');
    }
    return $v;
}

function portailClubNormalizeTimeSlot(mixed $value): string
{
    $v = strtolower(trim((string)$value));
    if (in_array($v, ['afternoon', 'aprem', 'pm', 'après-midi', 'apres-midi', 'apres_midi'], true)) {
        return 'afternoon';
    }
    return 'morning';
}

function portailClubTimeSlotLabel(string $slot): string
{
    return $slot === 'afternoon' ? 'Après-midi' : 'Matin';
}

function portailClubGenerateUuid(): string
{
    $data = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80);

    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

/** Métadonnées d'un lot de rattrapage (taille, date de déclaration). */
function portailClubFetchCatchupBatchMeta(PDO $pdo, string $batchId): array
{
    $st = $pdo->prepare(
        'SELECT COUNT(*) AS batch_size, MIN(created_at) AS declared_at
         FROM PORTAIL_CLUB_formation_sessions
         WHERE catchup_batch_id = ?'
    );
    $st->execute([$batchId]);
    $row = $st->fetch();

    return [
        'batch_size' => (int)($row['batch_size'] ?? 0),
        'declared_at' => $row['declared_at'] ?? null,
    ];
}

function portailClubEnrichSessionCatchupMeta(PDO $pdo, array $session): array
{
    $batchId = trim((string)($session['catchup_batch_id'] ?? ''));
    if ($batchId === '') {
        $session['catchup_batch_id'] = null;
        $session['catchup_batch_size'] = null;
        $session['catchup_declared_at'] = null;
        return $session;
    }

    $meta = portailClubFetchCatchupBatchMeta($pdo, $batchId);
    $session['catchup_batch_id'] = $batchId;
    $session['catchup_batch_size'] = $meta['batch_size'];
    $session['catchup_declared_at'] = $meta['declared_at'];

    return $session;
}

function portailClubApplySessionMeta(PDO $pdo, int $sessionId, array $body): void
{
    if (!array_key_exists('time_slot', $body)) {
        return;
    }
    $slot = portailClubNormalizeTimeSlot($body['time_slot']);
    $st = $pdo->prepare('UPDATE PORTAIL_CLUB_formation_sessions SET time_slot = ? WHERE id = ?');
    $st->execute([$slot, $sessionId]);
}

function portailClubTouchInstructor(PDO $pdo, string $firstName): void
{
    $name = portailClubTrimName($firstName, 'Prénom moniteur');
    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_recent_instructors (first_name, last_used_at)
         VALUES (?, NOW())
         ON DUPLICATE KEY UPDATE last_used_at = NOW()'
    );
    $st->execute([$name]);
}

function portailClubGetCatalog(PDO $pdo): array
{
    $orgs = $pdo->query(
        'SELECT id, code, name, sort_order
         FROM PORTAIL_CLUB_catalog_orgs
         ORDER BY sort_order, name'
    )->fetchAll();

    if ($orgs === []) {
        return ['organizations' => []];
    }

    $levels = $pdo->query(
        'SELECT l.id, l.org_id, l.code, l.name, l.sort_order, o.code AS org_code
         FROM PORTAIL_CLUB_catalog_levels l
         JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
         ORDER BY o.sort_order, l.sort_order, l.name'
    )->fetchAll();

    $skills = $pdo->query(
        'SELECT s.id, s.level_id, s.code, s.name, s.sort_order
         FROM PORTAIL_CLUB_catalog_skills s
         ORDER BY s.sort_order, s.name'
    )->fetchAll();

    $levelMeta = [];
    foreach ($levels as $level) {
        $levelMeta[(int)$level['id']] = [
            'org_code' => $level['org_code'],
            'level_code' => $level['code'],
        ];
    }

    $skillsByLevel = [];
    foreach ($skills as $skill) {
        $lid = (int)$skill['level_id'];
        $meta = $levelMeta[$lid] ?? ['org_code' => '', 'level_code' => ''];
        $row = [
            'id' => (int)$skill['id'],
            'code' => $skill['code'],
            'name' => $skill['name'],
            'sort_order' => (int)$skill['sort_order'],
        ];
        $skillsByLevel[$lid][] = portailClubEnrichSkillRow(
            $row,
            (string)$meta['org_code'],
            (string)$meta['level_code']
        );
    }

    $levelsByOrg = [];
    foreach ($levels as $level) {
        $oid = (int)$level['org_id'];
        $lid = (int)$level['id'];
        $levelsByOrg[$oid][] = [
            'id' => $lid,
            'code' => $level['code'],
            'name' => $level['name'],
            'sort_order' => (int)$level['sort_order'],
            'skills' => $skillsByLevel[$lid] ?? [],
        ];
    }

    $out = [];
    foreach ($orgs as $org) {
        $oid = (int)$org['id'];
        $out[] = [
            'id' => $oid,
            'code' => $org['code'],
            'name' => $org['name'],
            'sort_order' => (int)$org['sort_order'],
            'levels' => $levelsByOrg[$oid] ?? [],
        ];
    }

    return ['organizations' => $out];
}

/** Niveaux catalogue liés à une formation (cursus principal en premier). */
function portailClubFetchFormationLevels(PDO $pdo, int $formationId): array
{
    $levels = [];
    try {
        $st = $pdo->prepare(
            'SELECT fl.level_id, fl.sort_order,
                    l.code AS level_code, l.name AS level_name,
                    o.id AS org_id, o.code AS org_code, o.name AS org_name
             FROM PORTAIL_CLUB_formation_levels fl
             JOIN PORTAIL_CLUB_catalog_levels l ON l.id = fl.level_id
             JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
             WHERE fl.formation_id = ?
             ORDER BY fl.sort_order, fl.id'
        );
        $st->execute([$formationId]);
        while ($row = $st->fetch()) {
            $levels[] = [
                'level_id' => (int)$row['level_id'],
                'sort_order' => (int)$row['sort_order'],
                'level_code' => $row['level_code'],
                'level_name' => $row['level_name'],
                'org_id' => (int)$row['org_id'],
                'org_code' => $row['org_code'],
                'org_name' => $row['org_name'],
            ];
        }
    } catch (Throwable) {
        // Table absente avant migration 010
    }

    if ($levels !== []) {
        return $levels;
    }

    $st = $pdo->prepare(
        'SELECT f.level_id, 0 AS sort_order,
                l.code AS level_code, l.name AS level_name,
                o.id AS org_id, o.code AS org_code, o.name AS org_name
         FROM PORTAIL_CLUB_formations f
         JOIN PORTAIL_CLUB_catalog_levels l ON l.id = f.level_id
         JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
         WHERE f.id = ?'
    );
    $st->execute([$formationId]);
    $row = $st->fetch();
    if (!$row) {
        return [];
    }

    return [[
        'level_id' => (int)$row['level_id'],
        'sort_order' => 0,
        'level_code' => $row['level_code'],
        'level_name' => $row['level_name'],
        'org_id' => (int)$row['org_id'],
        'org_code' => $row['org_code'],
        'org_name' => $row['org_name'],
    ]];
}

/** Compétences de tous les cursus d'une formation. */
function portailClubFetchFormationSkills(PDO $pdo, int $formationId): array
{
    $levels = portailClubFetchFormationLevels($pdo, $formationId);
    if ($levels === []) {
        return [];
    }

    $skills = [];
    try {
        $st = $pdo->prepare(
            'SELECT s.id, s.code, s.name, s.sort_order, s.level_id,
                    l.code AS level_code, l.name AS level_name,
                    o.code AS org_code, o.name AS org_name,
                    fl.sort_order AS curriculum_sort
             FROM PORTAIL_CLUB_formation_levels fl
             JOIN PORTAIL_CLUB_catalog_skills s ON s.level_id = fl.level_id
             JOIN PORTAIL_CLUB_catalog_levels l ON l.id = fl.level_id
             JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
             WHERE fl.formation_id = ?
             ORDER BY fl.sort_order, s.sort_order, s.name'
        );
        $st->execute([$formationId]);
        while ($sk = $st->fetch()) {
            $skills[] = portailClubEnrichSkillRow(
                [
                    'id' => (int)$sk['id'],
                    'code' => $sk['code'],
                    'name' => $sk['name'],
                    'sort_order' => (int)$sk['sort_order'],
                    'level_id' => (int)$sk['level_id'],
                    'level_code' => $sk['level_code'],
                    'level_name' => $sk['level_name'],
                    'org_code' => $sk['org_code'],
                    'org_name' => $sk['org_name'],
                    'curriculum_sort' => (int)$sk['curriculum_sort'],
                ],
                (string)$sk['org_code'],
                (string)$sk['level_code']
            );
        }
        if ($skills !== []) {
            return $skills;
        }
    } catch (Throwable) {
        // Table absente avant migration 010
    }

    $levelId = (int)$levels[0]['level_id'];
    $st = $pdo->prepare(
        'SELECT s.id, s.code, s.name, s.sort_order, s.level_id
         FROM PORTAIL_CLUB_catalog_skills s
         WHERE s.level_id = ?
         ORDER BY s.sort_order, s.name'
    );
    $st->execute([$levelId]);
    while ($sk = $st->fetch()) {
        $lv = $levels[0];
        $skills[] = portailClubEnrichSkillRow(
            [
                'id' => (int)$sk['id'],
                'code' => $sk['code'],
                'name' => $sk['name'],
                'sort_order' => (int)$sk['sort_order'],
                'level_id' => (int)$sk['level_id'],
                'level_code' => $lv['level_code'],
                'level_name' => $lv['level_name'],
                'org_code' => $lv['org_code'],
                'org_name' => $lv['org_name'],
                'curriculum_sort' => 0,
            ],
            (string)$lv['org_code'],
            (string)$lv['level_code']
        );
    }

    return $skills;
}

/** Décisions de clôture par cursus. */
function portailClubFetchFormationLevelClosures(PDO $pdo, int $formationId): array
{
    $closures = [];
    try {
        $st = $pdo->prepare(
            'SELECT flc.level_id, flc.ok_to_certify, flc.certification_obtained,
                    l.code AS level_code, l.name AS level_name,
                    o.code AS org_code, o.name AS org_name,
                    fl.sort_order
             FROM PORTAIL_CLUB_formation_level_closure flc
             JOIN PORTAIL_CLUB_formation_levels fl
               ON fl.formation_id = flc.formation_id AND fl.level_id = flc.level_id
             JOIN PORTAIL_CLUB_catalog_levels l ON l.id = flc.level_id
             JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
             WHERE flc.formation_id = ?
             ORDER BY fl.sort_order, flc.id'
        );
        $st->execute([$formationId]);
        while ($row = $st->fetch()) {
            $closures[] = [
                'level_id' => (int)$row['level_id'],
                'level_code' => $row['level_code'],
                'level_name' => $row['level_name'],
                'org_code' => $row['org_code'],
                'org_name' => $row['org_name'],
                'ok_to_certify' => $row['ok_to_certify'] === null ? null : (bool)(int)$row['ok_to_certify'],
                'certification_obtained' => $row['certification_obtained'] === null
                    ? null : (bool)(int)$row['certification_obtained'],
            ];
        }
    } catch (Throwable) {
        // Table absente avant migration 010
    }

    return $closures;
}

/** Décisions de clôture par élève et cursus. */
function portailClubFetchFormationStudentClosures(PDO $pdo, int $formationId): array
{
    $closures = [];
    try {
        $st = $pdo->prepare(
            'SELECT fsc.student_id, fsc.level_id, fsc.ok_to_certify, fsc.certification_obtained,
                    s.first_name, s.last_name, s.sort_order AS student_sort,
                    l.code AS level_code, l.name AS level_name,
                    o.code AS org_code, o.name AS org_name,
                    fl.sort_order AS level_sort
             FROM PORTAIL_CLUB_formation_student_closure fsc
             JOIN PORTAIL_CLUB_formation_students s ON s.id = fsc.student_id
             JOIN PORTAIL_CLUB_formation_levels fl
               ON fl.formation_id = fsc.formation_id AND fl.level_id = fsc.level_id
             JOIN PORTAIL_CLUB_catalog_levels l ON l.id = fsc.level_id
             JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
             WHERE fsc.formation_id = ?
             ORDER BY s.sort_order, s.id, fl.sort_order, fsc.id'
        );
        $st->execute([$formationId]);
        while ($row = $st->fetch()) {
            $closures[] = [
                'student_id' => (int)$row['student_id'],
                'first_name' => $row['first_name'],
                'last_name' => $row['last_name'],
                'level_id' => (int)$row['level_id'],
                'level_code' => $row['level_code'],
                'level_name' => $row['level_name'],
                'org_code' => $row['org_code'],
                'org_name' => $row['org_name'],
                'ok_to_certify' => (bool)(int)$row['ok_to_certify'],
                'certification_obtained' => (bool)(int)$row['certification_obtained'],
            ];
        }
    } catch (Throwable) {
        // Table absente avant migration 016
    }

    return $closures;
}

function portailClubFormatLevelCurriculumLabel(array $levels): string
{
    $parts = [];
    foreach ($levels as $lv) {
        $org = trim((string)($lv['org_code'] ?? ''));
        $name = trim((string)($lv['level_name'] ?? ''));
        $parts[] = trim($org . ' ' . $name);
    }

    return implode(' + ', array_filter($parts));
}

function portailClubFormationLabel(array $row, ?array $levels = null): string
{
    $students = trim((string)($row['students_label'] ?? ''));
    $prefix = $students !== '' ? $students : 'Formation';
    if ($levels !== null && $levels !== []) {
        return $prefix . ' — ' . portailClubFormatLevelCurriculumLabel($levels);
    }
    $level = trim((string)($row['level_name'] ?? ''));
    $org = trim((string)($row['org_code'] ?? ''));
    return $prefix . ' — ' . $org . ' ' . $level;
}

/** @return list<int> */
function portailClubParseFormationLevelIds(array $body): array
{
    if (isset($body['level_ids']) && is_array($body['level_ids'])) {
        $ids = [];
        foreach ($body['level_ids'] as $id) {
            $ids[] = portailClubIntParam($id, 'level_ids');
        }
        $ids = array_values(array_unique($ids));
        if ($ids === []) {
            portailClubJsonFail('Au moins un niveau requis.');
        }
        if (count($ids) > 2) {
            portailClubJsonFail('Maximum deux cursus par formation.');
        }
        return $ids;
    }

    return [portailClubIntParam($body['level_id'] ?? null, 'level_id')];
}

/** @param list<int> $levelIds */
function portailClubValidateFormationLevelIds(PDO $pdo, array $levelIds): void
{
    if ($levelIds === []) {
        portailClubJsonFail('Au moins un niveau requis.');
    }
    if (count($levelIds) > 2) {
        portailClubJsonFail('Maximum deux cursus par formation.');
    }

    $st = $pdo->prepare(
        'SELECT l.id, l.org_id, o.code AS org_code
         FROM PORTAIL_CLUB_catalog_levels l
         JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
         WHERE l.id = ?'
    );
    $orgIds = [];
    foreach ($levelIds as $levelId) {
        $st->execute([$levelId]);
        $row = $st->fetch();
        if (!$row) {
            portailClubJsonFail('Niveau catalogue introuvable.', 404);
        }
        $orgId = (int)$row['org_id'];
        if (isset($orgIds[$orgId])) {
            portailClubJsonFail('Deux niveaux du même organisme ne sont pas autorisés.');
        }
        $orgIds[$orgId] = true;
    }
}

/** @param list<int> $levelIds */
function portailClubInsertFormationLevels(PDO $pdo, int $formationId, array $levelIds): void
{
    try {
        $st = $pdo->prepare(
            'INSERT INTO PORTAIL_CLUB_formation_levels (formation_id, level_id, sort_order)
             VALUES (?, ?, ?)'
        );
        foreach ($levelIds as $idx => $levelId) {
            $st->execute([$formationId, $levelId, $idx]);
        }
    } catch (Throwable $e) {
        if (count($levelIds) > 1) {
            portailClubJsonFail('Double cursus indisponible : exécuter la migration sql/010_dual_curriculum.sql.');
        }
    }
}

function portailClubGroupSkillsByLevel(array $skills): array
{
    $byLevel = [];
    foreach ($skills as $skill) {
        $lid = (int)$skill['level_id'];
        if (!isset($byLevel[$lid])) {
            $byLevel[$lid] = [
                'level_id' => $lid,
                'level_code' => $skill['level_code'] ?? '',
                'level_name' => $skill['level_name'] ?? '',
                'org_code' => $skill['org_code'] ?? '',
                'org_name' => $skill['org_name'] ?? '',
                'skills' => [],
            ];
        }
        $byLevel[$lid]['skills'][] = $skill;
    }

    return array_values($byLevel);
}

function portailClubFetchFormationRow(PDO $pdo, int $formationId): ?array
{
    $st = $pdo->prepare(
        'SELECT f.id, f.level_id, f.student_mode, f.status, f.ok_to_certify, f.certification_obtained,
                f.created_at, f.archived_at, f.closed_by_instructor,
                l.code AS level_code, l.name AS level_name,
                o.code AS org_code, o.name AS org_name,
                (SELECT GROUP_CONCAT(
                    CONCAT(s.first_name, " ", s.last_name)
                    ORDER BY s.sort_order, s.id SEPARATOR ", "
                 )
                 FROM PORTAIL_CLUB_formation_students s
                 WHERE s.formation_id = f.id) AS students_label,
                (SELECT COUNT(*)
                 FROM PORTAIL_CLUB_formation_sessions fs
                 WHERE fs.formation_id = f.id
                   AND EXISTS (
                     SELECT 1 FROM PORTAIL_CLUB_session_evaluations se WHERE se.session_id = fs.id
                   )) AS session_count
         FROM PORTAIL_CLUB_formations f
         JOIN PORTAIL_CLUB_catalog_levels l ON l.id = f.level_id
         JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
         WHERE f.id = ?'
    );
    $st->execute([$formationId]);
    $row = $st->fetch();
    return $row ?: null;
}

/** @return list<array{first_name: string, last_name: string}> */
function portailClubFetchFormationStudentsBrief(PDO $pdo, int $formationId): array
{
    $st = $pdo->prepare(
        'SELECT first_name, last_name
         FROM PORTAIL_CLUB_formation_students
         WHERE formation_id = ?
         ORDER BY sort_order, id'
    );
    $st->execute([$formationId]);
    $students = [];
    while ($row = $st->fetch()) {
        $students[] = [
            'first_name' => (string)$row['first_name'],
            'last_name' => (string)($row['last_name'] ?? ''),
        ];
    }

    return $students;
}

/** @return list<string> */
function portailClubFetchFormationInstructorNames(PDO $pdo, int $formationId): array
{
    $st = $pdo->prepare(
        'SELECT DISTINCT se.instructor_name
         FROM PORTAIL_CLUB_session_evaluations se
         JOIN PORTAIL_CLUB_formation_sessions fs ON fs.id = se.session_id
         WHERE fs.formation_id = ?
           AND TRIM(se.instructor_name) <> \'\'
         ORDER BY se.instructor_name'
    );
    $st->execute([$formationId]);
    $names = [];
    while ($row = $st->fetch()) {
        $name = trim((string)$row['instructor_name']);
        if ($name !== '') {
            $names[] = $name;
        }
    }

    return $names;
}

function portailClubFetchFormationStartedAt(PDO $pdo, int $formationId, ?string $createdAt): ?string
{
    $st = $pdo->prepare(
        'SELECT MIN(fs.held_at) AS started_at
         FROM PORTAIL_CLUB_formation_sessions fs
         WHERE fs.formation_id = ?
           AND EXISTS (
             SELECT 1 FROM PORTAIL_CLUB_session_evaluations se WHERE se.session_id = fs.id
           )'
    );
    $st->execute([$formationId]);
    $row = $st->fetch();
    $startedAt = $row['started_at'] ?? null;

    return $startedAt !== null && $startedAt !== '' ? (string)$startedAt : $createdAt;
}

function portailClubFormatFormationSummary(array $row, array $levels = [], array $closures = [], array $cardExtras = []): array
{
    $isDual = count($levels) > 1;
    $primary = $levels[0] ?? null;

    return [
        'id' => (int)$row['id'],
        'level_id' => $primary !== null ? (int)$primary['level_id'] : (int)$row['level_id'],
        'student_mode' => $row['student_mode'],
        'status' => $row['status'],
        'label' => portailClubFormationLabel($row, $levels !== [] ? $levels : null),
        'students_label' => $row['students_label'] ?? '',
        'students' => $cardExtras['students'] ?? [],
        'instructors' => $cardExtras['instructors'] ?? [],
        'started_at' => $cardExtras['started_at'] ?? $row['created_at'],
        'org_code' => $primary['org_code'] ?? $row['org_code'],
        'org_name' => $primary['org_name'] ?? $row['org_name'],
        'level_code' => $primary['level_code'] ?? $row['level_code'],
        'level_name' => $primary['level_name'] ?? $row['level_name'],
        'levels' => array_map(static fn(array $lv): array => [
            'level_id' => (int)$lv['level_id'],
            'level_code' => $lv['level_code'],
            'level_name' => $lv['level_name'],
            'org_code' => $lv['org_code'],
            'org_name' => $lv['org_name'],
            'sort_order' => (int)($lv['sort_order'] ?? 0),
        ], $levels),
        'is_dual' => $isDual,
        'curriculum_label' => $levels !== [] ? portailClubFormatLevelCurriculumLabel($levels) : null,
        'closures' => $closures,
        'session_count' => (int)($row['session_count'] ?? 0),
        'ok_to_certify' => $row['ok_to_certify'] === null ? null : (bool)(int)$row['ok_to_certify'],
        'certification_obtained' => $row['certification_obtained'] === null ? null : (bool)(int)$row['certification_obtained'],
        'closed_by_instructor' => isset($row['closed_by_instructor']) && $row['closed_by_instructor'] !== ''
            ? (string)$row['closed_by_instructor'] : null,
        'created_at' => $row['created_at'],
        'archived_at' => $row['archived_at'],
    ];
}

function portailClubEnrichFormationSummary(PDO $pdo, array $row): array
{
    $formationId = (int)$row['id'];
    $levels = portailClubFetchFormationLevels($pdo, $formationId);
    $closures = portailClubFetchFormationLevelClosures($pdo, $formationId);
    $cardExtras = [
        'students' => portailClubFetchFormationStudentsBrief($pdo, $formationId),
        'instructors' => portailClubFetchFormationInstructorNames($pdo, $formationId),
        'started_at' => portailClubFetchFormationStartedAt($pdo, $formationId, $row['created_at'] ?? null),
    ];

    return portailClubFormatFormationSummary($row, $levels, $closures, $cardExtras);
}

function portailClubListFormations(PDO $pdo, ?string $status = null): array
{
    $where = '';
    $params = [];
    if ($status !== null && $status !== '') {
        if (!in_array($status, ['in_progress', 'archived'], true)) {
            portailClubJsonFail('Statut invalide.');
        }
        $where = 'WHERE f.status = ?';
        $params[] = $status;
    }

    $st = $pdo->prepare(
        "SELECT f.id, f.level_id, f.student_mode, f.status, f.ok_to_certify, f.certification_obtained,
                f.created_at, f.archived_at,
                l.code AS level_code, l.name AS level_name,
                o.code AS org_code, o.name AS org_name,
                (SELECT GROUP_CONCAT(
                    CONCAT(s.first_name, ' ', s.last_name)
                    ORDER BY s.sort_order, s.id SEPARATOR ', '
                 )
                 FROM PORTAIL_CLUB_formation_students s
                 WHERE s.formation_id = f.id) AS students_label,
                (SELECT COUNT(*)
                 FROM PORTAIL_CLUB_formation_sessions fs
                 WHERE fs.formation_id = f.id
                   AND EXISTS (
                     SELECT 1 FROM PORTAIL_CLUB_session_evaluations se WHERE se.session_id = fs.id
                   )) AS session_count
         FROM PORTAIL_CLUB_formations f
         JOIN PORTAIL_CLUB_catalog_levels l ON l.id = f.level_id
         JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
         {$where}
         ORDER BY f.created_at DESC, f.id DESC"
    );
    $st->execute($params);

    $rows = [];
    while ($row = $st->fetch()) {
        $rows[] = portailClubEnrichFormationSummary($pdo, $row);
    }
    return $rows;
}

function portailClubParseSessionDateParam(string $raw): string
{
    $raw = trim($raw);
    if ($raw === '') {
        portailClubJsonFail('Date obligatoire.', 400);
    }
    $dt = DateTime::createFromFormat('Y-m-d', $raw);
    if ($dt === false || $dt->format('Y-m-d') !== $raw) {
        portailClubJsonFail('Date invalide (format YYYY-MM-DD attendu).', 400);
    }
    return $raw;
}

/** @return list<array> */
function portailClubSearchArchivedFormations(
    PDO $pdo,
    string $sessionDate,
    ?string $instructor,
    ?string $studentFirstName
): array {
    $sessionDate = portailClubParseSessionDateParam($sessionDate);
    $instructor = $instructor !== null ? trim($instructor) : '';
    $studentFirstName = $studentFirstName !== null ? trim($studentFirstName) : '';

    $sql = "SELECT f.id, f.level_id, f.student_mode, f.status, f.ok_to_certify, f.certification_obtained,
                f.created_at, f.archived_at,
                l.code AS level_code, l.name AS level_name,
                o.code AS org_code, o.name AS org_name,
                (SELECT GROUP_CONCAT(
                    CONCAT(s.first_name, ' ', s.last_name)
                    ORDER BY s.sort_order, s.id SEPARATOR ', '
                 )
                 FROM PORTAIL_CLUB_formation_students s
                 WHERE s.formation_id = f.id) AS students_label,
                (SELECT COUNT(*)
                 FROM PORTAIL_CLUB_formation_sessions fs
                 WHERE fs.formation_id = f.id
                   AND EXISTS (
                     SELECT 1 FROM PORTAIL_CLUB_session_evaluations se WHERE se.session_id = fs.id
                   )) AS session_count
         FROM PORTAIL_CLUB_formations f
         JOIN PORTAIL_CLUB_catalog_levels l ON l.id = f.level_id
         JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
         WHERE f.status = 'archived'
           AND EXISTS (
             SELECT 1 FROM PORTAIL_CLUB_formation_sessions fs
             WHERE fs.formation_id = f.id
               AND DATE(fs.held_at) = ?
           )";
    $params = [$sessionDate];

    if ($instructor !== '') {
        $sql .= " AND EXISTS (
             SELECT 1 FROM PORTAIL_CLUB_session_evaluations se
             JOIN PORTAIL_CLUB_formation_sessions fs ON fs.id = se.session_id
             WHERE fs.formation_id = f.id
               AND se.instructor_name LIKE ?
         )";
        $params[] = '%' . $instructor . '%';
    }

    if ($studentFirstName !== '') {
        $sql .= " AND EXISTS (
             SELECT 1 FROM PORTAIL_CLUB_formation_students st
             WHERE st.formation_id = f.id
               AND st.first_name LIKE ?
         )";
        $params[] = '%' . $studentFirstName . '%';
    }

    $sql .= ' ORDER BY f.archived_at DESC, f.id DESC';

    $st = $pdo->prepare($sql);
    $st->execute($params);

    $rows = [];
    while ($row = $st->fetch()) {
        $rows[] = portailClubEnrichFormationSummary($pdo, $row);
    }

    return $rows;
}

function portailClubRestoreFormation(PDO $pdo, int $formationId): array
{
    $row = portailClubFetchFormationRow($pdo, $formationId);
    if ($row === null) {
        portailClubJsonFail('Formation introuvable.', 404);
    }
    if ($row['status'] !== 'archived') {
        portailClubJsonFail('Cette formation n\'est pas archivée.', 409);
    }

    $st = $pdo->prepare(
        "UPDATE PORTAIL_CLUB_formations
         SET status = 'in_progress', archived_at = NULL
         WHERE id = ? AND status = 'archived'"
    );
    $st->execute([$formationId]);

    return portailClubGetFormationDetail($pdo, $formationId);
}

function portailClubGetFormationDetail(PDO $pdo, int $formationId): array
{
    $row = portailClubFetchFormationRow($pdo, $formationId);
    if ($row === null) {
        portailClubJsonFail('Formation introuvable.', 404);
    }

    $stStudents = $pdo->prepare(
        'SELECT id, first_name, last_name, sort_order
         FROM PORTAIL_CLUB_formation_students
         WHERE formation_id = ?
         ORDER BY sort_order, id'
    );
    $stStudents->execute([$formationId]);
    $students = [];
    while ($s = $stStudents->fetch()) {
        $students[] = [
            'id' => (int)$s['id'],
            'first_name' => $s['first_name'],
            'last_name' => $s['last_name'],
            'sort_order' => (int)$s['sort_order'],
        ];
    }

    $levels = portailClubFetchFormationLevels($pdo, $formationId);
    $closures = portailClubFetchFormationLevelClosures($pdo, $formationId);
    $skills = portailClubFetchFormationSkills($pdo, $formationId);
    $skillGroups = portailClubGroupSkillsByLevel($skills);

    $stSessions = $pdo->prepare(
        'SELECT fs.id, fs.session_number, fs.held_at, fs.time_slot, fs.created_at, fs.catchup_batch_id
         FROM PORTAIL_CLUB_formation_sessions fs
         WHERE fs.formation_id = ?
           AND EXISTS (
             SELECT 1 FROM PORTAIL_CLUB_session_evaluations se WHERE se.session_id = fs.id
           )
         ORDER BY fs.session_number DESC'
    );
    $stSessions->execute([$formationId]);
    $sessions = [];
    while ($sess = $stSessions->fetch()) {
        $sessions[] = portailClubEnrichSessionCatchupMeta($pdo, [
            'id' => (int)$sess['id'],
            'session_number' => (int)$sess['session_number'],
            'held_at' => $sess['held_at'],
            'time_slot' => $sess['time_slot'] ?? 'morning',
            'time_slot_label' => portailClubTimeSlotLabel($sess['time_slot'] ?? 'morning'),
            'created_at' => $sess['created_at'],
            'catchup_batch_id' => $sess['catchup_batch_id'] ?? null,
        ]);
    }

    $summary = portailClubFormatFormationSummary($row, $levels, $closures);
    $summary['students'] = $students;
    $summary['instructors'] = portailClubFetchFormationInstructorNames($pdo, $formationId);
    $summary['student_closures'] = portailClubFetchFormationStudentClosures($pdo, $formationId);
    $summary['skills'] = $skills;
    $summary['skill_groups'] = $skillGroups;
    $summary['sessions'] = $sessions;
    return $summary;
}

function portailClubCreateFormation(PDO $pdo, array $body): array
{
    $levelIds = portailClubParseFormationLevelIds($body);
    $levelId = $levelIds[0];
    $mode = strtolower(trim((string)($body['student_mode'] ?? 'solo')));
    if (!in_array($mode, ['solo', 'group'], true)) {
        portailClubJsonFail('Mode élève invalide.');
    }

    $studentsRaw = $body['students'] ?? null;
    if (!is_array($studentsRaw) || $studentsRaw === []) {
        portailClubJsonFail('Au moins un élève requis.');
    }

    $students = [];
    foreach ($studentsRaw as $idx => $item) {
        if (!is_array($item)) {
            portailClubJsonFail('Format élève invalide.');
        }
        $students[] = [
            'first_name' => portailClubTrimName($item['first_name'] ?? '', 'Prénom élève'),
            'last_name' => portailClubTrimOptionalName($item['last_name'] ?? ''),
            'sort_order' => (int)$idx,
        ];
    }

    if ($mode === 'solo' && count($students) !== 1) {
        portailClubJsonFail('Mode solo : un seul élève.');
    }
    if ($mode === 'group' && count($students) < 2) {
        portailClubJsonFail('Mode groupe : au moins deux élèves.');
    }

    portailClubValidateFormationLevelIds($pdo, $levelIds);

    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare(
            'INSERT INTO PORTAIL_CLUB_formations (level_id, student_mode, status)
             VALUES (?, ?, \'in_progress\')'
        );
        $st->execute([$levelId, $mode]);
        $formationId = (int)$pdo->lastInsertId();

        portailClubInsertFormationLevels($pdo, $formationId, $levelIds);

        $stStudent = $pdo->prepare(
            'INSERT INTO PORTAIL_CLUB_formation_students (formation_id, first_name, last_name, sort_order)
             VALUES (?, ?, ?, ?)'
        );
        foreach ($students as $student) {
            $stStudent->execute([
                $formationId,
                $student['first_name'],
                $student['last_name'],
                $student['sort_order'],
            ]);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    return portailClubGetFormationDetail($pdo, $formationId);
}

/**
 * Ajoute un 2e cursus à une formation en cours (ex. FFESSM N2 + PADI AOW).
 * Retrait d'un cursus non autorisé en v1.
 */
function portailClubUpdateFormationCurricula(PDO $pdo, int $formationId, array $body): array
{
    $row = portailClubFetchFormationRow($pdo, $formationId);
    if ($row === null) {
        portailClubJsonFail('Formation introuvable.', 404);
    }
    if ($row['status'] !== 'in_progress') {
        portailClubJsonFail('Formation archivée : modification impossible.');
    }

    $currentLevels = portailClubFetchFormationLevels($pdo, $formationId);
    $currentIds = array_column($currentLevels, 'level_id');

    if (isset($body['add_level_id'])) {
        $addId = portailClubIntParam($body['add_level_id'], 'add_level_id');
        if (count($currentIds) >= 2) {
            portailClubJsonFail('Cette formation a déjà deux cursus.');
        }
        if (in_array($addId, $currentIds, true)) {
            portailClubJsonFail('Ce niveau fait déjà partie de la formation.');
        }
        $newIds = array_merge($currentIds, [$addId]);
    } elseif (isset($body['level_ids']) && is_array($body['level_ids'])) {
        $newIds = portailClubParseFormationLevelIds($body);
        foreach ($currentIds as $cid) {
            if (!in_array($cid, $newIds, true)) {
                portailClubJsonFail('Retrait d\'un cursus non autorisé.');
            }
        }
        if ($newIds === $currentIds) {
            portailClubJsonFail('Aucune modification de cursus.');
        }
        if (count($newIds) <= count($currentIds)) {
            portailClubJsonFail('Ajoutez un second cursus (add_level_id).');
        }
    } else {
        portailClubJsonFail('Niveau à ajouter requis (add_level_id).');
    }

    portailClubValidateFormationLevelIds($pdo, $newIds);

    $toAdd = array_values(array_diff($newIds, $currentIds));
    if ($toAdd === []) {
        portailClubJsonFail('Aucun cursus à ajouter.');
    }

    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare(
            'INSERT INTO PORTAIL_CLUB_formation_levels (formation_id, level_id, sort_order)
             VALUES (?, ?, ?)'
        );
        foreach ($toAdd as $levelId) {
            $sortOrder = count($currentIds);
            $st->execute([$formationId, $levelId, $sortOrder]);
            $currentIds[] = $levelId;
        }

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        if (str_contains($e->getMessage(), 'PORTAIL_CLUB_formation_levels')) {
            portailClubJsonFail('Double cursus indisponible : exécuter la migration sql/010_dual_curriculum.sql.');
        }
        throw $e;
    }

    return portailClubGetFormationDetail($pdo, $formationId);
}

function portailClubParseClosureDecision(mixed $okRaw, mixed $certRaw): array
{
    $ok = filter_var($okRaw, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
    $cert = filter_var($certRaw, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
    if ($ok === null || $cert === null) {
        portailClubJsonFail('Décision de clôture invalide.');
    }

    return ['ok_to_certify' => $ok, 'certification_obtained' => $cert];
}

/** @param list<int> $levelIds @param list<int> $studentIds @return list<array{student_id:int,level_id:int,ok_to_certify:bool,certification_obtained:bool}> */
function portailClubParseStudentClosuresFromBody(
    array $body,
    array $levelIds,
    array $studentIds
): array {
    $studentClosuresIn = $body['student_closures'] ?? null;
    if (is_array($studentClosuresIn) && $studentClosuresIn !== []) {
        $parsed = [];
        $seen = [];
        foreach ($studentClosuresIn as $item) {
            if (!is_array($item)) {
                portailClubJsonFail('Format clôture élève invalide.');
            }
            $studentId = portailClubIntParam($item['student_id'] ?? null, 'student_id');
            $levelId = portailClubIntParam($item['level_id'] ?? null, 'level_id');
            if (!in_array($studentId, $studentIds, true)) {
                portailClubJsonFail('Élève hors formation.');
            }
            if (!in_array($levelId, $levelIds, true)) {
                portailClubJsonFail('Niveau hors formation.');
            }
            $key = $studentId . ':' . $levelId;
            if (isset($seen[$key])) {
                portailClubJsonFail('Décision de clôture en double pour un élève.');
            }
            $seen[$key] = true;
            $decision = portailClubParseClosureDecision(
                $item['ok_to_certify'] ?? null,
                $item['certification_obtained'] ?? null
            );
            $parsed[] = [
                'student_id' => $studentId,
                'level_id' => $levelId,
                'ok_to_certify' => $decision['ok_to_certify'],
                'certification_obtained' => $decision['certification_obtained'],
            ];
        }
        $expected = count($studentIds) * count($levelIds);
        if (count($parsed) !== $expected) {
            portailClubJsonFail('Décision de clôture incomplète (chaque élève × cursus).');
        }

        return $parsed;
    }

    $levelClosures = [];
    $closuresIn = $body['closures'] ?? null;
    if (is_array($closuresIn) && $closuresIn !== []) {
        $byLevel = [];
        foreach ($closuresIn as $item) {
            if (!is_array($item)) {
                portailClubJsonFail('Format clôture invalide.');
            }
            $lid = portailClubIntParam($item['level_id'] ?? null, 'level_id');
            if (!in_array($lid, $levelIds, true)) {
                portailClubJsonFail('Niveau hors formation.');
            }
            $decision = portailClubParseClosureDecision(
                $item['ok_to_certify'] ?? null,
                $item['certification_obtained'] ?? null
            );
            $byLevel[$lid] = $decision;
        }
        if (count($byLevel) !== count($levelIds)) {
            portailClubJsonFail('Décision de clôture incomplète (un bloc par cursus).');
        }
        foreach ($levelIds as $lid) {
            $levelClosures[] = array_merge(['level_id' => $lid], $byLevel[$lid]);
        }
    } else {
        $decision = portailClubParseClosureDecision(
            $body['ok_to_certify'] ?? null,
            $body['certification_obtained'] ?? null
        );
        foreach ($levelIds as $lid) {
            $levelClosures[] = array_merge(['level_id' => $lid], $decision);
        }
    }

    $parsed = [];
    foreach ($studentIds as $studentId) {
        foreach ($levelClosures as $closure) {
            $parsed[] = [
                'student_id' => $studentId,
                'level_id' => $closure['level_id'],
                'ok_to_certify' => $closure['ok_to_certify'],
                'certification_obtained' => $closure['certification_obtained'],
            ];
        }
    }

    return $parsed;
}

function portailClubCloseFormation(PDO $pdo, int $formationId, array $body): array
{
    $row = portailClubFetchFormationRow($pdo, $formationId);
    if ($row === null) {
        portailClubJsonFail('Formation introuvable.', 404);
    }
    if ($row['status'] === 'archived') {
        portailClubJsonFail('Formation déjà archivée.');
    }

    $levels = portailClubFetchFormationLevels($pdo, $formationId);
    $levelIds = array_column($levels, 'level_id');
    $stStudents = $pdo->prepare(
        'SELECT id FROM PORTAIL_CLUB_formation_students WHERE formation_id = ? ORDER BY sort_order, id'
    );
    $stStudents->execute([$formationId]);
    $studentIds = array_map(static fn(array $r): int => (int)$r['id'], $stStudents->fetchAll());
    if ($studentIds === []) {
        portailClubJsonFail('Aucun élève dans la formation.');
    }

    $parsedStudentClosures = portailClubParseStudentClosuresFromBody($body, $levelIds, $studentIds);

    $levelClosures = [];
    foreach ($levelIds as $lid) {
        foreach ($parsedStudentClosures as $closure) {
            if ($closure['level_id'] === $lid) {
                $levelClosures[] = [
                    'level_id' => $lid,
                    'ok_to_certify' => $closure['ok_to_certify'],
                    'certification_obtained' => $closure['certification_obtained'],
                ];
                break;
            }
        }
    }

    $closedByInstructor = trim((string)($body['instructor_name'] ?? ''));
    if ($closedByInstructor === '') {
        portailClubJsonFail('Moniteur de clôture requis.');
    }
    $formationInstructors = portailClubFetchFormationInstructorNames($pdo, $formationId);
    if ($formationInstructors !== []
        && !in_array($closedByInstructor, $formationInstructors, true)) {
        portailClubJsonFail('Choisissez un moniteur ayant participé à la formation.');
    }
    portailClubTouchInstructor($pdo, $closedByInstructor);

    $primaryStudentClosure = $parsedStudentClosures[0];
    $pdo->beginTransaction();
    try {
        try {
            $stStudentClosure = $pdo->prepare(
                'INSERT INTO PORTAIL_CLUB_formation_student_closure
                    (formation_id, student_id, level_id, ok_to_certify, certification_obtained)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    ok_to_certify = VALUES(ok_to_certify),
                    certification_obtained = VALUES(certification_obtained)'
            );
            foreach ($parsedStudentClosures as $closure) {
                $stStudentClosure->execute([
                    $formationId,
                    $closure['student_id'],
                    $closure['level_id'],
                    (int)$closure['ok_to_certify'],
                    (int)$closure['certification_obtained'],
                ]);
            }
        } catch (Throwable $studentClosureErr) {
            throw new RuntimeException(
                'Clôture par élève : exécuter la migration sql/016_formation_student_closure.sql.',
                0,
                $studentClosureErr
            );
        }

        try {
            $stClosure = $pdo->prepare(
                'INSERT INTO PORTAIL_CLUB_formation_level_closure
                    (formation_id, level_id, ok_to_certify, certification_obtained)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    ok_to_certify = VALUES(ok_to_certify),
                    certification_obtained = VALUES(certification_obtained)'
            );
            foreach ($levelClosures as $closure) {
                $stClosure->execute([
                    $formationId,
                    $closure['level_id'],
                    (int)$closure['ok_to_certify'],
                    (int)$closure['certification_obtained'],
                ]);
            }
        } catch (Throwable $closureErr) {
            if (count($levelClosures) > 1) {
                throw new RuntimeException(
                    'Double cursus : exécuter la migration sql/010_dual_curriculum.sql.',
                    0,
                    $closureErr
                );
            }
        }

        $st = $pdo->prepare(
            'UPDATE PORTAIL_CLUB_formations
             SET ok_to_certify = ?, certification_obtained = ?, closed_by_instructor = ?,
                 status = \'archived\', archived_at = NOW()
             WHERE id = ?'
        );
        $st->execute([
            (int)$primaryStudentClosure['ok_to_certify'],
            (int)$primaryStudentClosure['certification_obtained'],
            $closedByInstructor,
            $formationId,
        ]);

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    return portailClubGetFormationDetail($pdo, $formationId);
}

function portailClubListRecentSessions(PDO $pdo, int $limit = 20): array
{
    $limit = max(1, min(50, $limit));
    $st = $pdo->query(
        "SELECT fs.id, fs.formation_id, fs.session_number, fs.held_at, fs.time_slot,
                f.status AS formation_status,
                l.name AS level_name, o.code AS org_code,
                (SELECT GROUP_CONCAT(
                    CONCAT(s.first_name, ' ', s.last_name)
                    ORDER BY s.sort_order, s.id SEPARATOR ', '
                 )
                 FROM PORTAIL_CLUB_formation_students s
                 WHERE s.formation_id = f.id) AS students_label
         FROM PORTAIL_CLUB_formation_sessions fs
         JOIN PORTAIL_CLUB_formations f ON f.id = fs.formation_id
         JOIN PORTAIL_CLUB_catalog_levels l ON l.id = f.level_id
         JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
         WHERE f.status = 'in_progress'
           AND EXISTS (
             SELECT 1 FROM PORTAIL_CLUB_session_evaluations se WHERE se.session_id = fs.id
           )
         ORDER BY fs.held_at DESC, fs.id DESC
         LIMIT {$limit}"
    );

    $rows = [];
    while ($row = $st->fetch()) {
        $rows[] = [
            'id' => (int)$row['id'],
            'formation_id' => (int)$row['formation_id'],
            'session_number' => (int)$row['session_number'],
            'held_at' => $row['held_at'],
            'time_slot' => $row['time_slot'] ?? 'morning',
            'time_slot_label' => portailClubTimeSlotLabel($row['time_slot'] ?? 'morning'),
            'formation_status' => $row['formation_status'],
            'org_code' => $row['org_code'],
            'level_name' => $row['level_name'],
            'students_label' => $row['students_label'] ?? '',
            'label' => portailClubFormationLabel($row) . ' — séance ' . (int)$row['session_number'],
        ];
    }
    return $rows;
}

/** Supprime les séances sans évaluation (brouillons / créations abandonnées). */
function portailClubPurgeEmptyFormationSessions(PDO $pdo, ?int $formationId = null): int
{
    if ($formationId !== null) {
        $st = $pdo->prepare(
            'DELETE fs FROM PORTAIL_CLUB_formation_sessions fs
             WHERE fs.formation_id = ?
               AND NOT EXISTS (
                 SELECT 1 FROM PORTAIL_CLUB_session_evaluations se WHERE se.session_id = fs.id
               )'
        );
        $st->execute([$formationId]);
        return $st->rowCount();
    }

    $st = $pdo->query(
        'DELETE fs FROM PORTAIL_CLUB_formation_sessions fs
         WHERE NOT EXISTS (
           SELECT 1 FROM PORTAIL_CLUB_session_evaluations se WHERE se.session_id = fs.id
         )'
    );
    return $st->rowCount();
}

/** Renumérote les séances enregistrées 1…n (ordre chronologique). */
function portailClubCompactFormationSessionNumbers(PDO $pdo, int $formationId): int
{
    $st = $pdo->prepare(
        'SELECT fs.id FROM PORTAIL_CLUB_formation_sessions fs
         WHERE fs.formation_id = ?
           AND EXISTS (
             SELECT 1 FROM PORTAIL_CLUB_session_evaluations se WHERE se.session_id = fs.id
           )
         ORDER BY fs.held_at ASC, fs.id ASC
         FOR UPDATE'
    );
    $st->execute([$formationId]);
    $ids = [];
    while ($row = $st->fetch()) {
        $ids[] = (int)$row['id'];
    }
    if ($ids === []) {
        return 0;
    }

    $stUp = $pdo->prepare(
        'UPDATE PORTAIL_CLUB_formation_sessions SET session_number = ? WHERE id = ?'
    );
    // Numéros temporaires uniques (50000 + id) pour éviter les collisions avec les inserts catchup (20000+).
    foreach ($ids as $id) {
        $stUp->execute([50000 + $id, $id]);
    }
    $num = 1;
    foreach ($ids as $id) {
        $stUp->execute([$num++, $id]);
    }

    return count($ids);
}

/** Nettoie et retourne le prochain numéro de séance (consécutif). */
function portailClubNextSessionNumber(PDO $pdo, int $formationId): int
{
    portailClubPurgeEmptyFormationSessions($pdo, $formationId);
    portailClubCompactFormationSessionNumbers($pdo, $formationId);

    $st = $pdo->prepare(
        'SELECT COUNT(*) FROM PORTAIL_CLUB_formation_sessions fs
         WHERE fs.formation_id = ?
           AND EXISTS (
             SELECT 1 FROM PORTAIL_CLUB_session_evaluations se WHERE se.session_id = fs.id
           )'
    );
    $st->execute([$formationId]);

    return (int)$st->fetchColumn() + 1;
}

function portailClubCompactAllFormationSessions(PDO $pdo): array
{
    $st = $pdo->query(
        'SELECT DISTINCT formation_id FROM PORTAIL_CLUB_formation_sessions ORDER BY formation_id'
    );
    $purged = portailClubPurgeEmptyFormationSessions($pdo);
    $formations = 0;
    $renumbered = 0;
    while ($row = $st->fetch()) {
        $renumbered += portailClubCompactFormationSessionNumbers($pdo, (int)$row['formation_id']);
        $formations++;
    }

    return ['formations' => $formations, 'purged' => $purged, 'renumbered' => $renumbered];
}

function portailClubCreateSession(PDO $pdo, int $formationId, array $body): array
{
    $row = portailClubFetchFormationRow($pdo, $formationId);
    if ($row === null) {
        portailClubJsonFail('Formation introuvable.', 404);
    }
    if ($row['status'] !== 'in_progress') {
        portailClubJsonFail('Formation archivée : séance impossible.');
    }

    $heldAt = trim((string)($body['held_at'] ?? ''));
    if ($heldAt === '') {
        $heldAt = date('Y-m-d H:i:s');
    }
    $timeSlot = portailClubNormalizeTimeSlot($body['time_slot'] ?? 'morning');

    $pdo->beginTransaction();
    try {
        $stLock = $pdo->prepare(
            'SELECT id FROM PORTAIL_CLUB_formations WHERE id = ? FOR UPDATE'
        );
        $stLock->execute([$formationId]);

        $nextNum = portailClubNextSessionNumber($pdo, $formationId);

        $st = $pdo->prepare(
            'INSERT INTO PORTAIL_CLUB_formation_sessions (formation_id, session_number, held_at, time_slot)
             VALUES (?, ?, ?, ?)'
        );
        $st->execute([$formationId, $nextNum, $heldAt, $timeSlot]);
        $sessionId = (int)$pdo->lastInsertId();
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    return portailClubGetSessionDetail($pdo, $sessionId);
}

function portailClubGetSessionDetail(PDO $pdo, int $sessionId): array
{
    $st = $pdo->prepare(
        'SELECT fs.id, fs.formation_id, fs.session_number, fs.held_at, fs.time_slot, fs.created_at,
                fs.catchup_batch_id,
                f.status AS formation_status, f.level_id,
                l.name AS level_name, o.code AS org_code
         FROM PORTAIL_CLUB_formation_sessions fs
         JOIN PORTAIL_CLUB_formations f ON f.id = fs.formation_id
         JOIN PORTAIL_CLUB_catalog_levels l ON l.id = f.level_id
         JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
         WHERE fs.id = ?'
    );
    $st->execute([$sessionId]);
    $session = $st->fetch();
    if (!$session) {
        portailClubJsonFail('Séance introuvable.', 404);
    }

    $formationId = (int)$session['formation_id'];
    $levelId = (int)$session['level_id'];
    $formationLevels = portailClubFetchFormationLevels($pdo, $formationId);
    $curriculumLabel = $formationLevels !== []
        ? portailClubFormatLevelCurriculumLabel($formationLevels)
        : trim($session['org_code'] . ' ' . $session['level_name']);

    $stStudents = $pdo->prepare(
        'SELECT id, first_name, last_name, sort_order
         FROM PORTAIL_CLUB_formation_students
         WHERE formation_id = ?
         ORDER BY sort_order, id'
    );
    $stStudents->execute([$formationId]);
    $students = [];
    while ($s = $stStudents->fetch()) {
        $students[] = [
            'id' => (int)$s['id'],
            'first_name' => $s['first_name'],
            'last_name' => $s['last_name'],
            'sort_order' => (int)$s['sort_order'],
        ];
    }

    $skills = portailClubFetchFormationSkills($pdo, $formationId);
    $skillGroups = portailClubGroupSkillsByLevel($skills);

    $stEval = $pdo->prepare(
        'SELECT student_id, skill_id, instructor_name, eval_level, updated_at
         FROM PORTAIL_CLUB_session_evaluations
         WHERE session_id = ?'
    );
    $stEval->execute([$sessionId]);
    $evals = [];
    while ($ev = $stEval->fetch()) {
        $evals[] = [
            'student_id' => (int)$ev['student_id'],
            'skill_id' => (int)$ev['skill_id'],
            'instructor_name' => $ev['instructor_name'],
            'eval_level' => $ev['eval_level'],
            'updated_at' => $ev['updated_at'],
        ];
    }

    $stComments = $pdo->prepare(
        'SELECT student_id, instructor_name, comment, updated_at
         FROM PORTAIL_CLUB_session_student_comments
         WHERE session_id = ?'
    );
    $stComments->execute([$sessionId]);
    $comments = [];
    while ($cm = $stComments->fetch()) {
        $comments[] = [
            'student_id' => (int)$cm['student_id'],
            'instructor_name' => $cm['instructor_name'],
            'comment' => $cm['comment'],
            'updated_at' => $cm['updated_at'],
        ];
    }

    return portailClubEnrichSessionCatchupMeta($pdo, [
        'id' => (int)$session['id'],
        'formation_id' => $formationId,
        'level_id' => $levelId,
        'session_number' => (int)$session['session_number'],
        'held_at' => $session['held_at'],
        'time_slot' => $session['time_slot'] ?? 'morning',
        'time_slot_label' => portailClubTimeSlotLabel($session['time_slot'] ?? 'morning'),
        'created_at' => $session['created_at'],
        'catchup_batch_id' => $session['catchup_batch_id'] ?? null,
        'formation_status' => $session['formation_status'],
        'org_code' => $session['org_code'],
        'level_name' => $session['level_name'],
        'levels' => array_map(static fn(array $lv): array => [
            'level_id' => (int)$lv['level_id'],
            'level_code' => $lv['level_code'],
            'level_name' => $lv['level_name'],
            'org_code' => $lv['org_code'],
            'org_name' => $lv['org_name'],
            'sort_order' => (int)($lv['sort_order'] ?? 0),
        ], $formationLevels),
        'is_dual' => count($formationLevels) > 1,
        'curriculum_label' => $curriculumLabel,
        'students' => $students,
        'skills' => $skills,
        'skill_groups' => $skillGroups,
        'evaluations' => $evals,
        'comments' => $comments,
    ]);
}

function portailClubUpsertSessionStudentComments(PDO $pdo, int $sessionId, array $items, array $studentIds): void
{
    if (!is_array($items)) {
        return;
    }

    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_session_student_comments
            (session_id, student_id, instructor_name, comment)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            instructor_name = VALUES(instructor_name),
            comment = VALUES(comment),
            updated_at = NOW()'
    );
    $stDel = $pdo->prepare(
        'DELETE FROM PORTAIL_CLUB_session_student_comments WHERE session_id = ? AND student_id = ?'
    );

    foreach ($items as $item) {
        if (!is_array($item)) {
            portailClubJsonFail('Format commentaire invalide.');
        }
        $studentId = portailClubIntParam($item['student_id'] ?? null, 'student_id');
        if (!in_array($studentId, $studentIds, true)) {
            portailClubJsonFail('Élève hors formation.');
        }
        $comment = trim((string)($item['comment'] ?? ''));
        if ($comment === '') {
            $stDel->execute([$sessionId, $studentId]);
            continue;
        }
        if (mb_strlen($comment) > 2000) {
            portailClubJsonFail('Commentaire trop long (2000 caractères max).');
        }
        $instructor = portailClubTrimName($item['instructor_name'] ?? '', 'Prénom moniteur');
        $st->execute([$sessionId, $studentId, $instructor, $comment]);
        portailClubTouchInstructor($pdo, $instructor);
    }
}

function portailClubInsertSessionEvaluations(PDO $pdo, int $sessionId, array $items, array $studentIds, array $skillIds): void
{
    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_session_evaluations
            (session_id, student_id, skill_id, instructor_name, eval_level)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            instructor_name = VALUES(instructor_name),
            eval_level = VALUES(eval_level),
            updated_at = NOW()'
    );

    foreach ($items as $item) {
        if (!is_array($item)) {
            portailClubJsonFail('Format évaluation invalide.');
        }
        $studentId = portailClubIntParam($item['student_id'] ?? null, 'student_id');
        $skillId = portailClubIntParam($item['skill_id'] ?? null, 'skill_id');
        if (!in_array($studentId, $studentIds, true) || !in_array($skillId, $skillIds, true)) {
            portailClubJsonFail('Élève ou compétence hors formation.');
        }
        $instructor = portailClubTrimName($item['instructor_name'] ?? '', 'Prénom moniteur');
        $level = portailClubNormalizeEvalLevel($item['eval_level'] ?? 'na');
        $st->execute([$sessionId, $studentId, $skillId, $instructor, $level]);
        portailClubTouchInstructor($pdo, $instructor);
    }
}

function portailClubCreateSessionWithEvaluations(PDO $pdo, int $formationId, array $body): array
{
    $row = portailClubFetchFormationRow($pdo, $formationId);
    if ($row === null) {
        portailClubJsonFail('Formation introuvable.', 404);
    }
    if ($row['status'] !== 'in_progress') {
        portailClubJsonFail('Formation archivée : séance impossible.');
    }

    $items = $body['evaluations'] ?? null;
    if (!is_array($items) || $items === []) {
        portailClubJsonFail('Évaluations requises.');
    }

    $detail = portailClubGetFormationDetail($pdo, $formationId);
    $studentIds = array_column($detail['students'], 'id');
    $skillIds = array_column($detail['skills'], 'id');

    $heldAt = trim((string)($body['held_at'] ?? ''));
    if ($heldAt === '') {
        $heldAt = date('Y-m-d H:i:s');
    }
    $timeSlot = portailClubNormalizeTimeSlot($body['time_slot'] ?? 'morning');

    $pdo->beginTransaction();
    try {
        $stLock = $pdo->prepare(
            'SELECT id FROM PORTAIL_CLUB_formations WHERE id = ? FOR UPDATE'
        );
        $stLock->execute([$formationId]);

        $nextNum = portailClubNextSessionNumber($pdo, $formationId);

        $st = $pdo->prepare(
            'INSERT INTO PORTAIL_CLUB_formation_sessions (formation_id, session_number, held_at, time_slot)
             VALUES (?, ?, ?, ?)'
        );
        $st->execute([$formationId, $nextNum, $heldAt, $timeSlot]);
        $sessionId = (int)$pdo->lastInsertId();

        portailClubInsertSessionEvaluations($pdo, $sessionId, $items, $studentIds, $skillIds);
        portailClubUpsertSessionStudentComments(
            $pdo,
            $sessionId,
            $body['comments'] ?? [],
            $studentIds
        );
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    return portailClubGetSessionDetail($pdo, $sessionId);
}

function portailClubCreateCatchupSessions(PDO $pdo, int $formationId, array $body): array
{
    $row = portailClubFetchFormationRow($pdo, $formationId);
    if ($row === null) {
        portailClubJsonFail('Formation introuvable.', 404);
    }
    if ($row['status'] !== 'in_progress') {
        portailClubJsonFail('Formation archivée : séance impossible.');
    }

    $count = isset($body['session_count']) ? (int)$body['session_count'] : 0;
    if ($count < 2 || $count > 6) {
        portailClubJsonFail('Nombre de séances : entre 2 et 6.');
    }

    $items = $body['evaluations'] ?? null;
    if (!is_array($items) || $items === []) {
        portailClubJsonFail('Évaluations requises.');
    }

    $sessionsMeta = $body['sessions'] ?? null;
    if (!is_array($sessionsMeta) || count($sessionsMeta) !== $count) {
        portailClubJsonFail('Dates de séances invalides.');
    }

    $detail = portailClubGetFormationDetail($pdo, $formationId);
    $studentIds = array_column($detail['students'], 'id');
    $skillIds = array_column($detail['skills'], 'id');

    $normalized = [];
    foreach ($sessionsMeta as $meta) {
        if (!is_array($meta)) {
            portailClubJsonFail('Format date de séance invalide.');
        }
        $heldAt = trim((string)($meta['held_at'] ?? ''));
        if ($heldAt === '') {
            portailClubJsonFail('Date de séance requise.');
        }
        $normalized[] = [
            'held_at' => $heldAt,
            'time_slot' => portailClubNormalizeTimeSlot($meta['time_slot'] ?? 'morning'),
        ];
    }

    usort(
        $normalized,
        static fn(array $a, array $b): int => strcmp($a['held_at'], $b['held_at'])
    );

    $batchId = portailClubGenerateUuid();
    $userComments = is_array($body['comments'] ?? null) ? $body['comments'] : [];

    $pdo->beginTransaction();
    try {
        $stLock = $pdo->prepare(
            'SELECT id FROM PORTAIL_CLUB_formations WHERE id = ? FOR UPDATE'
        );
        $stLock->execute([$formationId]);

        portailClubNextSessionNumber($pdo, $formationId);

        $sessionIds = [];
        $catchupTempBase = 20000;
        $st = $pdo->prepare(
            'INSERT INTO PORTAIL_CLUB_formation_sessions
                (formation_id, session_number, held_at, time_slot, catchup_batch_id)
             VALUES (?, ?, ?, ?, ?)'
        );
        foreach ($normalized as $i => $meta) {
            $st->execute([
                $formationId,
                $catchupTempBase + $i,
                $meta['held_at'],
                $meta['time_slot'],
                $batchId,
            ]);
            $sessionIds[] = (int)$pdo->lastInsertId();
        }

        foreach ($sessionIds as $sessionId) {
            portailClubInsertSessionEvaluations($pdo, $sessionId, $items, $studentIds, $skillIds);
        }

        $lastSessionId = $sessionIds[count($sessionIds) - 1];
        portailClubUpsertSessionStudentComments($pdo, $lastSessionId, $userComments, $studentIds);

        portailClubCompactFormationSessionNumbers($pdo, $formationId);

        $stClearBatch = $pdo->prepare(
            'UPDATE PORTAIL_CLUB_formation_sessions SET catchup_batch_id = NULL WHERE catchup_batch_id = ?'
        );
        $stClearBatch->execute([$batchId]);

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    $created = [];
    foreach ($sessionIds as $sessionId) {
        $created[] = portailClubGetSessionDetail($pdo, $sessionId);
    }

    return [
        'session_count' => count($created),
        'sessions' => $created,
    ];
}

function portailClubSaveSessionEvaluations(PDO $pdo, int $sessionId, array $body): array
{
    $session = portailClubGetSessionDetail($pdo, $sessionId);
    if ($session['formation_status'] !== 'in_progress') {
        portailClubJsonFail('Formation archivée : évaluation impossible.');
    }

    $items = $body['evaluations'] ?? null;
    if (!is_array($items) || $items === []) {
        portailClubJsonFail('Évaluations requises.');
    }

    $studentIds = array_column($session['students'], 'id');
    $skillIds = array_column($session['skills'], 'id');

    $pdo->beginTransaction();
    try {
        portailClubInsertSessionEvaluations($pdo, $sessionId, $items, $studentIds, $skillIds);
        portailClubUpsertSessionStudentComments(
            $pdo,
            $sessionId,
            $body['comments'] ?? [],
            $studentIds
        );
        portailClubApplySessionMeta($pdo, $sessionId, $body);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    return portailClubGetSessionDetail($pdo, $sessionId);
}

function portailClubDeleteSession(PDO $pdo, int $sessionId): array
{
    $session = portailClubGetSessionDetail($pdo, $sessionId);
    if ($session['formation_status'] !== 'in_progress') {
        portailClubJsonFail('Formation archivée : suppression impossible.');
    }

    $formationId = (int)$session['formation_id'];

    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare('DELETE FROM PORTAIL_CLUB_formation_sessions WHERE id = ?');
        $st->execute([$sessionId]);
        if ($st->rowCount() === 0) {
            portailClubJsonFail('Séance introuvable.', 404);
        }
        portailClubCompactFormationSessionNumbers($pdo, $formationId);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    return portailClubGetFormationDetail($pdo, $formationId);
}

/** Synthèse compétence : vert si ≥1 maîtrisé, sinon orange si ≥1 en cours, sinon rouge, sinon gris. */
function portailClubAggregateSkillEvalLevel(array $sessionLevels): string
{
    $hasMastered = false;
    $hasAcquiring = false;
    $hasNotMastered = false;

    foreach ($sessionLevels as $level) {
        switch ($level) {
            case 'mastered':
                $hasMastered = true;
                break;
            case 'acquiring':
                $hasAcquiring = true;
                break;
            case 'not_mastered':
                $hasNotMastered = true;
                break;
            default:
                break;
        }
    }

    if ($hasMastered) {
        return 'mastered';
    }
    if ($hasAcquiring) {
        return 'acquiring';
    }
    if ($hasNotMastered) {
        return 'not_mastered';
    }

    return 'na';
}

function portailClubGetFormationSkillStatus(PDO $pdo, int $formationId): array
{
    $formation = portailClubGetFormationDetail($pdo, $formationId);

    $sessionsOut = $formation['sessions'];
    usort(
        $sessionsOut,
        static fn(array $a, array $b): int => $a['session_number'] <=> $b['session_number']
    );

    $st = $pdo->prepare(
        'SELECT se.student_id, se.skill_id, se.eval_level, se.instructor_name,
                fs.session_number, fs.held_at, fs.time_slot, fs.catchup_batch_id, fs.created_at,
                se.updated_at
         FROM PORTAIL_CLUB_session_evaluations se
         JOIN PORTAIL_CLUB_formation_sessions fs ON fs.id = se.session_id
         WHERE fs.formation_id = ?
         ORDER BY fs.session_number ASC, se.updated_at DESC'
    );
    $st->execute([$formationId]);

    $bySession = [];
    while ($row = $st->fetch()) {
        $studentId = (int)$row['student_id'];
        $skillId = (int)$row['skill_id'];
        $sessionNum = (int)$row['session_number'];
        $sessionKey = $studentId . ':' . $skillId . ':' . $sessionNum;
        if (!isset($bySession[$sessionKey])) {
            $bySession[$sessionKey] = [
                'eval_level' => $row['eval_level'],
                'instructor_name' => $row['instructor_name'],
                'session_number' => $sessionNum,
                'held_at' => $row['held_at'],
                'time_slot' => $row['time_slot'] ?? 'morning',
                'catchup_batch_id' => $row['catchup_batch_id'] ?? null,
                'catchup_declared_at' => $row['created_at'] ?? null,
            ];
        }
    }

    $catchupMetaCache = [];

    $buildSkillStatus = static function (array $student, array $skill) use ($sessionsOut, $bySession, &$catchupMetaCache, $pdo): array {
        $sessionHistory = [];
        $sessionLevels = [];
        foreach ($sessionsOut as $sess) {
            $sessionKey = $student['id'] . ':' . $skill['id'] . ':' . $sess['session_number'];
            $sessEv = $bySession[$sessionKey] ?? null;
            $level = $sessEv['eval_level'] ?? 'na';
            $sessionLevels[] = $level;
            $batchId = $sessEv['catchup_batch_id'] ?? $sess['catchup_batch_id'] ?? null;
            $batchSize = null;
            $declaredAt = $sessEv['catchup_declared_at'] ?? null;
            if ($batchId) {
                if (!isset($catchupMetaCache[$batchId])) {
                    $catchupMetaCache[$batchId] = portailClubFetchCatchupBatchMeta($pdo, $batchId);
                }
                $batchSize = $catchupMetaCache[$batchId]['batch_size'];
                $declaredAt = $catchupMetaCache[$batchId]['declared_at'];
            }
            $sessionHistory[] = [
                'session_number' => (int)$sess['session_number'],
                'held_at' => $sess['held_at'],
                'time_slot' => $sess['time_slot'] ?? 'morning',
                'time_slot_label' => portailClubTimeSlotLabel($sess['time_slot'] ?? 'morning'),
                'eval_level' => $level,
                'instructor_name' => $sessEv['instructor_name'] ?? null,
                'catchup_batch_id' => $batchId,
                'catchup_batch_size' => $batchSize,
                'catchup_declared_at' => $declaredAt,
            ];
        }

        return [
            'skill_id' => $skill['id'],
            'code' => $skill['code'],
            'name' => $skill['name'],
            'level_id' => (int)($skill['level_id'] ?? 0),
            'org_code' => $skill['org_code'] ?? null,
            'eval_level' => portailClubAggregateSkillEvalLevel($sessionLevels),
            'sessions' => $sessionHistory,
        ];
    };

    $studentsOut = [];
    foreach ($formation['students'] as $student) {
        $skillsOut = [];
        $curriculaOut = [];
        foreach ($formation['skill_groups'] ?? portailClubGroupSkillsByLevel($formation['skills']) as $group) {
            $groupSkillsOut = [];
            foreach ($group['skills'] as $skill) {
                $status = $buildSkillStatus($student, $skill);
                $groupSkillsOut[] = $status;
                $skillsOut[] = $status;
            }
            $curriculaOut[] = [
                'level_id' => (int)$group['level_id'],
                'level_code' => $group['level_code'] ?? '',
                'level_name' => $group['level_name'] ?? '',
                'org_code' => $group['org_code'] ?? '',
                'skills' => $groupSkillsOut,
            ];
        }
        $studentsOut[] = [
            'id' => $student['id'],
            'first_name' => $student['first_name'],
            'last_name' => $student['last_name'],
            'skills' => $skillsOut,
            'curricula' => $curriculaOut,
        ];
    }

    return [
        'formation_id' => $formationId,
        'label' => $formation['label'],
        'org_code' => $formation['org_code'],
        'level_name' => $formation['level_name'],
        'levels' => $formation['levels'] ?? [],
        'is_dual' => (bool)($formation['is_dual'] ?? false),
        'curriculum_label' => $formation['curriculum_label'] ?? null,
        'session_count' => count($sessionsOut),
        'sessions' => $sessionsOut,
        'students' => $studentsOut,
        'skills' => $formation['skills'],
        'skill_groups' => $formation['skill_groups'] ?? portailClubGroupSkillsByLevel($formation['skills']),
    ];
}

function portailClubListRecentInstructors(PDO $pdo, int $limit = 12): array
{
    $limit = max(1, min(30, $limit));
    $st = $pdo->query(
        "SELECT first_name, last_used_at
         FROM PORTAIL_CLUB_recent_instructors
         ORDER BY last_used_at DESC
         LIMIT {$limit}"
    );
    $rows = [];
    while ($row = $st->fetch()) {
        $rows[] = [
            'first_name' => $row['first_name'],
            'last_used_at' => $row['last_used_at'],
        ];
    }
    return $rows;
}

function portailClubSkillOrgPrefix(string $orgCode): string
{
    return match (strtoupper(trim($orgCode))) {
        'FFESSM' => 'FF',
        'PADI' => 'PA',
        'SSI' => 'SI',
        'ANMP' => 'AN',
        default => strtoupper(substr(preg_replace('/[^A-Z]/', '', strtoupper($orgCode)) ?? 'XX', 0, 2)) ?: 'XX',
    };
}

function portailClubSkillLevelPrefix(string $orgCode, string $levelCode): string
{
    return portailClubSkillOrgPrefix($orgCode) . strtoupper(trim($levelCode));
}

function portailClubNormalizeSkillAbbr(string $abbr): string
{
    $s = portailClubStripAccents(strtoupper(trim($abbr)));
    $s = preg_replace('/[^A-Z0-9]/', '', $s) ?? '';
    return substr($s, 0, 8);
}

function portailClubIsNormalizedSkillCode(string $code): bool
{
    return (bool)preg_match('/^[A-Z]{2}[A-Z0-9]{1,10}-\d{2}-[A-Z0-9]{2,8}$/', strtoupper(trim($code)));
}

function portailClubBuildSkillCode(string $levelPrefix, int $seq, string $abbr): string
{
    $levelPrefix = strtoupper(trim($levelPrefix));
    $abbr = portailClubNormalizeSkillAbbr($abbr);
    $seq = max(1, min(99, $seq));
    if ($levelPrefix === '' || $abbr === '') {
        throw new InvalidArgumentException('Préfixe ou abréviation skill invalide.');
    }
    $code = sprintf('%s-%02d-%s', $levelPrefix, $seq, $abbr);
    if (!portailClubIsNormalizedSkillCode($code)) {
        throw new InvalidArgumentException('Code skill invalide : ' . $code);
    }
    return $code;
}

function portailClubParseSkillAbbr(string $code): string
{
    if (preg_match('/^[A-Z]{2}[A-Z0-9]{1,10}-\d{2}-([A-Z0-9]{2,8})$/', strtoupper(trim($code)), $m)) {
        return $m[1];
    }
    return '';
}

function portailClubParseSkillSeq(string $code): ?int
{
    if (preg_match('/^[A-Z]{2}[A-Z0-9]{1,10}-(\d{2})-[A-Z0-9]{2,8}$/', strtoupper(trim($code)), $m)) {
        return (int)$m[1];
    }
    return null;
}

function portailClubNextSkillSeq(PDO $pdo, int $levelId): int
{
    $st = $pdo->prepare(
        'SELECT code, sort_order FROM PORTAIL_CLUB_catalog_skills WHERE level_id = ?'
    );
    $st->execute([$levelId]);
    $maxSeq = 0;
    $maxSort = 0;
    while ($row = $st->fetch()) {
        $maxSort = max($maxSort, (int)$row['sort_order']);
        $seq = portailClubParseSkillSeq((string)$row['code']);
        if ($seq !== null) {
            $maxSeq = max($maxSeq, $seq);
        }
    }
    return max($maxSeq, $maxSort) + 1;
}

function portailClubOfficialSkillMaxSeq(string $orgCode, string $levelCode): int
{
    static $map = [
        'FFESSM' => ['PE12' => 3, 'N1' => 18, 'N2' => 12, 'N3' => 9],
        'PADI' => ['OW' => 12, 'AOW' => 5, 'RESCUE' => 8],
        'SSI' => ['OWD' => 12, 'AOWD' => 5, 'STRESS' => 8],
        'ANMP' => ['INIT' => 4, 'NIV1' => 12, 'NIV2' => 8],
    ];
    $org = strtoupper(trim($orgCode));
    $lvl = strtoupper(trim($levelCode));
    return $map[$org][$lvl] ?? 99;
}

function portailClubStripSkillNamePrefix(string $name): string
{
    $name = trim($name);
    if (preg_match('/^([^—–\-\/]+?)\s*[—–\-]\s*(.+)$/u', $name, $m)) {
        $prefix = trim($m[1]);
        // Ne retirer que les préfixes type abréviation (VDM, LRE), pas « Panne d'air ».
        if (preg_match('/^[A-Za-z]{2,8}$/', $prefix)) {
            return trim($m[2]);
        }
    }
    return $name;
}

function portailClubLegacySkillSlugAbbr(string $code): ?string
{
    static $map = [
        'mask_clear' => 'msk',
        'buoyancy' => 'buo',
        'vdm' => 'vdm',
        'lre' => 'lre',
        'equipement' => 'mat',
        'equipment' => 'equ',
        'equilibrage' => 'btv',
        'flottabilite' => 'flt',
        'panne_air_relais' => 'aas',
        'communication' => 'com',
        'propulsion' => 'prp',
        'immersion' => 'imm',
        'mise_eau' => 'mee',
        'palanquee' => 'pal',
        'remontee' => 'rmt',
        'securite' => 'sec',
        'binome_check' => 'chk',
        'regulator_recovery' => 'lre',
        'navigation' => 'nav',
        'deep_dive' => 'navb',
    ];
    $slug = strtolower(preg_replace('/^custom_/', '', trim($code)) ?? '');
    return $map[$slug] ?? null;
}

/** @param array<string, mixed> $skill */
function portailClubEnrichSkillRow(array $skill, string $orgCode, string $levelCode): array
{
    $code = (string)($skill['code'] ?? '');
    $abbr = portailClubParseSkillAbbr($code);
    $seq = portailClubParseSkillSeq($code);
    $isCustom = str_starts_with($code, 'custom_');
    if (!$isCustom && $seq !== null) {
        $isCustom = $seq > portailClubOfficialSkillMaxSeq($orgCode, $levelCode);
    }
    return array_merge($skill, [
        'abbr' => $abbr !== '' ? $abbr : null,
        'seq' => $seq,
        'is_custom' => $isCustom,
    ]);
}

function portailClubSlugifySkillCode(string $text): string
{
    $s = strtolower(trim($text));
    $s = preg_replace('/[^a-z0-9]+/', '_', $s) ?? '';
    $s = trim($s, '_');
    return $s !== '' ? $s : 'skill';
}

function portailClubStripAccents(string $text): string
{
    if (function_exists('iconv')) {
        $trans = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
        if ($trans !== false) {
            return $trans;
        }
    }
    return strtr($text, [
        'à' => 'a', 'â' => 'a', 'ä' => 'a', 'á' => 'a', 'ã' => 'a',
        'ç' => 'c',
        'è' => 'e', 'é' => 'e', 'ê' => 'e', 'ë' => 'e',
        'ì' => 'i', 'í' => 'i', 'î' => 'i', 'ï' => 'i',
        'ò' => 'o', 'ó' => 'o', 'ô' => 'o', 'ö' => 'o', 'õ' => 'o',
        'ù' => 'u', 'ú' => 'u', 'û' => 'u', 'ü' => 'u',
        'ý' => 'y', 'ÿ' => 'y', 'ñ' => 'n',
        'œ' => 'oe', 'æ' => 'ae',
    ]);
}

function portailClubNormalizeSkillLabel(string $name): string
{
    $name = mb_strtolower(trim($name), 'UTF-8');
    $name = portailClubStripAccents($name);
    $name = preg_replace('/\s+/', ' ', $name) ?? $name;
    return trim($name);
}

function portailClubSkillAbbrevKey(string $name): ?string
{
    if (!preg_match('/^([^—–\-\/]+)/u', trim($name), $m)) {
        return null;
    }
    $part = trim($m[1]);
    if ($part === '') {
        return null;
    }
    $part = str_replace(['++', '+'], ['_pp', '_plus'], $part);
    $slug = portailClubSlugifySkillCode($part);
    return ($slug !== '' && $slug !== 'skill') ? $slug : null;
}

/** @return list<string> */
function portailClubSkillDuplicateKeys(string $name, string $code): array
{
    $keys = ['name:' . portailClubNormalizeSkillLabel($name)];
    $abbr = portailClubSkillAbbrevKey($name);
    if ($abbr !== null) {
        $keys[] = 'abbr:' . $abbr;
    }
    $parsedAbbr = portailClubParseSkillAbbr($code);
    if ($parsedAbbr !== '') {
        $keys[] = 'abbr:' . strtolower($parsedAbbr);
    }
    $legacyAbbr = portailClubLegacySkillSlugAbbr($code);
    if ($legacyAbbr !== null) {
        $keys[] = 'abbr:' . $legacyAbbr;
    }
    $codeKey = preg_replace('/^custom_/', '', $code) ?? $code;
    if ($codeKey !== '') {
        $keys[] = 'code:' . $codeKey;
    }
    return array_values(array_unique($keys));
}

function portailClubCodesOverlap(string $codeA, string $codeB): bool
{
    if ($codeA === $codeB) {
        return true;
    }
    return str_starts_with($codeA, $codeB . '_') || str_starts_with($codeB, $codeA . '_');
}

function portailClubSkillsAreDuplicates(array $skillA, array $skillB): bool
{
    if ((int)$skillA['id'] === (int)$skillB['id']) {
        return false;
    }
    $keysA = portailClubSkillDuplicateKeys($skillA['name'], $skillA['code']);
    $keysB = portailClubSkillDuplicateKeys($skillB['name'], $skillB['code']);
    foreach ($keysA as $ka) {
        if (in_array($ka, $keysB, true)) {
            return true;
        }
    }
    $codeA = preg_replace('/^custom_/', '', $skillA['code']) ?? $skillA['code'];
    $codeB = preg_replace('/^custom_/', '', $skillB['code']) ?? $skillB['code'];
    return portailClubCodesOverlap($codeA, $codeB);
}

function portailClubFindDuplicateSkillForLevel(
    PDO $pdo,
    int $levelId,
    string $name,
    string $code,
    ?int $excludeSkillId = null
): ?array {
    $st = $pdo->prepare(
        'SELECT id, code, name, sort_order FROM PORTAIL_CLUB_catalog_skills WHERE level_id = ?'
    );
    $st->execute([$levelId]);
    $candidate = ['id' => 0, 'code' => $code, 'name' => $name, 'sort_order' => 0];
    while ($row = $st->fetch()) {
        $id = (int)$row['id'];
        if ($excludeSkillId !== null && $id === $excludeSkillId) {
            continue;
        }
        $existing = [
            'id' => $id,
            'code' => $row['code'],
            'name' => $row['name'],
            'sort_order' => (int)$row['sort_order'],
        ];
        if (portailClubSkillsAreDuplicates($candidate, $existing)) {
            return $existing;
        }
    }
    return null;
}

/** @param list<array{id:int,code:string,name:string,sort_order:int,is_custom?:bool}> $skills */
function portailClubMarkSkillDuplicates(array $skills): array
{
    $dupIds = [];
    for ($i = 0; $i < count($skills); $i++) {
        for ($j = $i + 1; $j < count($skills); $j++) {
            if (portailClubSkillsAreDuplicates($skills[$i], $skills[$j])) {
                $dupIds[(int)$skills[$i]['id']] = true;
                $dupIds[(int)$skills[$j]['id']] = true;
            }
        }
    }
    foreach ($skills as &$sk) {
        $sk['is_duplicate'] = isset($dupIds[(int)$sk['id']]);
    }
    unset($sk);
    return $skills;
}

function portailClubMergeCatalogSkillInto(PDO $pdo, int $keeperId, int $duplicateId): void
{
    if ($keeperId === $duplicateId) {
        return;
    }

    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare(
            'SELECT id, session_id, student_id FROM PORTAIL_CLUB_session_evaluations WHERE skill_id = ?'
        );
        $st->execute([$duplicateId]);
        $stExist = $pdo->prepare(
            'SELECT id FROM PORTAIL_CLUB_session_evaluations
             WHERE session_id = ? AND student_id = ? AND skill_id = ?'
        );
        $stMove = $pdo->prepare('UPDATE PORTAIL_CLUB_session_evaluations SET skill_id = ? WHERE id = ?');
        $stDrop = $pdo->prepare('DELETE FROM PORTAIL_CLUB_session_evaluations WHERE id = ?');

        while ($eval = $st->fetch()) {
            $stExist->execute([$eval['session_id'], $eval['student_id'], $keeperId]);
            if ($stExist->fetch()) {
                $stDrop->execute([$eval['id']]);
            } else {
                $stMove->execute([$keeperId, $eval['id']]);
            }
        }

        $pdo->prepare('DELETE FROM PORTAIL_CLUB_catalog_skills WHERE id = ?')->execute([$duplicateId]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

function portailClubDedupeLevelSkills(PDO $pdo, int $levelId): array
{
    $st = $pdo->prepare(
        'SELECT id, code, name, sort_order FROM PORTAIL_CLUB_catalog_skills
         WHERE level_id = ? ORDER BY sort_order, id'
    );
    $st->execute([$levelId]);
    $skills = [];
    while ($row = $st->fetch()) {
        $skills[] = [
            'id' => (int)$row['id'],
            'code' => $row['code'],
            'name' => $row['name'],
            'sort_order' => (int)$row['sort_order'],
        ];
    }

    $keepers = [];
    $merged = 0;
    foreach ($skills as $sk) {
        $keeper = null;
        foreach ($keepers as $k) {
            if (portailClubSkillsAreDuplicates($sk, $k)) {
                $keeper = $k;
                break;
            }
        }
        if ($keeper === null) {
            $keepers[] = $sk;
            continue;
        }
        $keeperNorm = portailClubIsNormalizedSkillCode((string)$keeper['code']);
        $skillNorm = portailClubIsNormalizedSkillCode((string)$sk['code']);
        if ($skillNorm && !$keeperNorm) {
            portailClubMergeCatalogSkillInto($pdo, (int)$sk['id'], (int)$keeper['id']);
            foreach ($keepers as $ki => $k) {
                if ((int)$k['id'] === (int)$keeper['id']) {
                    $keepers[$ki] = $sk;
                    break;
                }
            }
        } else {
            portailClubMergeCatalogSkillInto($pdo, (int)$keeper['id'], (int)$sk['id']);
        }
        $merged++;
    }

    return ['merged' => $merged, 'remaining' => count($keepers)];
}

function portailClubDedupeCatalogSkills(PDO $pdo, ?int $levelId = null): array
{
    if ($levelId !== null) {
        return ['levels' => 1, 'merged' => portailClubDedupeLevelSkills($pdo, $levelId)['merged']];
    }

    $st = $pdo->query('SELECT id FROM PORTAIL_CLUB_catalog_levels ORDER BY id');
    $totalMerged = 0;
    $levels = 0;
    while ($row = $st->fetch()) {
        $result = portailClubDedupeLevelSkills($pdo, (int)$row['id']);
        if ($result['merged'] > 0) {
            $levels++;
            $totalMerged += $result['merged'];
        }
    }
    return ['levels' => $levels, 'merged' => $totalMerged];
}

function portailClubListLevelSkills(PDO $pdo, int $levelId): array
{
    $stLevel = $pdo->prepare(
        'SELECT l.id, l.code AS level_code, l.name AS level_name, o.code AS org_code, o.name AS org_name
         FROM PORTAIL_CLUB_catalog_levels l
         JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
         WHERE l.id = ?'
    );
    $stLevel->execute([$levelId]);
    $level = $stLevel->fetch();
    if (!$level) {
        portailClubJsonFail('Niveau introuvable.', 404);
    }

    $st = $pdo->prepare(
        'SELECT id, code, name, sort_order
         FROM PORTAIL_CLUB_catalog_skills
         WHERE level_id = ?
         ORDER BY sort_order, id'
    );
    $st->execute([$levelId]);
    $skills = [];
    while ($row = $st->fetch()) {
        $skills[] = portailClubEnrichSkillRow(
            [
                'id' => (int)$row['id'],
                'code' => $row['code'],
                'name' => $row['name'],
                'sort_order' => (int)$row['sort_order'],
            ],
            (string)$level['org_code'],
            (string)$level['level_code']
        );
    }
    $skills = portailClubMarkSkillDuplicates($skills);
    usort($skills, static function (array $a, array $b): int {
        $cmp = $a['sort_order'] <=> $b['sort_order'];
        return $cmp !== 0 ? $cmp : $a['id'] <=> $b['id'];
    });
    $duplicateCount = count(array_filter($skills, static fn(array $s): bool => !empty($s['is_duplicate'])));
    $levelPrefix = portailClubSkillLevelPrefix((string)$level['org_code'], (string)$level['level_code']);
    $nextSeq = portailClubNextSkillSeq($pdo, $levelId);

    return [
        'level' => [
            'id' => (int)$level['id'],
            'code' => $level['level_code'],
            'name' => $level['level_name'],
            'org_code' => $level['org_code'],
            'org_name' => $level['org_name'],
            'level_prefix' => $levelPrefix,
            'next_seq' => $nextSeq,
            'code_prefix' => sprintf('%s-%02d-', $levelPrefix, $nextSeq),
        ],
        'skills' => $skills,
        'duplicate_count' => $duplicateCount,
    ];
}

/** Réordonne les compétences d'un niveau (ordre d'affichage en séance). */
function portailClubReorderLevelSkills(PDO $pdo, int $levelId, array $orderedIds): array
{
    $stLevel = $pdo->prepare('SELECT id FROM PORTAIL_CLUB_catalog_levels WHERE id = ?');
    $stLevel->execute([$levelId]);
    if (!$stLevel->fetch()) {
        portailClubJsonFail('Niveau introuvable.', 404);
    }

    $st = $pdo->prepare('SELECT id FROM PORTAIL_CLUB_catalog_skills WHERE level_id = ? ORDER BY sort_order, id');
    $st->execute([$levelId]);
    $existingIds = array_map(static fn(array $row): int => (int)$row['id'], $st->fetchAll());

    $orderedIds = array_values(array_unique(array_map(static fn($id): int => (int)$id, $orderedIds)));
    if ($orderedIds === [] || count($orderedIds) !== count($existingIds)) {
        portailClubJsonFail('Liste de compétences incomplète ou invalide.');
    }

    sort($existingIds);
    $check = $orderedIds;
    sort($check);
    if ($check !== $existingIds) {
        portailClubJsonFail('Liste de compétences invalide pour ce niveau.');
    }

    $pdo->beginTransaction();
    try {
        $up = $pdo->prepare(
            'UPDATE PORTAIL_CLUB_catalog_skills SET sort_order = ? WHERE id = ? AND level_id = ?'
        );
        foreach ($orderedIds as $index => $skillId) {
            $up->execute([$index + 1, $skillId, $levelId]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    return portailClubListLevelSkills($pdo, $levelId);
}

function portailClubUpdateCatalogSkill(PDO $pdo, int $skillId, array $body): array
{
    $st = $pdo->prepare(
        'SELECT id, level_id, code, name, sort_order FROM PORTAIL_CLUB_catalog_skills WHERE id = ?'
    );
    $st->execute([$skillId]);
    $row = $st->fetch();
    if (!$row) {
        portailClubJsonFail('Compétence introuvable.', 404);
    }

    $name = array_key_exists('name', $body)
        ? portailClubStripSkillNamePrefix(trim((string)$body['name']))
        : $row['name'];
    if ($name === '' || mb_strlen($name) > 160) {
        portailClubJsonFail('Libellé invalide.');
    }

    $sortOrder = array_key_exists('sort_order', $body)
        ? max(0, (int)$body['sort_order'])
        : (int)$row['sort_order'];

    $dup = portailClubFindDuplicateSkillForLevel(
        $pdo,
        (int)$row['level_id'],
        $name,
        $row['code'],
        $skillId
    );
    if ($dup !== null) {
        portailClubJsonFail('Doublon : une compétence similaire existe déjà (« ' . $dup['name'] . ' »).');
    }

    $up = $pdo->prepare(
        'UPDATE PORTAIL_CLUB_catalog_skills SET name = ?, sort_order = ? WHERE id = ?'
    );
    $up->execute([$name, $sortOrder, $skillId]);

    return [
        'id' => $skillId,
        'level_id' => (int)$row['level_id'],
        'code' => $row['code'],
        'name' => $name,
        'sort_order' => $sortOrder,
        'is_custom' => str_starts_with($row['code'], 'custom_'),
    ];
}

function portailClubDeleteCatalogSkill(PDO $pdo, int $skillId): void
{
    $st = $pdo->prepare('SELECT id, level_id, name FROM PORTAIL_CLUB_catalog_skills WHERE id = ?');
    $st->execute([$skillId]);
    $row = $st->fetch();
    if (!$row) {
        portailClubJsonFail('Compétence introuvable.', 404);
    }

    $pdo->beginTransaction();
    try {
        // Retire du modèle niveau : les évaluations passées de cette compétence sont supprimées,
        // les séances et formations restent inchangées.
        $delEval = $pdo->prepare('DELETE FROM PORTAIL_CLUB_session_evaluations WHERE skill_id = ?');
        $delEval->execute([$skillId]);

        $del = $pdo->prepare('DELETE FROM PORTAIL_CLUB_catalog_skills WHERE id = ?');
        $del->execute([$skillId]);

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

function portailClubAddCatalogSkill(PDO $pdo, int $levelId, string $name, ?string $abbr = null): array
{
    $name = portailClubStripSkillNamePrefix(trim($name));
    if ($name === '' || mb_strlen($name) > 160) {
        portailClubJsonFail('Libellé compétence invalide.');
    }

    $stLevel = $pdo->prepare(
        'SELECT l.id, l.code AS level_code, o.code AS org_code
         FROM PORTAIL_CLUB_catalog_levels l
         JOIN PORTAIL_CLUB_catalog_orgs o ON o.id = l.org_id
         WHERE l.id = ?'
    );
    $stLevel->execute([$levelId]);
    $level = $stLevel->fetch();
    if (!$level) {
        portailClubJsonFail('Niveau catalogue introuvable.', 404);
    }

    $levelPrefix = portailClubSkillLevelPrefix((string)$level['org_code'], (string)$level['level_code']);
    $nextSeq = portailClubNextSkillSeq($pdo, $levelId);
    $abbrRaw = $abbr !== null ? trim($abbr) : '';
    $abbrUpper = strtoupper($abbrRaw);

    if ($abbrRaw !== '' && portailClubIsNormalizedSkillCode($abbrUpper)) {
        $code = $abbrUpper;
        if (!str_starts_with($code, $levelPrefix . '-')) {
            portailClubJsonFail('Le code ne correspond pas au niveau sélectionné.');
        }
        $nextSeq = portailClubParseSkillSeq($code) ?? $nextSeq;
        $abbrRaw = portailClubParseSkillAbbr($code);
    } elseif (preg_match('/^' . preg_quote($levelPrefix, '/') . '-(\d{2})-([A-Z0-9]{2,8})$/i', $abbrUpper, $m)) {
        $nextSeq = (int)$m[1];
        $abbrRaw = $m[2];
        $code = portailClubBuildSkillCode($levelPrefix, $nextSeq, $abbrRaw);
    } else {
        $abbrRaw = portailClubNormalizeSkillAbbr($abbrRaw);
        if ($abbrRaw === '') {
            portailClubJsonFail('Abréviation requise (ex. VDM).');
        }
        $code = portailClubBuildSkillCode($levelPrefix, $nextSeq, $abbrRaw);
    }

    $stExists = $pdo->prepare(
        'SELECT id FROM PORTAIL_CLUB_catalog_skills WHERE level_id = ? AND code = ?'
    );
    $stExists->execute([$levelId, $code]);
    if ($stExists->fetch()) {
        portailClubJsonFail('Ce code compétence existe déjà pour ce niveau.');
    }

    $dup = portailClubFindDuplicateSkillForLevel($pdo, $levelId, $name, $code);
    if ($dup !== null) {
        portailClubJsonFail('Doublon : une compétence similaire existe déjà (« ' . $dup['name'] . ' »).');
    }

    $sortOrder = $nextSeq;
    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
         VALUES (?, ?, ?, ?)'
    );
    $st->execute([$levelId, $code, $name, $sortOrder]);
    $skillId = (int)$pdo->lastInsertId();

    $row = portailClubEnrichSkillRow(
        [
            'id' => $skillId,
            'level_id' => $levelId,
            'code' => $code,
            'name' => $name,
            'sort_order' => $sortOrder,
        ],
        (string)$level['org_code'],
        (string)$level['level_code']
    );

    return array_merge($row, [
        'org_code' => $level['org_code'],
        'level_code' => $level['level_code'],
    ]);
}

function portailClubImportCatalogFile(PDO $pdo, string $filePath): array
{
    $raw = file_get_contents($filePath);
    if ($raw === false) {
        throw new RuntimeException('Lecture impossible : ' . $filePath);
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new RuntimeException('JSON invalide : ' . basename($filePath));
    }

    $orgCode = strtoupper(trim((string)($data['org_code'] ?? '')));
    $orgName = trim((string)($data['org_name'] ?? $orgCode));
    if ($orgCode === '') {
        throw new RuntimeException('org_code manquant : ' . basename($filePath));
    }

    $sortOrg = (int)($data['sort_order'] ?? 0);
    $levels = $data['levels'] ?? [];
    if (!is_array($levels)) {
        throw new RuntimeException('levels invalide : ' . basename($filePath));
    }

    $stats = ['orgs' => 0, 'levels' => 0, 'skills' => 0];

    $stOrg = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_catalog_orgs (code, name, sort_order)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), sort_order = VALUES(sort_order)'
    );
    $stOrg->execute([$orgCode, $orgName, $sortOrg]);
    $stats['orgs']++;

    $stOrgId = $pdo->prepare('SELECT id FROM PORTAIL_CLUB_catalog_orgs WHERE code = ?');
    $stOrgId->execute([$orgCode]);
    $orgId = (int)$stOrgId->fetchColumn();

    $stLevel = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_catalog_levels (org_id, code, name, sort_order)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), sort_order = VALUES(sort_order)'
    );
    $stLevelId = $pdo->prepare(
        'SELECT id FROM PORTAIL_CLUB_catalog_levels WHERE org_id = ? AND code = ?'
    );
    $stSkill = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_catalog_skills (level_id, code, name, sort_order)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), sort_order = VALUES(sort_order)'
    );

    foreach ($levels as $lvl) {
        if (!is_array($lvl)) {
            continue;
        }
        $levelCode = trim((string)($lvl['code'] ?? ''));
        $levelName = trim((string)($lvl['name'] ?? $levelCode));
        if ($levelCode === '') {
            continue;
        }
        $levelSort = (int)($lvl['sort_order'] ?? 0);
        $stLevel->execute([$orgId, $levelCode, $levelName, $levelSort]);
        $stats['levels']++;

        $stLevelId->execute([$orgId, $levelCode]);
        $levelId = (int)$stLevelId->fetchColumn();

        $skills = $lvl['skills'] ?? [];
        if (!is_array($skills)) {
            continue;
        }
        $levelPrefix = portailClubSkillLevelPrefix($orgCode, $levelCode);
        foreach ($skills as $idx => $skill) {
            if (!is_array($skill)) {
                continue;
            }
            $skillCode = trim((string)($skill['code'] ?? ''));
            $skillName = portailClubStripSkillNamePrefix(trim((string)($skill['name'] ?? $skillCode)));
            $skillAbbr = trim((string)($skill['abbr'] ?? ''));
            $skillSort = (int)($skill['sort_order'] ?? $idx + 1);
            if ($skillCode === '' && $skillAbbr === '') {
                continue;
            }
            if (!portailClubIsNormalizedSkillCode($skillCode)) {
                $abbrForCode = $skillAbbr !== ''
                    ? $skillAbbr
                    : strtoupper(preg_replace('/^custom_/', '', $skillCode) ?? '');
                $abbrForCode = portailClubNormalizeSkillAbbr(str_replace('_', '', $abbrForCode));
                if ($abbrForCode === '') {
                    $abbrForCode = 'SK' . str_pad((string)$skillSort, 2, '0', STR_PAD_LEFT);
                }
                $skillCode = portailClubBuildSkillCode($levelPrefix, $skillSort, $abbrForCode);
            }
            $stSkill->execute([$levelId, $skillCode, $skillName, $skillSort]);
            $stats['skills']++;
        }
    }

    return $stats;
}
