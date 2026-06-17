<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../lib/db.inc.php';
require_once __DIR__ . '/../../lib/materiel.inc.php';

try {
    $pdo = portailClubGetPdo();
    $method = portailClubRequestMethod();

    if ($method === 'GET') {
        $filters = [
            'structure_ids' => portailClubMaterielParseStructureIds($_GET['structure_ids'] ?? null),
            'alert_only' => isset($_GET['alert_only']) && (string)$_GET['alert_only'] === '1',
        ];
        portailClubJsonOk(portailClubMaterielGetSecurityRegister($pdo, $filters));
    }

    if ($method === 'PATCH') {
        $body = portailClubReadJsonBody();
        portailClubJsonOk(['cell' => portailClubMaterielPatchSecurityCell($pdo, $body)]);
    }

    portailClubJsonFail('Méthode non autorisée.', 405);
} catch (Throwable $e) {
    portailClubJsonFail($e->getMessage(), 500);
}
