<?php
declare(strict_types=1);

/**
 * Nettoyage manuel des traces E2E en base — usage :
 * php tools/cleanup_e2e.php
 * NAS : /usr/local/bin/php82 /volume1/web/portailClub/tools/cleanup_e2e.php
 */
require_once __DIR__ . '/../lib/db.inc.php';
require_once __DIR__ . '/e2e_cleanup.inc.php';

$pdo = portailClubGetPdo();
$result = e2eCleanupAll($pdo);

echo 'Formations E2E supprimées : ' . $result['formations'] . "\n";
echo 'Moniteurs E2E supprimés : ' . $result['instructors'] . "\n";
