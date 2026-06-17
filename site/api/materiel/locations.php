<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../lib/db.inc.php';
require_once __DIR__ . '/../../lib/materiel.inc.php';

try {
    $pdo = portailClubGetPdo();
    $method = portailClubRequestMethod();

    if ($method === 'GET') {
        $activeOnly = isset($_GET['active']) && (string)$_GET['active'] === '1';
        portailClubJsonOk(['locations' => portailClubMaterielListLocations($pdo, $activeOnly)]);
    }

    if ($method === 'POST') {
        $body = portailClubReadJsonBody();
        portailClubJsonOk(['location' => portailClubMaterielCreateLocation($pdo, $body)]);
    }

    if ($method === 'PATCH') {
        $id = portailClubIntParam($_GET['id'] ?? null, 'id');
        $body = portailClubReadJsonBody();
        portailClubJsonOk(['location' => portailClubMaterielPatchLocation($pdo, $id, $body)]);
    }

    if ($method === 'DELETE') {
        $id = portailClubIntParam($_GET['id'] ?? null, 'id');
        portailClubJsonOk(portailClubMaterielDeleteLocation($pdo, $id));
    }

    portailClubJsonFail('Méthode non autorisée.', 405);
} catch (Throwable $e) {
    portailClubJsonFail($e->getMessage(), 500);
}
