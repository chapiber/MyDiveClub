<?php
declare(strict_types=1);

require_once __DIR__ . '/../../lib/db.inc.php';
require_once __DIR__ . '/../../lib/materiel.inc.php';

try {
    portailClubRequireMethod('GET');
    $pdo = portailClubGetPdo();
    $structureIds = portailClubMaterielParseStructureIds($_GET['structure_ids'] ?? null);
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="materiel-export-' . date('Y-m-d') . '.csv"');
    echo portailClubMaterielExportCsv($pdo, $structureIds);
} catch (Throwable $e) {
    header('Content-Type: application/json; charset=utf-8');
    portailClubJsonFail($e->getMessage(), 500);
}
