<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../lib/db.inc.php';
require_once __DIR__ . '/../../lib/materiel.inc.php';

try {
    $pdo = portailClubGetPdo();
    $method = portailClubRequestMethod();

    if ($method === 'GET') {
        portailClubJsonOk(['roles' => portailClubMaterielListRoles($pdo)]);
    }

    if ($method === 'POST') {
        $body = portailClubReadJsonBody();
        portailClubJsonOk(['role' => portailClubMaterielCreateRole($pdo, $body)]);
    }

    if ($method === 'PATCH') {
        $id = portailClubIntParam($_GET['id'] ?? null, 'id');
        $body = portailClubReadJsonBody();
        portailClubJsonOk(['role' => portailClubMaterielPatchRole($pdo, $id, $body)]);
    }

    portailClubJsonFail('Méthode non autorisée.', 405);
} catch (Throwable $e) {
    portailClubJsonFail($e->getMessage(), 500);
}
