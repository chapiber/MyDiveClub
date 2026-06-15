<?php
declare(strict_types=1);

require_once __DIR__ . '/api.inc.php';

const PORTAIL_CLUB_CDM_JSON_PATH = __DIR__ . '/../apps/cdm2026/data/cdm2026.json';
const PORTAIL_CLUB_CDM_MAX_GOALS = 15;
const PORTAIL_CLUB_CDM_PSEUDO_MAX = 40;

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

/** @return array{id:int,pseudo:string,client_token:string,created_at:string} */
function portailClubCdmFormatMember(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'pseudo' => (string)$row['pseudo'],
        'client_token' => (string)$row['client_token'],
        'created_at' => (string)$row['created_at'],
    ];
}

/** @return array{id:int,pseudo:string,client_token:string,created_at:string}|null */
function portailClubCdmFindMemberByToken(PDO $pdo, string $token): ?array
{
    $st = $pdo->prepare(
        'SELECT id, pseudo, client_token, created_at
         FROM PORTAIL_CLUB_cdm_members WHERE client_token = ? LIMIT 1'
    );
    $st->execute([$token]);
    $row = $st->fetch();
    if (!$row) {
        return null;
    }
    return portailClubCdmFormatMember($row);
}

/** @return array{id:int,pseudo:string,client_token:string,created_at:string} */
function portailClubCdmGetMemberByToken(PDO $pdo, string $token): array
{
    $member = portailClubCdmFindMemberByToken($pdo, $token);
    if ($member === null) {
        portailClubJsonFail('Joueur introuvable.', 404);
    }
    return $member;
}

/** @return array{id:int,pseudo:string,client_token:string,created_at:string}|null */
function portailClubCdmFindMemberByPseudo(PDO $pdo, string $pseudo): ?array
{
    $st = $pdo->prepare(
        'SELECT id, pseudo, client_token, created_at
         FROM PORTAIL_CLUB_cdm_members WHERE pseudo = ? LIMIT 1'
    );
    $st->execute([$pseudo]);
    $row = $st->fetch();
    if (!$row) {
        return null;
    }
    return portailClubCdmFormatMember($row);
}

/**
 * Inscription ou reconnexion par pseudo (nouveau token émis sur ce mobile).
 *
 * @return array{member: array, created: bool}
 */
function portailClubCdmJoinMember(PDO $pdo, array $body): array
{
    $pseudo = portailClubCdmNormalizePseudo($body['pseudo'] ?? '');
    $existing = portailClubCdmFindMemberByPseudo($pdo, $pseudo);

    $token = portailClubCdmGenerateToken();
    if ($existing !== null) {
        $st = $pdo->prepare('UPDATE PORTAIL_CLUB_cdm_members SET client_token = ? WHERE id = ?');
        $st->execute([$token, $existing['id']]);
        return [
            'member' => portailClubCdmGetMemberByToken($pdo, $token),
            'created' => false,
        ];
    }

    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_cdm_members (pseudo, client_token) VALUES (?, ?)'
    );
    $st->execute([$pseudo, $token]);
    return [
        'member' => portailClubCdmGetMemberByToken($pdo, $token),
        'created' => true,
    ];
}

/** @deprecated Utiliser portailClubCdmJoinMember */
function portailClubCdmCreateMember(PDO $pdo, array $body): array
{
    $result = portailClubCdmJoinMember($pdo, $body);
    return $result['member'];
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

function portailClubCdmPredictionLabel(float $pts): string
{
    if ($pts >= 5.0) {
        return 'Score exact';
    }
    if ($pts >= 3.0) {
        return 'Écart exact';
    }
    if ($pts >= 1.0) {
        return 'Bon vainqueur';
    }
    if ($pts > 0) {
        return 'Participation';
    }
    return '';
}

function portailClubCdmMatchHasFinalScore(array $match): bool
{
    $score = $match['score'] ?? null;
    if (!is_array($score) || ($score['status'] ?? '') !== 'finished') {
        return false;
    }
    return array_key_exists('home', $score)
        && array_key_exists('away', $score)
        && $score['home'] !== null
        && $score['away'] !== null;
}

/** @return array{home:int,away:int} */
function portailClubCdmMatchFinalScore(array $match): array
{
    if (!portailClubCdmMatchHasFinalScore($match)) {
        portailClubJsonFail('Résultat non disponible pour ce match.', 400);
    }
    $score = $match['score'];
    return [
        'home' => (int)$score['home'],
        'away' => (int)$score['away'],
    ];
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

        if (!portailClubCdmMatchHasFinalScore($match)) {
            continue;
        }

        $final = portailClubCdmMatchFinalScore($match);
        $pred = $predictionsByMatch[$matchId];
        $pts = portailClubCdmScorePrediction(
            (int)$pred['pred_home'],
            (int)$pred['pred_away'],
            $final['home'],
            $final['away']
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
        'SELECT id, pseudo, client_token, created_at
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
            'display_name' => (string)$member['pseudo'],
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

/** @return array<string, mixed> */
function portailClubCdmBuildMatchBoard(PDO $pdo, string $matchId): array
{
    $match = portailClubCdmFindMatch($matchId);
    if ($match === null) {
        portailClubJsonFail('Match introuvable.', 404);
    }
    $final = portailClubCdmMatchFinalScore($match);

    $st = $pdo->prepare(
        'SELECT m.id AS member_id, m.pseudo, p.pred_home, p.pred_away
         FROM PORTAIL_CLUB_cdm_predictions p
         INNER JOIN PORTAIL_CLUB_cdm_members m ON m.id = p.member_id
         WHERE p.match_id = ?
         ORDER BY m.pseudo ASC'
    );
    $st->execute([$matchId]);
    $entries = [];
    while ($row = $st->fetch()) {
        $pts = portailClubCdmScorePrediction(
            (int)$row['pred_home'],
            (int)$row['pred_away'],
            $final['home'],
            $final['away']
        );
        $entries[] = [
            'member_id' => (int)$row['member_id'],
            'pseudo' => (string)$row['pseudo'],
            'pred_home' => (int)$row['pred_home'],
            'pred_away' => (int)$row['pred_away'],
            'points' => $pts,
            'label' => portailClubCdmPredictionLabel($pts),
        ];
    }

    usort(
        $entries,
        static function (array $a, array $b): int {
            if ($a['points'] !== $b['points']) {
                return $b['points'] <=> $a['points'];
            }
            return strcmp($a['pseudo'], $b['pseudo']);
        }
    );

    return [
        'match_id' => $matchId,
        'home' => (string)($match['home'] ?? ''),
        'away' => (string)($match['away'] ?? ''),
        'stage' => (string)($match['stage'] ?? ''),
        'group' => isset($match['group']) ? (string)$match['group'] : null,
        'kickoff_paris' => (string)($match['kickoffParis'] ?? ''),
        'result' => [
            'home' => $final['home'],
            'away' => $final['away'],
            'status' => 'finished',
        ],
        'entries' => $entries,
    ];
}

/** @return array<string, mixed> */
function portailClubCdmBuildMemberBoard(PDO $pdo, int $memberId): array
{
    $st = $pdo->prepare('SELECT id, pseudo FROM PORTAIL_CLUB_cdm_members WHERE id = ? LIMIT 1');
    $st->execute([$memberId]);
    $memberRow = $st->fetch();
    if (!$memberRow) {
        portailClubJsonFail('Joueur introuvable.', 404);
    }

    $board = portailClubCdmBuildMemberScoreboard($pdo, $memberId);
    $data = portailClubCdmLoadTournamentData();
    $matches = [];

    foreach ($data['matches'] as $match) {
        if (!is_array($match) || !portailClubCdmMatchHasFinalScore($match)) {
            continue;
        }
        $matchId = (string)($match['id'] ?? '');
        if ($matchId === '' || !isset($board['predictions'][$matchId])) {
            continue;
        }
        $pred = $board['predictions'][$matchId];
        $pts = $board['match_points'][$matchId] ?? null;
        if ($pts === null) {
            continue;
        }
        $final = portailClubCdmMatchFinalScore($match);
        $matches[] = [
            'match_id' => $matchId,
            'home' => (string)($match['home'] ?? ''),
            'away' => (string)($match['away'] ?? ''),
            'kickoff_paris' => (string)($match['kickoffParis'] ?? ''),
            'result' => $final,
            'pred_home' => (int)$pred['pred_home'],
            'pred_away' => (int)$pred['pred_away'],
            'points' => $pts,
            'label' => portailClubCdmPredictionLabel((float)$pts),
        ];
    }

    usort(
        $matches,
        static function (array $a, array $b): int {
            return strcmp($b['kickoff_paris'], $a['kickoff_paris']);
        }
    );

    return [
        'member_id' => (int)$memberRow['id'],
        'pseudo' => (string)$memberRow['pseudo'],
        'total_points' => $board['total_points'],
        'predicted_count' => $board['predicted_count'],
        'scored_count' => $board['scored_count'],
        'matches' => $matches,
    ];
}
