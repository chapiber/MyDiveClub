<?php
declare(strict_types=1);

/**
 * Migrations Portail Club — usage NAS :
 * /usr/local/bin/php82 /volume1/web/portailClub/tools/migrate.php
 *
 * Chaque fichier sql/<version>.sql est exécuté une seule fois (PORTAIL_CLUB_schema_migrations).
 */
require_once __DIR__ . '/../lib/db.inc.php';

$sqlDir = __DIR__ . '/../sql';
$files = glob($sqlDir . '/*.sql') ?: [];
sort($files);

if ($files === []) {
    fwrite(STDERR, "Aucun fichier SQL.\n");
    exit(1);
}

try {
    $pdo = portailClubGetPdo();
    $stApplied = $pdo->prepare(
        'SELECT 1 FROM PORTAIL_CLUB_schema_migrations WHERE version = ? LIMIT 1'
    );
    $stMark = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_schema_migrations (version)
         SELECT ? FROM DUAL
         WHERE NOT EXISTS (
           SELECT 1 FROM PORTAIL_CLUB_schema_migrations WHERE version = ?
         )'
    );

    foreach ($files as $file) {
        $version = basename($file, '.sql');
        $stApplied->execute([$version]);
        if ($stApplied->fetchColumn()) {
            echo "SKIP {$version}\n";
            continue;
        }

        $sql = file_get_contents($file);
        if ($sql === false) {
            throw new RuntimeException('Lecture impossible : ' . $file);
        }
        $sql = preg_replace('/^\s*USE\s+\w+\s*;\s*/im', '', $sql) ?? $sql;
        $pdo->exec($sql);
        $stMark->execute([$version, $version]);
        echo "OK {$version}\n";
    }
    echo "Migrations terminees.\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'Erreur : ' . $e->getMessage() . "\n");
    exit(1);
}
