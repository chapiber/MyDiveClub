<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../lib/db.inc.php';
require_once __DIR__ . '/../../lib/materiel.inc.php';

try {
    portailClubRequireMethod('GET');
    $pdo = portailClubGetPdo();
    $structureIds = portailClubMaterielParseStructureIds($_GET['structure_ids'] ?? null);
    $summary = portailClubMaterielGetComplianceSummary($pdo, $structureIds);
    portailClubJsonOk($summary);
} catch (Throwable $e) {
    portailClubJsonFail($e->getMessage(), 500);
}
