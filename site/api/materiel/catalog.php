<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../lib/db.inc.php';
require_once __DIR__ . '/../../lib/materiel.inc.php';

try {
    $pdo = portailClubGetPdo();
    $method = portailClubRequestMethod();

    if ($method === 'GET') {
        portailClubJsonOk(portailClubMaterielGetCatalog($pdo));
    }

    if ($method === 'POST') {
        $body = portailClubReadJsonBody();
        portailClubJsonOk(['type' => portailClubMaterielCreateEquipmentType($pdo, $body)]);
    }

    if ($method === 'PATCH') {
        $id = portailClubIntParam($_GET['id'] ?? null, 'id');
        $body = portailClubReadJsonBody();
        portailClubJsonOk(['type' => portailClubMaterielPatchEquipmentType($pdo, $id, $body)]);
    }

    portailClubJsonFail('Méthode non autorisée.', 405);
} catch (Throwable $e) {
    portailClubJsonFail($e->getMessage(), 500);
}
