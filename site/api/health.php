<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

try {
    require_once __DIR__ . '/../lib/db.inc.php';
    $pdo = portailClubGetPdo();
    $row = $pdo->query('SELECT client_id, public_url FROM PORTAIL_CLUB_spaces LIMIT 1')->fetch();
    echo json_encode([
        'ok' => true,
        'service' => 'portailClub',
        'db' => 'connected',
        'space' => $row ?: null,
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(503);
    echo json_encode([
        'ok' => false,
        'service' => 'portailClub',
        'error' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}
