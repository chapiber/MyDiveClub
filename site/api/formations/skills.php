<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../lib/db.inc.php';
require_once __DIR__ . '/../../lib/formations.inc.php';

try {
    $pdo = portailClubGetPdo();
    $method = portailClubRequestMethod();

    if ($method === 'GET') {
        $levelId = portailClubIntParam($_GET['level_id'] ?? null, 'level_id');
        portailClubJsonOk(portailClubListLevelSkills($pdo, $levelId));
    }

    if ($method === 'POST') {
        $body = portailClubReadJsonBody();
        if (($body['action'] ?? '') === 'dedupe') {
            $levelId = portailClubIntParam($body['level_id'] ?? null, 'level_id');
            $result = portailClubDedupeLevelSkills($pdo, $levelId);
            portailClubJsonOk($result);
        }
        if (($body['action'] ?? '') === 'reorder') {
            $levelId = portailClubIntParam($body['level_id'] ?? null, 'level_id');
            $skillIds = $body['skill_ids'] ?? $body['ordered_ids'] ?? null;
            if (!is_array($skillIds)) {
                portailClubJsonFail('skill_ids requis (tableau d\'identifiants).');
            }
            $result = portailClubReorderLevelSkills($pdo, $levelId, $skillIds);
            portailClubJsonOk($result);
        }
        portailClubJsonFail('Action inconnue.', 400);
    }

    if ($method === 'PATCH') {
        $body = portailClubReadJsonBody();
        $skillId = portailClubIntParam($body['id'] ?? $_GET['id'] ?? null, 'id');
        $skill = portailClubUpdateCatalogSkill($pdo, $skillId, $body);
        portailClubJsonOk(['skill' => $skill]);
    }

    if ($method === 'DELETE') {
        $body = portailClubReadJsonBody();
        $skillId = portailClubIntParam($body['id'] ?? $_GET['id'] ?? null, 'id');
        portailClubDeleteCatalogSkill($pdo, $skillId);
        portailClubJsonOk(['deleted' => true]);
    }

    portailClubJsonFail('Méthode non autorisée.', 405);
} catch (Throwable $e) {
    portailClubJsonFail($e->getMessage(), 500);
}
