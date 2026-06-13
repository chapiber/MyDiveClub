<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../lib/db.inc.php';
require_once __DIR__ . '/../../lib/formations.inc.php';

try {
    $pdo = portailClubGetPdo();
    $method = portailClubRequestMethod();

    if ($method === 'GET') {
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 12;
        portailClubJsonOk(['instructors' => portailClubListRecentInstructors($pdo, $limit)]);
    }

    if ($method === 'POST') {
        $body = portailClubReadJsonBody();
        portailClubTouchInstructor($pdo, (string)($body['first_name'] ?? ''));
        portailClubJsonOk(['instructors' => portailClubListRecentInstructors($pdo)]);
    }

    portailClubJsonFail('Méthode non autorisée.', 405);
} catch (Throwable $e) {
    portailClubJsonFail($e->getMessage(), 500);
}
