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

    $typeId2 = (int)$catalog['types'][1]['id'];
    $createdSameId = portailClubMaterielCreateEquipment($pdo, [
        'public_id' => $publicId,
        'structure_id' => $structId,
        'type_id' => $typeId2,
        'brand' => 'TestBrand2',
    ]);
    assertTrue($createdSameId['public_id'] === $publicId, 'create equipment same id other type');
    assertTrue((int)$createdSameId['type_id'] === $typeId2, 'create equipment other type id');

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
    assertTrue(isset($stats['by_nfc']['linked']) && $stats['by_nfc']['linked'] >= 1, 'stats nfc linked');

    $linkedList = portailClubMaterielListEquipment($pdo, ['structure_ids' => [$structId], 'nfc_linked' => 'linked']);
    assertTrue(count($linkedList) >= 1 && $linkedList[0]['public_id'] === $publicId, 'filter nfc linked');

    $bottleType = null;
    foreach ($catalog['types'] as $t) {
        if (($t['slug'] ?? '') === 'bottle') {
            $bottleType = $t;
            break;
        }
    }
    if ($bottleType !== null) {
        $pairA = 'E2E-BA-' . date('His');
        $pairB = 'E2E-BB-' . date('His');
        $eqA = portailClubMaterielCreateEquipment($pdo, [
            'public_id' => $pairA,
            'structure_id' => $structId,
            'type_id' => (int)$bottleType['id'],
            'brand' => 'Faber',
        ]);
        $eqB = portailClubMaterielCreateEquipment($pdo, [
            'public_id' => $pairB,
            'structure_id' => $structId,
            'type_id' => (int)$bottleType['id'],
            'brand' => 'Faber',
        ]);
        portailClubMaterielLinkNfc($pdo, (int)$eqA['id'], [(int)$eqB['id']]);
        $grouped = portailClubMaterielGetEquipment($pdo, (int)$eqA['id']);
        assertTrue($grouped['nfc_linked'] === true, 'nfc group linked primary');
        assertTrue(count($grouped['nfc_group_members'] ?? []) === 2, 'nfc group members count');
        assertTrue(($grouped['nfc_group_size'] ?? 0) === 2, 'nfc group size');
        $eqBLinked = portailClubMaterielGetEquipment($pdo, (int)$eqB['id']);
        assertTrue($eqBLinked['nfc_linked'] === true, 'nfc group linked secondary');
        assertTrue((int)$eqBLinked['nfc_group_id'] === (int)$grouped['nfc_group_id'], 'nfc group same id');
        portailClubMaterielUnlinkNfc($pdo, (int)$eqA['id']);
        $eqAUnlinked = portailClubMaterielGetEquipment($pdo, (int)$eqA['id']);
        $eqBUnlinked = portailClubMaterielGetEquipment($pdo, (int)$eqB['id']);
        assertTrue($eqAUnlinked['nfc_linked'] === false, 'nfc group unlink primary');
        assertTrue($eqBUnlinked['nfc_linked'] === false, 'nfc group unlink secondary');
        $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_equipment WHERE id IN (?, ?)')->execute([(int)$eqA['id'], (int)$eqB['id']]);
    } else {
        echo "SKIP nfc group (type bottle absent)\n";
    }

    if ($bottleType !== null) {
        $logA = 'E2E-LA-' . date('His');
        $logB = 'E2E-LB-' . date('His');
        $logEqA = portailClubMaterielCreateEquipment($pdo, [
            'public_id' => $logA,
            'structure_id' => $structId,
            'type_id' => (int)$bottleType['id'],
            'brand' => 'Faber',
        ]);
        $logEqB = portailClubMaterielCreateEquipment($pdo, [
            'public_id' => $logB,
            'structure_id' => $structId,
            'type_id' => (int)$bottleType['id'],
            'brand' => 'Faber',
        ]);
        portailClubMaterielSetNfcLinked($pdo, (int)$logEqA['id'], true);
        portailClubMaterielSetNfcLinked($pdo, (int)$logEqB['id'], true);
        portailClubMaterielLinkPair($pdo, (int)$logEqA['id'], (int)$logEqB['id']);
        $paired = portailClubMaterielGetEquipment($pdo, (int)$logEqA['id']);
        assertTrue($paired['pair_id'] !== null && $paired['pair_id'] > 0, 'equipment pair id');
        assertTrue(($paired['pair_partner']['public_id'] ?? '') === $logB, 'equipment pair partner');
        assertTrue($paired['nfc_linked'] === true, 'equipment pair keeps nfc');
        portailClubMaterielUnlinkPair($pdo, (int)$logEqA['id']);
        $unpaired = portailClubMaterielGetEquipment($pdo, (int)$logEqA['id']);
        assertTrue($unpaired['pair_partner'] === null, 'equipment pair unlink');
        $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_equipment WHERE id IN (?, ?)')->execute([(int)$logEqA['id'], (int)$logEqB['id']]);
    } else {
        echo "SKIP equipment pair (type bottle absent)\n";
    }

    $csv = portailClubMaterielExportCsv($pdo, [$structId]);
    assertTrue(str_contains($csv, $publicId), 'export csv');

    $maskType = null;
    $regType = null;
    foreach ($catalog['types'] as $t) {
        if (($t['slug'] ?? '') === 'mask') {
            $maskType = $t;
        }
        if (($t['slug'] ?? '') === 'regulator') {
            $regType = $t;
        }
    }
    if ($maskType !== null && count($maskType['checks'] ?? []) >= 3) {
        $maskId = 'E2E-M-' . date('His');
        $maskEq = portailClubMaterielCreateEquipment($pdo, [
            'public_id' => $maskId,
            'structure_id' => $structId,
            'type_id' => (int)$maskType['id'],
            'brand' => 'E2E',
        ]);
        $maskInt = portailClubMaterielCreateIntervention($pdo, [
            'equipment_id' => $maskEq['id'],
            'subtype' => 'revision',
            'done_on' => date('Y-m-d'),
            'responsible_free' => 'E2E Testeur',
            'check_values' => [
                'jupe' => 'ras',
                'sangle_boucles' => 'mineure',
                'verres' => 'ras',
            ],
        ]);
        assertTrue($maskInt['check_values']['jupe'] === 'ras', 'grading intervention jupe');
        assertTrue($maskInt['check_values']['sangle_boucles'] === 'mineure', 'grading intervention sangle');
        $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_equipment WHERE id = ?')->execute([(int)$maskEq['id']]);
    } else {
        echo "SKIP grading mask (type ou grille absente)\n";
    }

    if ($regType !== null) {
        $regId = 'E2E-R-' . date('His');
        $regEq = portailClubMaterielCreateEquipment($pdo, [
            'public_id' => $regId,
            'structure_id' => $structId,
            'type_id' => (int)$regType['id'],
            'brand' => 'AQUALUNG',
        ]);
        portailClubMaterielPatchEquipment($pdo, (int)$regEq['id'], [
            'specs_json' => [
                'model_hp' => 'VRT',
                'serial_hp' => 'HP123',
                'product_label' => 'Detendeur test',
            ],
        ]);
        $regPatched = portailClubMaterielGetEquipment($pdo, (int)$regEq['id']);
        assertTrue(($regPatched['specs_json']['serial_hp'] ?? '') === 'HP123', 'regulator specs_json');

        $regInt = portailClubMaterielCreateIntervention($pdo, [
            'equipment_id' => $regEq['id'],
            'subtype' => 'revision',
            'done_on' => date('Y-m-d'),
            'responsible_free' => 'E2E Testeur',
            'detail_json' => [
                'tasks' => ['maint_hp' => true, 'maint_mp' => false],
                'observations' => 'Test e2e',
                'test_values' => ['hp_test' => 200],
            ],
        ]);
        assertTrue(is_array($regInt['detail_json']), 'regulator detail_json');
        assertTrue(($regInt['detail_json']['tasks']['maint_hp'] ?? false) === true, 'regulator maint_hp');
        $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_equipment WHERE id = ?')->execute([(int)$regEq['id']]);
    } else {
        echo "SKIP regulator (type absent)\n";
    }

    $typeTest = portailClubMaterielCreateEquipmentType($pdo, [
        'label' => 'E2E Type Test',
        'slug' => 'e2e_type_' . date('His'),
        'trackable' => true,
    ]);
    assertTrue($typeTest['label'] === 'E2E Type Test', 'create equipment type');

    $typePatched = portailClubMaterielPatchEquipmentType($pdo, (int)$typeTest['id'], [
        'label' => 'E2E Type Modifié',
    ]);
    assertTrue($typePatched['label'] === 'E2E Type Modifié', 'patch equipment type');

    portailClubMaterielDeleteEquipmentType($pdo, (int)$typeTest['id']);
    assertTrue(true, 'delete equipment type');

    $bcdType = null;
    foreach ($catalog['types'] as $t) {
        if (($t['slug'] ?? '') === 'bcd') {
            $bcdType = $t;
            break;
        }
    }
    if ($bcdType !== null) {
        $compId = 'E2E-C-' . date('His');
        $compEq = portailClubMaterielCreateEquipment($pdo, [
            'public_id' => $compId,
            'structure_id' => $structId,
            'type_id' => (int)$bcdType['id'],
            'purchase_year' => 2010,
        ]);
        $listed = portailClubMaterielListEquipment($pdo, ['compliance' => 'revision_due']);
        $foundRevision = false;
        foreach ($listed as $row) {
            if ((int)$row['id'] === (int)$compEq['id']) {
                $foundRevision = !empty($row['revision_due']);
                break;
            }
        }
        assertTrue($foundRevision, 'compliance revision_due sans intervention');

        $checkValues = [];
        foreach ($bcdType['checks'] ?? [] as $check) {
            $key = (string)($check['field_key'] ?? '');
            if ($key === '') {
                continue;
            }
            $checkValues[$key] = ($check['input_type'] ?? '') === 'select_grading' ? 'ras' : 'OK';
        }
        if ($checkValues !== []) {
            portailClubMaterielCreateIntervention($pdo, [
                'equipment_id' => (int)$compEq['id'],
                'subtype' => 'revision',
                'done_on' => date('Y-m-d'),
                'responsible_free' => 'E2E Testeur',
                'check_values' => $checkValues,
            ]);
            $afterRev = portailClubMaterielListEquipment($pdo, ['compliance' => 'revision_due']);
            $stillDue = false;
            foreach ($afterRev as $row) {
                if ((int)$row['id'] === (int)$compEq['id']) {
                    $stillDue = true;
                    break;
                }
            }
            assertTrue(!$stillDue, 'compliance revision_due après révision récente');

            $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_interventions WHERE equipment_id = ?')->execute([(int)$compEq['id']]);
            portailClubMaterielCreateIntervention($pdo, [
                'equipment_id' => (int)$compEq['id'],
                'subtype' => 'revision',
                'done_on' => ((int)date('Y') - 1) . '-06-01',
                'responsible_free' => 'E2E Testeur',
                'check_values' => $checkValues,
            ]);
            $oldYearListed = portailClubMaterielListEquipment($pdo, ['compliance' => 'revision_due']);
            $dueAfterOldYear = false;
            foreach ($oldYearListed as $row) {
                if ((int)$row['id'] === (int)$compEq['id']) {
                    $dueAfterOldYear = !empty($row['revision_due']);
                    break;
                }
            }
            assertTrue($dueAfterOldYear, 'compliance revision_due si dernière révision année précédente');
        } else {
            echo "SKIP revision récente compliance (grille bcd absente)\n";
        }

        $renewListed = portailClubMaterielListEquipment($pdo, ['compliance' => 'renewal_due']);
        $foundRenewal = false;
        foreach ($renewListed as $row) {
            if ((int)$row['id'] === (int)$compEq['id']) {
                $foundRenewal = !empty($row['renewal_due']);
                break;
            }
        }
        assertTrue($foundRenewal, 'compliance renewal_due purchase_year ancien (constructeur)');

        portailClubMaterielSetRenewalFlag($pdo, (int)$compEq['id'], true);
        $flagged = portailClubMaterielGetEquipment($pdo, (int)$compEq['id']);
        assertTrue(!empty($flagged['renewal_due']), 'renewal_flagged manuel');

        $paginated = portailClubMaterielListEquipment($pdo, ['limit' => 100, 'page' => 1]);
        assertTrue(isset($paginated['pagination']['total']), 'pagination liste parc');

        $summary = portailClubMaterielGetComplianceSummary($pdo, []);
        assertTrue(isset($summary['counts']['revision_due']), 'compliance summary counts');
        assertTrue(is_array($summary['items']), 'compliance summary items');

        $stats = portailClubMaterielGetStats($pdo, []);
        assertTrue(isset($stats['by_type_model']) && is_array($stats['by_type_model']), 'stats by_type_model');
        assertTrue(isset($stats['compliance']['revision_due']), 'stats compliance');

        $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_equipment WHERE id = ?')->execute([(int)$compEq['id']]);
    } else {
        echo "SKIP compliance (type bcd absent)\n";
    }

    $locations = portailClubMaterielListLocations($pdo, true);
    assertTrue(count($locations) >= 6, 'locations seed (6 lieux)');

    $register = portailClubMaterielGetSecurityRegister($pdo);
    assertTrue(isset($register['matrix']) && count($register['matrix']) >= 6, 'security register matrix');
    assertTrue(($register['alert_count'] ?? 0) >= 1, 'security alert count (Rederis O2)');

    $caimanLoc = null;
    foreach ($locations as $loc) {
        if ($loc['slug'] === 'caiman') {
            $caimanLoc = $loc;
            break;
        }
    }
    assertTrue($caimanLoc !== null, 'location caiman');
    if ($caimanLoc !== null) {
        $patched = portailClubMaterielPatchSecurityCell($pdo, [
            'location_id' => $caimanLoc['id'],
            'type_slug' => 'o2',
            'supplier' => 'LINDE',
            'capacity' => '5L / 1m3',
            'revision_due_on' => '2030-06-01',
            'gauge_status' => 'full_ok',
        ]);
        assertTrue(($patched['security_status'] ?? '') === 'green', 'patch security cell O2');
        assertTrue(($patched['specs_json']['supplier'] ?? '') === 'LINDE', 'patch security specs');
    }

    $epiList = portailClubMaterielListEquipment($pdo, ['domain' => 'epi', 'limit' => 5]);
    $epiItems = $epiList['items'] ?? $epiList;
    foreach ($epiItems as $row) {
        assertTrue(($row['type_domain'] ?? 'epi') === 'epi', 'parc domain epi only');
        break;
    }

    $secList = portailClubMaterielListEquipment($pdo, ['domain' => 'security', 'limit' => 5]);
    $secItems = $secList['items'] ?? $secList;
    assertTrue(count($secItems) >= 1, 'security equipment exists');
    assertTrue(($secItems[0]['type_domain'] ?? '') === 'security', 'security domain filter');

    $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_equipment WHERE id = ?')->execute([(int)$created['id']]);
    $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_equipment WHERE id = ?')->execute([(int)$createdSameId['id']]);
    $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_equipment WHERE id = ?')->execute([(int)$createdNone['id']]);
    $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_persons WHERE id = ?')->execute([(int)$person['id']]);

    echo $failures === 0 ? "Smoke test materiel : SUCCES\n" : "Smoke test materiel : ECHECS ({$failures})\n";
    exit($failures === 0 ? 0 : 1);
} catch (Throwable $e) {
    fwrite(STDERR, 'Erreur : ' . $e->getMessage() . "\n");
    exit(1);
}
