<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../lib/db.inc.php';
require_once __DIR__ . '/../../lib/cdm2026.inc.php';

try {
    $pdo = portailClubGetPdo();
    $method = portailClubRequestMethod();

    if ($method === 'GET') {
        $token = portailClubCdmTokenFromRequest();
        $member = portailClubCdmGetMemberByToken($pdo, $token);
        $board = portailClubCdmBuildMemberScoreboard($pdo, (int)$member['id']);
        portailClubJsonOk([
            'predictions' => $board['predictions'],
            'total_points' => $board['total_points'],
            'predicted_count' => $board['predicted_count'],
            'scored_count' => $board['scored_count'],
            'match_points' => $board['match_points'],
        ]);
    }

    if ($method === 'PUT') {
        $body = portailClubReadJsonBody();
        $token = portailClubCdmTokenFromRequest($body);
        $member = portailClubCdmGetMemberByToken($pdo, $token);
        $prediction = portailClubCdmUpsertPrediction($pdo, (int)$member['id'], $body);
        portailClubJsonOk(['prediction' => $prediction]);
    }

    portailClubJsonFail('Méthode non autorisée.', 405);
} catch (Throwable $e) {
    portailClubJsonFail($e->getMessage(), 500);
}
