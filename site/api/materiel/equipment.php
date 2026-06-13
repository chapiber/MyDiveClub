<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../lib/db.inc.php';
require_once __DIR__ . '/../../lib/materiel.inc.php';

try {
    $pdo = portailClubGetPdo();
    $method = portailClubRequestMethod();

    if ($method === 'GET') {
        if (isset($_GET['check_id']) && (string)$_GET['check_id'] === '1') {
            $publicId = portailClubMaterielNormalizePublicId($_GET['public_id'] ?? '');
            $exclude = isset($_GET['exclude_id']) ? (int)$_GET['exclude_id'] : null;
            portailClubJsonOk([
                'available' => portailClubMaterielCheckPublicIdAvailable($pdo, $publicId, $exclude ?: null),
            ]);
        }
        if (isset($_GET['suggest_id']) && (string)$_GET['suggest_id'] === '1') {
            portailClubJsonOk(['public_id' => portailClubMaterielSuggestNextPublicId($pdo)]);
        }
        $publicId = trim((string)($_GET['public_id'] ?? ''));
        if ($publicId !== '') {
            portailClubJsonOk(['equipment' => portailClubMaterielGetEquipmentByPublicId($pdo, $publicId)]);
        }
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if ($id > 0) {
            portailClubJsonOk(['equipment' => portailClubMaterielGetEquipment($pdo, $id)]);
        }
        $filters = [
            'structure_ids' => portailClubMaterielParseStructureIds($_GET['structure_ids'] ?? null),
            'state' => $_GET['state'] ?? '',
            'type_id' => $_GET['type_id'] ?? 0,
            'q' => $_GET['q'] ?? '',
        ];
        portailClubJsonOk(['equipment' => portailClubMaterielListEquipment($pdo, $filters)]);
    }

    if ($method === 'POST') {
        $body = portailClubReadJsonBody();
        $action = strtolower(trim((string)($body['action'] ?? 'create')));

        if ($action === 'change_state') {
            $id = portailClubIntParam($body['equipment_id'] ?? null, 'equipment_id');
            portailClubJsonOk(['equipment' => portailClubMaterielChangeEquipmentState($pdo, $id, $body)]);
        }
        if ($action === 'link_nfc') {
            $id = portailClubIntParam($body['equipment_id'] ?? null, 'equipment_id');
            portailClubJsonOk(['equipment' => portailClubMaterielSetNfcLinked($pdo, $id, true)]);
        }
        if ($action === 'unlink_nfc') {
            $id = portailClubIntParam($body['equipment_id'] ?? null, 'equipment_id');
            portailClubJsonOk(['equipment' => portailClubMaterielSetNfcLinked($pdo, $id, false)]);
        }

        portailClubJsonOk(['equipment' => portailClubMaterielCreateEquipment($pdo, $body)]);
    }

    if ($method === 'PATCH') {
        $id = portailClubIntParam($_GET['id'] ?? null, 'id');
        $body = portailClubReadJsonBody();
        portailClubJsonOk(['equipment' => portailClubMaterielPatchEquipment($pdo, $id, $body)]);
    }

    portailClubJsonFail('Méthode non autorisée.', 405);
} catch (Throwable $e) {
    portailClubJsonFail($e->getMessage(), 500);
}
