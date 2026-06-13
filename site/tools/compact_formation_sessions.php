<?php
declare(strict_types=1);

/**
 * Supprime les séances vides et renumérote 1…n par formation.
 * NAS : /usr/local/bin/php82 /volume1/web/portailClub/tools/compact_formation_sessions.php [formation_id]
 */
require_once __DIR__ . '/../lib/db.inc.php';
require_once __DIR__ . '/../lib/formations.inc.php';

$formationId = isset($argv[1]) ? (int)$argv[1] : 0;

try {
    $pdo = portailClubGetPdo();
    if ($formationId > 0) {
        $purged = portailClubPurgeEmptyFormationSessions($pdo, $formationId);
        $renumbered = portailClubCompactFormationSessionNumbers($pdo, $formationId);
        echo "Formation #{$formationId} : {$purged} séance(s) vide(s) supprimée(s), {$renumbered} renumérotée(s).\n";
    } else {
        $result = portailClubCompactAllFormationSessions($pdo);
        echo "Compact global : {$result['purged']} vide(s), {$result['renumbered']} séance(s) sur "
            . $result['formations'] . " formation(s).\n";
    }
} catch (Throwable $e) {
    fwrite(STDERR, 'Erreur : ' . $e->getMessage() . "\n");
    exit(1);
}
