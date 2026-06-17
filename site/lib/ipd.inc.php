<?php
declare(strict_types=1);

require_once __DIR__ . '/api.inc.php';
require_once __DIR__ . '/formations.inc.php';

const PORTAIL_CLUB_IPD_VERDICTS = ['conforme', 'a_ameliorer', 'non_conforme', 'non_applicable'];
const PORTAIL_CLUB_IPD_LEVELS = ['n2', 'n3', 'n4', 'mf1'];

function portailClubIpdNormalizeVerdict(mixed $value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    $map = [
        'conforme' => 'conforme',
        'aAmeliorer' => 'a_ameliorer',
        'a_ameliorer' => 'a_ameliorer',
        'nonConforme' => 'non_conforme',
        'non_conforme' => 'non_conforme',
        'nonApplicable' => 'non_applicable',
        'non_applicable' => 'non_applicable',
    ];
    $key = (string)$value;
    if (!isset($map[$key])) {
        portailClubJsonFail('Verdict évaluation IPD invalide.');
    }
    return $map[$key];
}

function portailClubIpdNormalizeLevel(mixed $value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    $v = strtolower(trim((string)$value));
    if (!in_array($v, PORTAIL_CLUB_IPD_LEVELS, true)) {
        portailClubJsonFail('Niveau MFT IPD invalide.');
    }
    return $v;
}

function portailClubIpdVerdictLabel(?string $verdict): string
{
    return match ($verdict) {
        'conforme' => 'Conforme',
        'a_ameliorer' => 'À améliorer',
        'non_conforme' => 'Non conforme',
        'non_applicable' => 'N/A',
        default => '—',
    };
}

function portailClubIpdLevelLabel(?string $level): string
{
    return match ($level) {
        'n2' => 'Niveau 2',
        'n3' => 'Niveau 3 / PA40',
        'n4' => 'Guide Palanquée N4',
        'mf1' => 'MF1',
        default => '—',
    };
}

function portailClubIpdParseDateTime(mixed $value, string $label): string
{
    $raw = trim((string)$value);
    if ($raw === '') {
        portailClubJsonFail("{$label} requis.");
    }
    try {
        $dt = new DateTimeImmutable($raw);
    } catch (Throwable) {
        portailClubJsonFail("{$label} invalide.");
    }
    return $dt->format('Y-m-d H:i:s');
}

function portailClubIpdOptionalPositiveInt(mixed $value): ?int
{
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_numeric($value)) {
        portailClubJsonFail('Identifiant formation invalide.');
    }
    $n = (int)$value;
    if ($n < 1) {
        portailClubJsonFail('Identifiant formation invalide.');
    }
    return $n;
}

function portailClubIpdOptionalFloat(mixed $value): ?float
{
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_numeric($value)) {
        return null;
    }
    return round((float)$value, 2);
}

function portailClubIpdOptionalUInt(mixed $value): ?int
{
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_numeric($value)) {
        return null;
    }
    $n = (int)$value;
    return $n < 0 ? null : $n;
}

function portailClubIpdValidateStudentLink(PDO $pdo, ?int $studentId): void
{
    if ($studentId === null) {
        return;
    }
    $st = $pdo->prepare('SELECT id FROM PORTAIL_CLUB_formation_students WHERE id = ?');
    $st->execute([$studentId]);
    if (!$st->fetch()) {
        portailClubJsonFail('Élève formation introuvable.', 404);
    }
}

function portailClubIpdValidateSessionLink(PDO $pdo, ?int $sessionId): void
{
    if ($sessionId === null) {
        return;
    }
    $st = $pdo->prepare('SELECT id FROM PORTAIL_CLUB_formation_sessions WHERE id = ?');
    $st->execute([$sessionId]);
    if (!$st->fetch()) {
        portailClubJsonFail('Session formation introuvable.', 404);
    }
}

/** @return array<string, mixed> */
function portailClubIpdMapEventRow(array $row): array
{
    $redescents = [];
    if (!empty($row['redescents_json'])) {
        $decoded = json_decode((string)$row['redescents_json'], true);
        if (is_array($decoded)) {
            $redescents = $decoded;
        }
    }
    $criteria = [];
    if (!empty($row['evaluation_criteria_json'])) {
        $decoded = json_decode((string)$row['evaluation_criteria_json'], true);
        if (is_array($decoded)) {
            $criteria = $decoded;
        }
    }

    return [
        'id' => (int)$row['id'],
        'session_id' => (int)$row['session_id'],
        'event_index' => (int)$row['event_index'],
        'is_manual' => (bool)$row['is_manual'],
        'stabilization_detected' => (bool)$row['stabilization_detected'],
        'start_depth_m' => $row['start_depth_m'] !== null ? (float)$row['start_depth_m'] : null,
        'duration_sec' => $row['duration_sec'] !== null ? (int)$row['duration_sec'] : null,
        'ascent_duration_sec' => $row['ascent_duration_sec'] !== null ? (int)$row['ascent_duration_sec'] : null,
        'metrics' => [
            'max_depth_m' => $row['max_depth_m'] !== null ? (float)$row['max_depth_m'] : null,
            'min_depth_m' => $row['min_depth_m'] !== null ? (float)$row['min_depth_m'] : null,
            'avg_ascent_speed_mpm' => $row['avg_ascent_speed_mpm'] !== null ? (float)$row['avg_ascent_speed_mpm'] : null,
            'max_ascent_speed_mpm' => $row['max_ascent_speed_mpm'] !== null ? (float)$row['max_ascent_speed_mpm'] : null,
            'max_speed_critical' => (bool)$row['max_speed_critical'],
            'redescents' => $redescents,
        ],
        'evaluation' => [
            'level' => $row['evaluation_level'],
            'level_label' => portailClubIpdLevelLabel($row['evaluation_level'] ?? null),
            'verdict' => $row['evaluation_verdict'],
            'verdict_label' => portailClubIpdVerdictLabel($row['evaluation_verdict'] ?? null),
            'summary' => $row['evaluation_summary'],
            'criteria' => $criteria,
        ],
        'created_at' => $row['created_at'],
    ];
}

/** @return array<string, mixed> */
function portailClubIpdMapSessionRow(array $row, bool $withEvents = false, array $events = []): array
{
    $session = [
        'id' => (int)$row['id'],
        'external_id' => $row['external_id'],
        'device_id' => $row['device_id'],
        'device_name' => $row['device_name'],
        'dive_fingerprint' => $row['dive_fingerprint'],
        'dive_number' => $row['dive_number'] !== null ? (int)$row['dive_number'] : null,
        'dive_held_at' => $row['dive_held_at'],
        'dive_max_depth_m' => $row['dive_max_depth_m'] !== null ? (float)$row['dive_max_depth_m'] : null,
        'dive_duration_sec' => $row['dive_duration_sec'] !== null ? (int)$row['dive_duration_sec'] : null,
        'formation_student_id' => $row['formation_student_id'] !== null ? (int)$row['formation_student_id'] : null,
        'formation_session_id' => $row['formation_session_id'] !== null ? (int)$row['formation_session_id'] : null,
        'instructor_name' => $row['instructor_name'],
        'source_app' => $row['source_app'],
        'notes' => $row['notes'],
        'event_count' => (int)($row['event_count'] ?? 0),
        'created_at' => $row['created_at'],
    ];
    if ($withEvents) {
        $session['events'] = $events;
    }
    return $session;
}

function portailClubIpdFetchEventsForSession(PDO $pdo, int $sessionId): array
{
    $st = $pdo->prepare(
        'SELECT * FROM PORTAIL_CLUB_ipd_events
         WHERE session_id = ?
         ORDER BY event_index ASC'
    );
    $st->execute([$sessionId]);
    $events = [];
    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $events[] = portailClubIpdMapEventRow($row);
    }
    return $events;
}

function portailClubIpdGetSession(PDO $pdo, int $id): array
{
    $st = $pdo->prepare(
        'SELECT s.*, (SELECT COUNT(*) FROM PORTAIL_CLUB_ipd_events e WHERE e.session_id = s.id) AS event_count
         FROM PORTAIL_CLUB_ipd_sessions s
         WHERE s.id = ?'
    );
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        portailClubJsonFail('Session IPD introuvable.', 404);
    }
    $events = portailClubIpdFetchEventsForSession($pdo, $id);
    return portailClubIpdMapSessionRow($row, true, $events);
}

function portailClubIpdListSessions(
    PDO $pdo,
    int $limit = 50,
    ?int $studentId = null,
    ?int $formationSessionId = null
): array {
    $limit = max(1, min(200, $limit));
    $where = [];
    $params = [];
    if ($studentId !== null) {
        $where[] = 's.formation_student_id = ?';
        $params[] = $studentId;
    }
    if ($formationSessionId !== null) {
        $where[] = 's.formation_session_id = ?';
        $params[] = $formationSessionId;
    }
    $sql = 'SELECT s.*, (SELECT COUNT(*) FROM PORTAIL_CLUB_ipd_events e WHERE e.session_id = s.id) AS event_count
            FROM PORTAIL_CLUB_ipd_sessions s';
    if ($where !== []) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }
    $sql .= ' ORDER BY s.dive_held_at DESC, s.id DESC LIMIT ' . $limit;
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $sessions = [];
    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $sessions[] = portailClubIpdMapSessionRow($row);
    }
    return $sessions;
}

/** @param array<string, mixed> $eventBody */
function portailClubIpdInsertEvent(PDO $pdo, int $sessionId, array $eventBody): void
{
    $metrics = is_array($eventBody['metrics'] ?? null) ? $eventBody['metrics'] : [];
    $evaluation = is_array($eventBody['evaluation'] ?? null) ? $eventBody['evaluation'] : [];
    $redescents = $metrics['redescents'] ?? [];
    if (!is_array($redescents)) {
        $redescents = [];
    }
    $criteria = $evaluation['criteria'] ?? [];
    if (!is_array($criteria)) {
        $criteria = [];
    }

    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_ipd_events (
            session_id, event_index, is_manual, stabilization_detected,
            start_depth_m, duration_sec, ascent_duration_sec,
            max_depth_m, min_depth_m, avg_ascent_speed_mpm, max_ascent_speed_mpm, max_speed_critical,
            redescents_json, evaluation_level, evaluation_verdict, evaluation_summary, evaluation_criteria_json
         ) VALUES (
            ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?
         )'
    );
    $st->execute([
        $sessionId,
        portailClubIntParam($eventBody['event_index'] ?? null, 'event_index', 1),
        !empty($eventBody['is_manual']) ? 1 : 0,
        !array_key_exists('stabilization_detected', $eventBody) || !empty($eventBody['stabilization_detected']) ? 1 : 0,
        portailClubIpdOptionalFloat($eventBody['start_depth_m'] ?? null),
        portailClubIpdOptionalUInt($eventBody['duration_sec'] ?? null),
        portailClubIpdOptionalUInt($eventBody['ascent_duration_sec'] ?? null),
        portailClubIpdOptionalFloat($metrics['max_depth_m'] ?? null),
        portailClubIpdOptionalFloat($metrics['min_depth_m'] ?? null),
        portailClubIpdOptionalFloat($metrics['avg_ascent_speed_mpm'] ?? null),
        portailClubIpdOptionalFloat($metrics['max_ascent_speed_mpm'] ?? null),
        !empty($metrics['max_speed_critical']) ? 1 : 0,
        $redescents === [] ? null : json_encode($redescents, JSON_UNESCAPED_UNICODE),
        portailClubIpdNormalizeLevel($evaluation['level'] ?? null),
        portailClubIpdNormalizeVerdict($evaluation['verdict'] ?? null),
        portailClubTrimOptionalName($evaluation['summary'] ?? '', 500),
        $criteria === [] ? null : json_encode($criteria, JSON_UNESCAPED_UNICODE),
    ]);
}

/** @param array<string, mixed> $body */
function portailClubIpdUpsertSession(PDO $pdo, array $body): array
{
    $externalId = trim((string)($body['external_id'] ?? ''));
    if ($externalId === '' || strlen($externalId) > 36) {
        portailClubJsonFail('external_id requis (UUID).');
    }

    $studentId = portailClubIpdOptionalPositiveInt($body['formation_student_id'] ?? null);
    $formationSessionId = portailClubIpdOptionalPositiveInt($body['formation_session_id'] ?? null);
    portailClubIpdValidateStudentLink($pdo, $studentId);
    portailClubIpdValidateSessionLink($pdo, $formationSessionId);

    $stExisting = $pdo->prepare('SELECT id FROM PORTAIL_CLUB_ipd_sessions WHERE external_id = ?');
    $stExisting->execute([$externalId]);
    $existing = $stExisting->fetch(PDO::FETCH_ASSOC);
    if ($existing) {
        return portailClubIpdGetSession($pdo, (int)$existing['id']);
    }

    $events = $body['events'] ?? [];
    if (!is_array($events) || $events === []) {
        portailClubJsonFail('Au moins un événement IPD requis.');
    }

    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare(
            'INSERT INTO PORTAIL_CLUB_ipd_sessions (
                external_id, device_id, device_name, dive_fingerprint, dive_number,
                dive_held_at, dive_max_depth_m, dive_duration_sec,
                formation_student_id, formation_session_id, instructor_name, source_app, notes
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $st->execute([
            $externalId,
            portailClubTruncateName(trim((string)($body['device_id'] ?? '')), 128),
            portailClubTrimOptionalName($body['device_name'] ?? '', 120) ?: null,
            portailClubTrimOptionalName($body['dive_fingerprint'] ?? '', 64) ?: null,
            portailClubIpdOptionalUInt($body['dive_number'] ?? null),
            portailClubIpdParseDateTime($body['dive_held_at'] ?? null, 'dive_held_at'),
            portailClubIpdOptionalFloat($body['dive_max_depth_m'] ?? null),
            portailClubIpdOptionalUInt($body['dive_duration_sec'] ?? null),
            $studentId,
            $formationSessionId,
            portailClubTrimOptionalName($body['instructor_name'] ?? '', 160) ?: null,
            portailClubTrimOptionalName($body['source_app'] ?? 'mares-ipd', 32),
            trim((string)($body['notes'] ?? '')) ?: null,
        ]);
        $sessionId = (int)$pdo->lastInsertId();
        foreach ($events as $eventBody) {
            if (!is_array($eventBody)) {
                portailClubJsonFail('Format événement IPD invalide.');
            }
            portailClubIpdInsertEvent($pdo, $sessionId, $eventBody);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    return portailClubIpdGetSession($pdo, $sessionId);
}
