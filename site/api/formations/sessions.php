<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../lib/db.inc.php';
require_once __DIR__ . '/../../lib/formations.inc.php';

try {
    $pdo = portailClubGetPdo();
    $method = portailClubRequestMethod();

    if ($method === 'GET') {
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if ($id > 0) {
            portailClubJsonOk(['session' => portailClubGetSessionDetail($pdo, $id)]);
        }

        $formationId = isset($_GET['formation_id']) ? (int)$_GET['formation_id'] : 0;
        if ($formationId > 0) {
            $detail = portailClubGetFormationDetail($pdo, $formationId);
            portailClubJsonOk(['sessions' => $detail['sessions']]);
        }

        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;
        portailClubJsonOk(['sessions' => portailClubListRecentSessions($pdo, $limit)]);
    }

    if ($method === 'POST') {
        $body = portailClubReadJsonBody();
        $action = strtolower(trim((string)($body['action'] ?? 'create')));

        if ($action === 'save_evaluations') {
            $sessionId = isset($body['session_id']) ? (int)$body['session_id'] : 0;
            if ($sessionId > 0) {
                portailClubJsonOk(['session' => portailClubSaveSessionEvaluations($pdo, $sessionId, $body)]);
            }
            $formationId = portailClubIntParam($body['formation_id'] ?? null, 'formation_id');
            portailClubJsonOk(['session' => portailClubCreateSessionWithEvaluations($pdo, $formationId, $body)]);
        }

        if ($action === 'save_catchup') {
            $formationId = portailClubIntParam($body['formation_id'] ?? null, 'formation_id');
            portailClubJsonOk(portailClubCreateCatchupSessions($pdo, $formationId, $body));
        }

        if ($action === 'delete') {
            $sessionId = portailClubIntParam($body['session_id'] ?? null, 'session_id');
            portailClubJsonOk(['formation' => portailClubDeleteSession($pdo, $sessionId)]);
        }

        portailClubJsonFail('Action inconnue.', 400);
    }

    portailClubJsonFail('Méthode non autorisée.', 405);
} catch (Throwable $e) {
    portailClubJsonFail($e->getMessage(), 500);
}
