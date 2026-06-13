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
            $typeId = portailClubIntParam($_GET['type_id'] ?? null, 'type_id');
            $exclude = isset($_GET['exclude_id']) ? (int)$_GET['exclude_id'] : null;
            portailClubJsonOk([
                'available' => portailClubMaterielCheckPublicIdAvailable($pdo, $publicId, $typeId, $exclude ?: null),
            ]);
        }
        if (isset($_GET['suggest_id']) && (string)$_GET['suggest_id'] === '1') {
            $structureId = isset($_GET['structure_id']) ? (int)$_GET['structure_id'] : null;
            $typeId = isset($_GET['type_id']) ? (int)$_GET['type_id'] : null;
            portailClubJsonOk([
                'public_id' => portailClubMaterielSuggestNextPublicId(
                    $pdo,
                    $structureId !== null && $structureId > 0 ? $structureId : null,
                    $typeId !== null && $typeId > 0 ? $typeId : null
                ),
            ]);
        }
        $publicId = trim((string)($_GET['public_id'] ?? ''));
        if ($publicId !== '') {
            $typeId = isset($_GET['type_id']) ? (int)$_GET['type_id'] : 0;
            $matches = portailClubMaterielListEquipmentByPublicId(
                $pdo,
                $publicId,
                $typeId > 0 ? $typeId : null
            );
            if ($matches === []) {
                portailClubJsonFail('Matériel introuvable.', 404);
            }
            portailClubJsonOk([
                'equipment' => count($matches) === 1 ? $matches[0] : null,
                'matches' => $matches,
            ]);
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
            'nfc_linked' => $_GET['nfc_linked'] ?? '',
            'compliance' => $_GET['compliance'] ?? '',
        ];
        if (!empty($_GET['unpaired'])) {
            $filters['unpaired'] = true;
        }
        if (isset($_GET['limit']) || !isset($_GET['all'])) {
            $filters['page'] = max(1, (int)($_GET['page'] ?? 1));
            $filters['limit'] = PORTAIL_CLUB_MATERIEL_LIST_PAGE_SIZE;
            $result = portailClubMaterielListEquipment($pdo, $filters);
            portailClubJsonOk([
                'equipment' => $result['items'],
                'pagination' => $result['pagination'],
            ]);
        }
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
            $memberIds = is_array($body['member_ids'] ?? null) ? $body['member_ids'] : [];
            portailClubJsonOk(['equipment' => portailClubMaterielLinkNfc($pdo, $id, $memberIds)]);
        }
        if ($action === 'add_to_nfc_group') {
            $id = portailClubIntParam($body['equipment_id'] ?? null, 'equipment_id');
            $addId = portailClubIntParam($body['add_equipment_id'] ?? null, 'add_equipment_id');
            portailClubJsonOk(['equipment' => portailClubMaterielAddToNfcGroup($pdo, $id, $addId)]);
        }
        if ($action === 'remove_from_nfc_group') {
            $id = portailClubIntParam($body['equipment_id'] ?? null, 'equipment_id');
            portailClubJsonOk(['equipment' => portailClubMaterielRemoveFromNfcGroup($pdo, $id)]);
        }
        if ($action === 'unlink_nfc') {
            $id = portailClubIntParam($body['equipment_id'] ?? null, 'equipment_id');
            portailClubJsonOk(['equipment' => portailClubMaterielUnlinkNfc($pdo, $id)]);
        }
        if ($action === 'link_pair') {
            $id = portailClubIntParam($body['equipment_id'] ?? null, 'equipment_id');
            $partnerId = portailClubIntParam($body['partner_equipment_id'] ?? null, 'partner_equipment_id');
            portailClubJsonOk(['equipment' => portailClubMaterielLinkPair($pdo, $id, $partnerId)]);
        }
        if ($action === 'unlink_pair') {
            $id = portailClubIntParam($body['equipment_id'] ?? null, 'equipment_id');
            portailClubJsonOk(['equipment' => portailClubMaterielUnlinkPair($pdo, $id)]);
        }
        if ($action === 'set_renewal_flag') {
            $id = portailClubIntParam($body['equipment_id'] ?? null, 'equipment_id');
            $flagged = !empty($body['flagged']);
            portailClubJsonOk(['equipment' => portailClubMaterielSetRenewalFlag($pdo, $id, $flagged)]);
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
