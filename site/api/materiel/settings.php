<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../lib/db.inc.php';
require_once __DIR__ . '/../../lib/materiel.inc.php';

try {
    $pdo = portailClubGetPdo();
    $method = portailClubRequestMethod();

    if ($method === 'GET') {
        portailClubJsonOk(['settings' => portailClubMaterielGetSettings($pdo)]);
    }

    if ($method === 'PATCH') {
        $body = portailClubReadJsonBody();
        portailClubJsonOk(['settings' => portailClubMaterielPatchSettings($pdo, $body)]);
    }

    portailClubJsonFail('Méthode non autorisée.', 405);
} catch (Throwable $e) {
    portailClubJsonFail($e->getMessage(), 500);
}
