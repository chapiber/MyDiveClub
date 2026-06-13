<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../lib/db.inc.php';
require_once __DIR__ . '/../../lib/materiel.inc.php';

try {
    $pdo = portailClubGetPdo();
    $method = portailClubRequestMethod();

    if ($method === 'GET') {
        $typeId = isset($_GET['type_id']) ? (int)$_GET['type_id'] : 0;
        if ($typeId > 0) {
            portailClubJsonOk(['type' => portailClubMaterielGetEquipmentType($pdo, $typeId)]);
        }
        portailClubJsonOk(portailClubMaterielGetCatalog($pdo));
    }

    if ($method === 'POST') {
        $body = portailClubReadJsonBody();
        $action = strtolower(trim((string)($body['action'] ?? 'type')));
        if ($action === 'check') {
            portailClubJsonOk(['check' => portailClubMaterielCreateTypeCheck($pdo, $body)]);
        }
        portailClubJsonOk(['type' => portailClubMaterielCreateEquipmentType($pdo, $body)]);
    }

    if ($method === 'PATCH') {
        $checkId = isset($_GET['check_id']) ? (int)$_GET['check_id'] : 0;
        if ($checkId > 0) {
            $body = portailClubReadJsonBody();
            portailClubJsonOk(['check' => portailClubMaterielPatchTypeCheck($pdo, $checkId, $body)]);
        }
        $id = portailClubIntParam($_GET['id'] ?? null, 'id');
        $body = portailClubReadJsonBody();
        portailClubJsonOk(['type' => portailClubMaterielPatchEquipmentType($pdo, $id, $body)]);
    }

    if ($method === 'DELETE') {
        $typeId = isset($_GET['type_id']) ? (int)$_GET['type_id'] : 0;
        if ($typeId > 0) {
            portailClubMaterielDeleteEquipmentType($pdo, $typeId);
            portailClubJsonOk(['deleted' => true]);
        }
        $checkId = portailClubIntParam($_GET['check_id'] ?? null, 'check_id');
        portailClubMaterielDeleteTypeCheck($pdo, $checkId);
        portailClubJsonOk(['deleted' => true]);
    }

    portailClubJsonFail('Méthode non autorisée.', 405);
} catch (Throwable $e) {
    portailClubJsonFail($e->getMessage(), 500);
}
