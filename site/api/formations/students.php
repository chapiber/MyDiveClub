<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../lib/db.inc.php';
require_once __DIR__ . '/../../lib/formations.inc.php';

try {
    portailClubRequireMethod('GET');
    $pdo = portailClubGetPdo();
    $formationId = portailClubIntParam($_GET['formation_id'] ?? null, 'formation_id');
    $detail = portailClubGetFormationDetail($pdo, $formationId);
    portailClubJsonOk(['students' => $detail['students']]);
} catch (Throwable $e) {
    portailClubJsonFail($e->getMessage(), 500);
}
