<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../lib/db.inc.php';
require_once __DIR__ . '/../../lib/ipd.inc.php';

try {
    portailClubRequireMethod('GET');
    $pdo = portailClubGetPdo();
    $id = portailClubIntParam($_GET['id'] ?? null, 'id');
    portailClubJsonOk(['session' => portailClubIpdGetSession($pdo, $id)]);
} catch (Throwable $e) {
    portailClubJsonFail($e->getMessage(), 500);
}
