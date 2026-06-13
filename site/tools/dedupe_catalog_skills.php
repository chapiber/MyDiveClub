<?php
declare(strict_types=1);

/**
 * Fusionne les compétences en doublon par niveau (catalogue).
 * NAS : /usr/local/bin/php82 /volume1/web/portailClub/tools/dedupe_catalog_skills.php
 */
require_once __DIR__ . '/../lib/db.inc.php';
require_once __DIR__ . '/../lib/formations.inc.php';

$levelId = isset($argv[1]) ? (int)$argv[1] : null;

try {
    $pdo = portailClubGetPdo();
    $result = portailClubDedupeCatalogSkills($pdo, $levelId > 0 ? $levelId : null);
    echo 'Dedupe termine : ' . $result['merged'] . ' fusion(s) sur '
        . $result['levels'] . " niveau(x).\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'Erreur : ' . $e->getMessage() . "\n");
    exit(1);
}
