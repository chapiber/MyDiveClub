<?php
declare(strict_types=1);

/**
 * Fusionne les compétences catalogue en double (legacy + codes normalisés).
 * Usage NAS : /usr/local/bin/php82 /volume1/web/portailClub/tools/dedupe_catalog.php
 */
require_once __DIR__ . '/../lib/db.inc.php';
require_once __DIR__ . '/../lib/formations.inc.php';

try {
    $pdo = portailClubGetPdo();
    $dedupe = portailClubDedupeCatalogSkills($pdo);
    echo "Dedupe : {$dedupe['merged']} fusion(s) sur {$dedupe['levels']} niveau(x).\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'Erreur : ' . $e->getMessage() . "\n");
    exit(1);
}
