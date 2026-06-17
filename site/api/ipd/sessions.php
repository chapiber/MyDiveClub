<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../lib/db.inc.php';
require_once __DIR__ . '/../../lib/ipd.inc.php';

try {
    $pdo = portailClubGetPdo();
    $method = portailClubRequestMethod();

    if ($method === 'GET') {
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 50;
        $studentId = isset($_GET['student_id']) ? (int)$_GET['student_id'] : null;
        $formationSessionId = isset($_GET['formation_session_id']) ? (int)$_GET['formation_session_id'] : null;
        if ($studentId !== null && $studentId < 1) {
            $studentId = null;
        }
        if ($formationSessionId !== null && $formationSessionId < 1) {
            $formationSessionId = null;
        }
        portailClubJsonOk([
            'sessions' => portailClubIpdListSessions($pdo, $limit, $studentId, $formationSessionId),
        ]);
    }

    if ($method === 'POST') {
        $body = portailClubReadJsonBody();
        $session = portailClubIpdUpsertSession($pdo, $body);
        portailClubJsonOk(['session' => $session]);
    }

    portailClubJsonFail('Méthode non autorisée.', 405);
} catch (Throwable $e) {
    portailClubJsonFail($e->getMessage(), 500);
}
