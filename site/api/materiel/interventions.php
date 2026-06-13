<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../lib/db.inc.php';
require_once __DIR__ . '/../../lib/materiel.inc.php';

try {
    $pdo = portailClubGetPdo();
    $method = portailClubRequestMethod();

    if ($method === 'GET') {
        $equipmentId = isset($_GET['equipment_id']) ? (int)$_GET['equipment_id'] : 0;
        if ($equipmentId > 0) {
            portailClubJsonOk(['interventions' => portailClubMaterielListInterventions($pdo, $equipmentId)]);
        }
        portailClubJsonOk(['interventions' => portailClubMaterielListInterventions($pdo)]);
    }

    if ($method === 'POST') {
        $body = portailClubReadJsonBody();
        portailClubJsonOk(['intervention' => portailClubMaterielCreateIntervention($pdo, $body)]);
    }

    portailClubJsonFail('Méthode non autorisée.', 405);
} catch (Throwable $e) {
    portailClubJsonFail($e->getMessage(), 500);
}
