<?php
declare(strict_types=1);

require_once __DIR__ . '/api.inc.php';

const PORTAIL_CLUB_CDM_JSON_PATH = __DIR__ . '/../apps/cdm2026/data/cdm2026.json';
const PORTAIL_CLUB_CDM_MAX_GOALS = 15;
const PORTAIL_CLUB_CDM_PSEUDO_MAX = 40;
const PORTAIL_CLUB_CDM_FIRST_NAME_MAX = 80;

/** @var array<string, mixed>|null */
$GLOBALS['portailClubCdmTournamentCache'] = null;

/** @var int */
$GLOBALS['portailClubCdmTournamentCacheAt'] = 0;

/** @return array<string, mixed> */
function portailClubCdmLoadTournamentData(): array
{
    $now = time();
    if (
        is_array($GLOBALS['portailClubCdmTournamentCache'])
        && ($now - (int)$GLOBALS['portailClubCdmTournamentCacheAt']) < 60
    ) {
        return $GLOBALS['portailClubCdmTournamentCache'];
    }

    if (!is_readable(PORTAIL_CLUB_CDM_JSON_PATH)) {
        portailClubJsonFail('Données tournoi indisponibles.', 500);
    }
    $raw = file_get_contents(PORTAIL_CLUB_CDM_JSON_PATH);
    if ($raw === false) {
        portailClubJsonFail('Données tournoi indisponibles.', 500);
    }
    $data = json_decode($raw, true);
    if (!is_array($data) || !isset($data['matches']) || !is_array($data['matches'])) {
        portailClubJsonFail('Données tournoi invalides.', 500);
    }

    $GLOBALS['portailClubCdmTournamentCache'] = $data;
    $GLOBALS['portailClubCdmTournamentCacheAt'] = $now;
    return $data;
}

/** @return array<string, mixed>|null */
function portailClubCdmFindMatch(string $matchId): ?array
{
    $data = portailClubCdmLoadTournamentData();
    foreach ($data['matches'] as $match) {
        if (!is_array($match)) {
            continue;
        }
        if (($match['id'] ?? '') === $matchId) {
            return $match;
        }
    }
    return null;
}

function portailClubCdmNormalizePseudo(mixed $value): string
{
    $s = trim((string)$value);
    if ($s === '') {
        portailClubJsonFail('Pseudo requis.');
    }
    if (preg_match('/\s/', $s)) {
        portailClubJsonFail('Le pseudo ne doit pas contenir d\'espace.');
    }
    if (function_exists('mb_strlen') && mb_strlen($s) > PORTAIL_CLUB_CDM_PSEUDO_MAX) {
        portailClubJsonFail('Pseudo trop long.');
    }
    if (!function_exists('mb_strlen') && strlen($s) > PORTAIL_CLUB_CDM_PSEUDO_MAX) {
        portailClubJsonFail('Pseudo trop long.');
    }
    return $s;
}

function portailClubCdmNormalizeFirstName(mixed $value): string
{
    return portailClubTrimName($value, 'Prénom', PORTAIL_CLUB_CDM_FIRST_NAME_MAX);
}

function portailClubCdmGenerateToken(): string
{
    return bin2hex(random_bytes(32));
}

function portailClubCdmNormalizeToken(mixed $value): string
{
    $token = trim((string)$value);
    if ($token === '' || !preg_match('/^[a-f0-9]{64}$/', $token)) {
        portailClubJsonFail('Token invalide.');
    }
    return $token;
}

function portailClubCdmTokenFromRequest(array $body = []): string
{
    $token = $_GET['token'] ?? $body['token'] ?? '';
    return portailClubCdmNormalizeToken($token);
}

/** @return array{id:int,pseudo:string,first_name:string,client_token:string,created_at:string} */
function portailClubCdmFormatMember(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'pseudo' => (string)$row['pseudo'],
        'first_name' => (string)$row['first_name'],
        'client_token' => (string)$row['client_token'],
        'created_at' => (string)$row['created_at'],
    ];
}

/** @return array{id:int,pseudo:string,first_name:string,client_token:string,created_at:string}|null */
function portailClubCdmFindMemberByToken(PDO $pdo, string $token): ?array
{
    $st = $pdo->prepare(
        'SELECT id, pseudo, first_name, client_token, created_at
         FROM PORTAIL_CLUB_cdm_members WHERE client_token = ? LIMIT 1'
    );
    $st->execute([$token]);
    $row = $st->fetch();
    if (!$row) {
        return null;
    }
    return portailClubCdmFormatMember($row);
}

/** @return array{id:int,pseudo:string,first_name:string,client_token:string,created_at:string} */
function portailClubCdmGetMemberByToken(PDO $pdo, string $token): array
{
    $member = portailClubCdmFindMemberByToken($pdo, $token);
    if ($member === null) {
        portailClubJsonFail('Joueur introuvable.', 404);
    }
    return $member;
}

/** @return array{id:int,pseudo:string,first_name:string,client_token:string,created_at:string} */
function portailClubCdmCreateMember(PDO $pdo, array $body): array
{
    $pseudo = portailClubCdmNormalizePseudo($body['pseudo'] ?? '');
    $firstName = portailClubCdmNormalizeFirstName($body['first_name'] ?? '');

    $stCheck = $pdo->prepare('SELECT 1 FROM PORTAIL_CLUB_cdm_members WHERE pseudo = ? LIMIT 1');
    $stCheck->execute([$pseudo]);
    if ($stCheck->fetchColumn()) {
        portailClubJsonFail('Ce pseudo est déjà pris.');
    }

    $token = portailClubCdmGenerateToken();
    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_cdm_members (pseudo, first_name, client_token) VALUES (?, ?, ?)'
    );
    $st->execute([$pseudo, $firstName, $token]);
    return portailClubCdmGetMemberByToken($pdo, $token);
}

function portailClubCdmMatchHasTeams(array $match): bool
{
    $home = trim((string)($match['home'] ?? ''));
    $away = trim((string)($match['away'] ?? ''));
    return $home !== '' && $away !== '';
}

function portailClubCdmMatchKickoffTs(array $match): int
{
    $iso = (string)($match['kickoffParis'] ?? '');
    if ($iso === '') {
        portailClubJsonFail('Match sans horaire.');
    }
    $ts = strtotime($iso);
    if ($ts === false) {
        portailClubJsonFail('Horaire de match invalide.');
    }
    return $ts;
}

function portailClubCdmIsMatchLocked(array $match): bool
{
    return time() >= portailClubCdmMatchKickoffTs($match);
}

function portailClubCdmValidateGoal(mixed $value, string $label): int
{
    if (!is_numeric($value)) {
        portailClubJsonFail("{$label} invalide.");
    }
    $n = (int)$value;
    if ($n < 0 || $n > PORTAIL_CLUB_CDM_MAX_GOALS) {
        portailClubJsonFail("{$label} doit être entre 0 et " . PORTAIL_CLUB_CDM_MAX_GOALS . '.');
    }
    return $n;
}

function portailClubCdmNormalizeMatchId(mixed $value): string
{
    $id = strtoupper(trim((string)$value));
    if (!preg_match('/^M\d{3}$/', $id)) {
        portailClubJsonFail('Identifiant de match invalide.');
    }
    return $id;
}

/** @return array<string, array{pred_home:int,pred_away:int,updated_at:string}> */
function portailClubCdmListPredictionsForMember(PDO $pdo, int $memberId): array
{
    $st = $pdo->prepare(
        'SELECT match_id, pred_home, pred_away, updated_at
         FROM PORTAIL_CLUB_cdm_predictions WHERE member_id = ?'
    );
    $st->execute([$memberId]);
    $out = [];
    while ($row = $st->fetch()) {
        $out[(string)$row['match_id']] = [
            'pred_home' => (int)$row['pred_home'],
            'pred_away' => (int)$row['pred_away'],
            'updated_at' => (string)$row['updated_at'],
        ];
    }
    return $out;
}

/** @return array{pred_home:int,pred_away:int,updated_at:string} */
function portailClubCdmUpsertPrediction(PDO $pdo, int $memberId, array $body): array
{
    $matchId = portailClubCdmNormalizeMatchId($body['match_id'] ?? '');
    $match = portailClubCdmFindMatch($matchId);
    if ($match === null) {
        portailClubJsonFail('Match introuvable.');
    }
    if (!portailClubCdmMatchHasTeams($match)) {
        portailClubJsonFail('Équipes à déterminer pour ce match.');
    }
    if (portailClubCdmIsMatchLocked($match)) {
        portailClubJsonFail('Les pronostics sont verrouillés pour ce match.');
    }

    $predHome = portailClubCdmValidateGoal($body['pred_home'] ?? null, 'Score domicile');
    $predAway = portailClubCdmValidateGoal($body['pred_away'] ?? null, 'Score extérieur');

    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_cdm_predictions (member_id, match_id, pred_home, pred_away)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE pred_home = VALUES(pred_home), pred_away = VALUES(pred_away)'
    );
    $st->execute([$memberId, $matchId, $predHome, $predAway]);

    $stGet = $pdo->prepare(
        'SELECT pred_home, pred_away, updated_at
         FROM PORTAIL_CLUB_cdm_predictions
         WHERE member_id = ? AND match_id = ? LIMIT 1'
    );
    $stGet->execute([$memberId, $matchId]);
    $row = $stGet->fetch();
    if (!$row) {
        portailClubJsonFail('Pronostic introuvable après enregistrement.', 500);
    }

    return [
        'match_id' => $matchId,
        'pred_home' => (int)$row['pred_home'],
        'pred_away' => (int)$row['pred_away'],
        'updated_at' => (string)$row['updated_at'],
    ];
}

function portailClubCdmMatchWinner(int $home, int $away): int
{
    if ($home > $away) {
        return 1;
    }
    if ($home < $away) {
        return -1;
    }
    return 0;
}

function portailClubCdmScorePrediction(int $predHome, int $predAway, int $realHome, int $realAway): float
{
    if ($predHome === $realHome && $predAway === $realAway) {
        return 5.0;
    }

    $predDiff = $predHome - $predAway;
    $realDiff = $realHome - $realAway;
    if (portailClubCdmMatchWinner($predHome, $predAway) === portailClubCdmMatchWinner($realHome, $realAway)
        && $predDiff === $realDiff
    ) {
        return 3.0;
    }

    if (portailClubCdmMatchWinner($predHome, $predAway) === portailClubCdmMatchWinner($realHome, $realAway)) {
        return 1.0;
    }

    return 0.1;
}

/** @param array<string, array{pred_home:int,pred_away:int}> $predictionsByMatch */
function portailClubCdmComputeMemberStats(array $predictionsByMatch): array
{
    $data = portailClubCdmLoadTournamentData();
    $totalPoints = 0.0;
    $predictedCount = count($predictionsByMatch);
    $scoredCount = 0;
    $matchPoints = [];

    foreach ($data['matches'] as $match) {
        if (!is_array($match)) {
            continue;
        }
        $matchId = (string)($match['id'] ?? '');
        if ($matchId === '' || !isset($predictionsByMatch[$matchId])) {
            continue;
        }

        $score = $match['score'] ?? null;
        if (!is_array($score) || ($score['status'] ?? '') !== 'finished') {
            continue;
        }
        if (!isset($score['home'], $score['away'])) {
            continue;
        }

        $pred = $predictionsByMatch[$matchId];
        $pts = portailClubCdmScorePrediction(
            (int)$pred['pred_home'],
            (int)$pred['pred_away'],
            (int)$score['home'],
            (int)$score['away']
        );
        $totalPoints += $pts;
        $scoredCount++;
        $matchPoints[$matchId] = $pts;
    }

    return [
        'total_points' => round($totalPoints, 1),
        'predicted_count' => $predictedCount,
        'scored_count' => $scoredCount,
        'match_points' => $matchPoints,
    ];
}

/** @return list<array<string, mixed>> */
function portailClubCdmBuildLeaderboard(PDO $pdo): array
{
    $st = $pdo->query(
        'SELECT id, pseudo, first_name, client_token, created_at
         FROM PORTAIL_CLUB_cdm_members ORDER BY pseudo ASC'
    );
    $members = $st->fetchAll() ?: [];
    $rows = [];

    foreach ($members as $member) {
        $memberId = (int)$member['id'];
        $predictions = portailClubCdmListPredictionsForMember($pdo, $memberId);
        $predOnly = [];
        foreach ($predictions as $matchId => $pred) {
            $predOnly[$matchId] = [
                'pred_home' => $pred['pred_home'],
                'pred_away' => $pred['pred_away'],
            ];
        }
        $stats = portailClubCdmComputeMemberStats($predOnly);
        $rows[] = [
            'id' => $memberId,
            'pseudo' => (string)$member['pseudo'],
            'first_name' => (string)$member['first_name'],
            'display_name' => (string)$member['pseudo'] . ' (' . (string)$member['first_name'] . ')',
            'total_points' => $stats['total_points'],
            'predicted_count' => $stats['predicted_count'],
            'scored_count' => $stats['scored_count'],
        ];
    }

    usort(
        $rows,
        static function (array $a, array $b): int {
            if ($a['total_points'] !== $b['total_points']) {
                return $b['total_points'] <=> $a['total_points'];
            }
            return strcmp($a['pseudo'], $b['pseudo']);
        }
    );

    $rank = 1;
    foreach ($rows as $i => &$row) {
        $row['rank'] = $rank;
        $rank++;
    }
    unset($row);

    return $rows;
}

/** @return array<string, mixed> */
function portailClubCdmBuildMemberScoreboard(PDO $pdo, int $memberId): array
{
    $predictions = portailClubCdmListPredictionsForMember($pdo, $memberId);
    $predOnly = [];
    foreach ($predictions as $matchId => $pred) {
        $predOnly[$matchId] = [
            'pred_home' => $pred['pred_home'],
            'pred_away' => $pred['pred_away'],
        ];
    }
    $stats = portailClubCdmComputeMemberStats($predOnly);
    return [
        'predictions' => $predictions,
        'total_points' => $stats['total_points'],
        'predicted_count' => $stats['predicted_count'],
        'scored_count' => $stats['scored_count'],
        'match_points' => $stats['match_points'],
    ];
}
