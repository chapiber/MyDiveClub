<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../lib/db.inc.php';
require_once __DIR__ . '/../../lib/formations.inc.php';

try {
    $pdo = portailClubGetPdo();
    $method = portailClubRequestMethod();

    if ($method === 'GET') {
        portailClubJsonOk(portailClubGetCatalog($pdo));
    }

    if ($method === 'POST') {
        $body = portailClubReadJsonBody();
        $levelId = portailClubIntParam($body['level_id'] ?? null, 'level_id');
        $name = trim((string)($body['name'] ?? ''));
        $abbr = isset($body['abbr']) ? trim((string)$body['abbr']) : null;
        $skill = portailClubAddCatalogSkill($pdo, $levelId, $name, $abbr);
        portailClubJsonOk(['skill' => $skill]);
    }

    portailClubJsonFail('Méthode non autorisée.', 405);
} catch (Throwable $e) {
    portailClubJsonFail($e->getMessage(), 500);
}
