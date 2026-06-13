<?php
declare(strict_types=1);

/**
 * Recalcule health_score pour tout le parc (politique health_score).
 * Usage : php site/tools/backfill_materiel_health_scores.php
 */

require_once __DIR__ . '/../lib/db.inc.php';
require_once __DIR__ . '/../lib/materiel.inc.php';

$pdo = portailClubGetPdo();
$st = $pdo->query(
    "SELECT e.id FROM PORTAIL_CLUB_materiel_equipment e
     JOIN PORTAIL_CLUB_materiel_equipment_types t ON t.id = e.type_id
     WHERE t.renewal_policy = 'health_score'"
);
$ids = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
$n = 0;
foreach ($ids as $id) {
    portailClubMaterielRecomputeHealthScore($pdo, $id);
    $n++;
}
echo "Backfill health_score : {$n} équipement(s)\n";
