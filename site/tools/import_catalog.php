<?php
declare(strict_types=1);

/**
 * Import catalogue formations depuis data/catalog/*.json
 * Usage NAS : /usr/local/bin/php82 /volume1/web/portailClub/tools/import_catalog.php
 */
require_once __DIR__ . '/../lib/db.inc.php';
require_once __DIR__ . '/../lib/formations.inc.php';

$catalogDir = __DIR__ . '/../data/catalog';
$files = glob($catalogDir . '/*.json') ?: [];
sort($files);

if ($files === []) {
    fwrite(STDERR, "Aucun fichier JSON dans {$catalogDir}\n");
    exit(1);
}

try {
    $pdo = portailClubGetPdo();
    $totals = ['files' => 0, 'orgs' => 0, 'levels' => 0, 'skills' => 0];

    foreach ($files as $file) {
        $stats = portailClubImportCatalogFile($pdo, $file);
        $totals['files']++;
        $totals['orgs'] += $stats['orgs'];
        $totals['levels'] += $stats['levels'];
        $totals['skills'] += $stats['skills'];
        echo 'OK ' . basename($file)
            . " — niveaux {$stats['levels']}, compétences {$stats['skills']}\n";
    }

    echo "Import termine : {$totals['files']} fichier(s), "
        . "{$totals['levels']} niveau(x), {$totals['skills']} compétence(s).\n";

    $dedupe = portailClubDedupeCatalogSkills($pdo);
    echo "Dedupe post-import : {$dedupe['merged']} fusion(s) sur {$dedupe['levels']} niveau(x).\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'Erreur : ' . $e->getMessage() . "\n");
    exit(1);
}
