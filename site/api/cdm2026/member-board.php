<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../lib/db.inc.php';
require_once __DIR__ . '/../../lib/cdm2026.inc.php';

try {
    $pdo = portailClubGetPdo();
    portailClubRequireMethod('GET');

    $memberId = (int)($_GET['member_id'] ?? 0);
    if ($memberId <= 0) {
        portailClubJsonFail('Identifiant joueur invalide.');
    }

    $board = portailClubCdmBuildMemberBoard($pdo, $memberId);

    $token = trim((string)($_GET['token'] ?? ''));
    $myMemberId = null;
    if ($token !== '' && preg_match('/^[a-f0-9]{64}$/', $token)) {
        $member = portailClubCdmFindMemberByToken($pdo, $token);
        if ($member !== null) {
            $myMemberId = (int)$member['id'];
        }
    }

    portailClubJsonOk([
        'board' => $board,
        'my_member_id' => $myMemberId,
    ]);
} catch (Throwable $e) {
    portailClubJsonFail($e->getMessage(), 500);
}
