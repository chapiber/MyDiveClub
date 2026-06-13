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
            if (isset($_GET['skill_status']) && (string)$_GET['skill_status'] === '1') {
                portailClubJsonOk(['report' => portailClubGetFormationSkillStatus($pdo, $id)]);
            }
            portailClubJsonOk(['formation' => portailClubGetFormationDetail($pdo, $id)]);
        }
        $status = trim((string)($_GET['status'] ?? ''));
        if ($status === 'archived') {
            $sessionDate = trim((string)($_GET['session_date'] ?? ''));
            if ($sessionDate === '') {
                portailClubJsonFail('Date obligatoire.', 400);
            }
            $instructor = trim((string)($_GET['instructor'] ?? ''));
            $student = trim((string)($_GET['student'] ?? ''));
            portailClubJsonOk([
                'formations' => portailClubSearchArchivedFormations(
                    $pdo,
                    $sessionDate,
                    $instructor !== '' ? $instructor : null,
                    $student !== '' ? $student : null
                ),
            ]);
        }
        portailClubJsonOk([
            'formations' => portailClubListFormations($pdo, $status !== '' ? $status : null),
        ]);
    }

    if ($method === 'POST') {
        $body = portailClubReadJsonBody();
        $action = strtolower(trim((string)($body['action'] ?? 'create')));

        if ($action === 'close') {
            $id = portailClubIntParam($body['formation_id'] ?? $_GET['id'] ?? null, 'formation_id');
            portailClubJsonOk(['formation' => portailClubCloseFormation($pdo, $id, $body)]);
        }

        if ($action === 'update_curricula') {
            $id = portailClubIntParam($body['formation_id'] ?? $_GET['id'] ?? null, 'formation_id');
            portailClubJsonOk(['formation' => portailClubUpdateFormationCurricula($pdo, $id, $body)]);
        }

        if ($action === 'restore') {
            $id = portailClubIntParam($body['formation_id'] ?? $_GET['id'] ?? null, 'formation_id');
            portailClubJsonOk(['formation' => portailClubRestoreFormation($pdo, $id)]);
        }

        portailClubJsonOk(['formation' => portailClubCreateFormation($pdo, $body)]);
    }

    portailClubJsonFail('Méthode non autorisée.', 405);
} catch (Throwable $e) {
    portailClubJsonFail($e->getMessage(), 500);
}
