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
        portailClubJsonOk(['member' => $member]);
    }

    if ($method === 'POST') {
        $body = portailClubReadJsonBody();
        $member = portailClubCdmCreateMember($pdo, $body);
        portailClubJsonOk(['member' => $member]);
    }

    portailClubJsonFail('Méthode non autorisée.', 405);
} catch (Throwable $e) {
    portailClubJsonFail($e->getMessage(), 500);
}
