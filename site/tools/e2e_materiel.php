<?php
declare(strict_types=1);

/**
 * Smoke test backend Suivi Matériel — usage local ou NAS :
 * php site/tools/e2e_materiel.php
 */
require_once __DIR__ . '/../lib/db.inc.php';
require_once __DIR__ . '/../lib/materiel.inc.php';

$failures = 0;

function assertTrue(bool $cond, string $msg): void
{
    global $failures;
    if ($cond) {
        echo "OK  {$msg}\n";
        return;
    }
    $failures++;
    echo "KO  {$msg}\n";
}

try {
    $pdo = portailClubGetPdo();

    $settings = portailClubMaterielGetSettings($pdo);
    assertTrue(array_key_exists('nfc_enabled', $settings), 'settings nfc_enabled');
    assertTrue(($settings['id_prefix'] ?? '') !== '', 'settings id_prefix');

    $structures = portailClubMaterielListStructures($pdo, true);
    assertTrue(count($structures) >= 1, 'structures seed');

    $roles = portailClubMaterielListRoles($pdo);
    assertTrue(count($roles) >= 3, 'roles seed');

    $catalog = portailClubMaterielGetCatalog($pdo);
    assertTrue(count($catalog['types']) >= 5, 'types seed');

    $publicId = 'E2E-' . date('YmdHis');
    $structId = (int)$structures[0]['id'];
    $typeId = (int)$catalog['types'][0]['id'];

    $created = portailClubMaterielCreateEquipment($pdo, [
        'public_id' => $publicId,
        'structure_id' => $structId,
        'type_id' => $typeId,
        'brand' => 'TestBrand',
        'purchase_year' => 2020,
    ]);
    assertTrue($created['public_id'] === $publicId, 'create equipment');

    $publicIdNone = 'E2E-N-' . date('YmdHis');
    $createdNone = portailClubMaterielCreateEquipment($pdo, [
        'public_id' => $publicIdNone,
        'type_id' => $typeId,
        'brand' => 'Orphelin',
    ]);
    assertTrue($createdNone['structure_id'] === null, 'create equipment sans structure');

    $person = portailClubMaterielCreatePerson($pdo, [
        'display_name' => 'E2E Testeur',
        'role_ids' => [$roles[0]['id']],
    ]);
    assertTrue($person['display_name'] === 'E2E Testeur', 'create person');

    portailClubMaterielChangeEquipmentState($pdo, (int)$created['id'], [
        'state' => 'in_repair',
        'person_id' => $person['id'],
    ]);
    $updated = portailClubMaterielGetEquipment($pdo, (int)$created['id']);
    assertTrue($updated['state'] === 'in_repair', 'change state');

    portailClubMaterielSetNfcLinked($pdo, (int)$created['id'], true);
    $linked = portailClubMaterielGetEquipment($pdo, (int)$created['id']);
    assertTrue($linked['nfc_linked'] === true, 'link nfc');

    $stats = portailClubMaterielGetStats($pdo, [$structId]);
    assertTrue($stats['total'] >= 1, 'stats total');

    $csv = portailClubMaterielExportCsv($pdo, [$structId]);
    assertTrue(str_contains($csv, $publicId), 'export csv');

    $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_equipment WHERE id = ?')->execute([(int)$created['id']]);
    $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_equipment WHERE id = ?')->execute([(int)$createdNone['id']]);
    $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_persons WHERE id = ?')->execute([(int)$person['id']]);

    echo $failures === 0 ? "Smoke test materiel : SUCCES\n" : "Smoke test materiel : ECHECS ({$failures})\n";
    exit($failures === 0 ? 0 : 1);
} catch (Throwable $e) {
    fwrite(STDERR, 'Erreur : ' . $e->getMessage() . "\n");
    exit(1);
}
