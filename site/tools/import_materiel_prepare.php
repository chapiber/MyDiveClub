<?php
declare(strict_types=1);

/**
 * Prépare paramétrage matériel avant import Excel (structures, types, grilles critères).
 *
 * Usage :
 *   php site/tools/import_materiel_prepare.php           # dry-run
 *   php site/tools/import_materiel_prepare.php --apply
 */
require_once __DIR__ . '/../lib/db.inc.php';
require_once __DIR__ . '/../lib/materiel.inc.php';

/** @return list<array{field_key:string,label:string,input_type:string}> */
function importMaterielCheckProfile(string $profile): array
{
    $profiles = [
        'bcd' => [
            ['field_key' => 'sangles', 'label' => 'État des sangles', 'input_type' => 'select_grading'],
            ['field_key' => 'boucles', 'label' => 'État des boucles', 'input_type' => 'select_grading'],
            ['field_key' => 'confort', 'label' => 'État des éléments de confort', 'input_type' => 'select_grading'],
        ],
        'mask' => [
            ['field_key' => 'jupe', 'label' => 'État de la jupe', 'input_type' => 'select_grading'],
            ['field_key' => 'sangle_boucles', 'label' => 'État de la sangle + boucles', 'input_type' => 'select_grading'],
            ['field_key' => 'verres', 'label' => 'État des verres', 'input_type' => 'select_grading'],
        ],
        'wetsuit' => [
            ['field_key' => 'coutures', 'label' => 'État des coutures', 'input_type' => 'select_grading'],
            ['field_key' => 'fermeture', 'label' => 'État de(s) fermeture(s) à glissière', 'input_type' => 'select_grading'],
            ['field_key' => 'revetement', 'label' => 'État du revêtement extérieur', 'input_type' => 'select_grading'],
        ],
        'computer' => [
            ['field_key' => 'batterie_boutons', 'label' => 'Batterie + boutons', 'input_type' => 'checkbox'],
            ['field_key' => 'couvercle', 'label' => 'Couvercle manquant', 'input_type' => 'checkbox'],
            ['field_key' => 'ordi_hs', 'label' => 'Ordinateur HS', 'input_type' => 'checkbox'],
            ['field_key' => 'ras', 'label' => 'RAS', 'input_type' => 'select_ok_ko'],
            ['field_key' => 'mineure', 'label' => 'Réparation mineure', 'input_type' => 'checkbox'],
            ['field_key' => 'majeure', 'label' => 'Réparation majeure', 'input_type' => 'checkbox'],
        ],
        'compass' => [
            ['field_key' => 'controle_visuel', 'label' => 'Contrôle visuel', 'input_type' => 'select_ok_ko'],
            ['field_key' => 'fonctionnement', 'label' => 'Fonctionnement', 'input_type' => 'select_ok_ko'],
        ],
    ];
    return $profiles[$profile] ?? [];
}

function importMaterielChecksForTypeSlug(string $typeSlug): array
{
    if (in_array($typeSlug, ['bcd', 'mask', 'computer', 'compass'], true)) {
        return importMaterielCheckProfile($typeSlug);
    }
    if (str_starts_with($typeSlug, 'combi_') || str_starts_with($typeSlug, 'shorty_')) {
        return importMaterielCheckProfile('wetsuit');
    }
    return [];
}

function importMaterielResolveStructureIdBySlug(PDO $pdo, string $slug): ?int
{
    $st = $pdo->prepare('SELECT id FROM PORTAIL_CLUB_materiel_structures WHERE slug = ? LIMIT 1');
    $st->execute([$slug]);
    $id = $st->fetchColumn();
    return $id ? (int)$id : null;
}

function importMaterielResolveTypeIdBySlug(PDO $pdo, string $slug): ?int
{
    $st = $pdo->prepare('SELECT id FROM PORTAIL_CLUB_materiel_equipment_types WHERE slug = ? LIMIT 1');
    $st->execute([$slug]);
    $id = $st->fetchColumn();
    return $id ? (int)$id : null;
}

if (PHP_SAPI !== 'cli' || !isset($argv[0]) || !str_contains(str_replace('\\', '/', $argv[0]), 'import_materiel_prepare.php')) {
    return;
}

$apply = in_array('--apply', $argv, true);

$stats = [
    'dry_run' => !$apply,
    'structures' => [],
    'types' => [],
    'checks_synced' => [],
    'errors' => [],
];

try {
    $pdo = portailClubGetPdo();
    if ($apply) {
        $pdo->beginTransaction();
    }

    $structures = [
        ['slug' => 'aquablue', 'label' => 'AQUABLUE Plongée', 'id_prefix' => 'A-'],
        ['slug' => 'rederis', 'label' => 'RÉDERIS', 'id_prefix' => 'R-'],
    ];

    foreach ($structures as $s) {
        $existing = importMaterielResolveStructureIdBySlug($pdo, $s['slug']);
        if ($existing !== null) {
            $stats['structures'][] = ['slug' => $s['slug'], 'action' => 'exists', 'id' => $existing];
            continue;
        }
        $stats['structures'][] = ['slug' => $s['slug'], 'action' => 'create', 'label' => $s['label']];
        if ($apply) {
            $st = $pdo->prepare(
                'INSERT INTO PORTAIL_CLUB_materiel_structures (slug, label, id_prefix, sort_order)
                 VALUES (?, ?, ?, ?)'
            );
            $st->execute([$s['slug'], $s['label'], $s['id_prefix'], $s['slug'] === 'aquablue' ? 1 : 2]);
            $stats['structures'][array_key_last($stats['structures'])]['id'] = (int)$pdo->lastInsertId();
        }
    }

    $newTypes = [
        ['slug' => 'combi_homme', 'label' => 'Combi homme', 'renewal_years' => 5, 'sort_order' => 10],
        ['slug' => 'combi_femme', 'label' => 'Combi femme', 'renewal_years' => 5, 'sort_order' => 11],
        ['slug' => 'combi_enfant', 'label' => 'Combi enfant', 'renewal_years' => 3, 'sort_order' => 12],
        ['slug' => 'shorty_homme', 'label' => 'Shorty homme', 'renewal_years' => 4, 'sort_order' => 13],
        ['slug' => 'shorty_femme', 'label' => 'Shorty femme', 'renewal_years' => 4, 'sort_order' => 14],
        ['slug' => 'shorty_enfant', 'label' => 'Shorty enfant', 'renewal_years' => 3, 'sort_order' => 15],
        ['slug' => 'computer', 'label' => 'Ordinateur', 'renewal_years' => 5, 'sort_order' => 16],
        ['slug' => 'compass', 'label' => 'Compas', 'renewal_years' => 10, 'sort_order' => 17],
    ];

    foreach ($newTypes as $t) {
        $existing = importMaterielResolveTypeIdBySlug($pdo, $t['slug']);
        if ($existing !== null) {
            $stats['types'][] = ['slug' => $t['slug'], 'action' => 'exists', 'id' => $existing];
            continue;
        }
        $stats['types'][] = ['slug' => $t['slug'], 'action' => 'create', 'label' => $t['label']];
        if ($apply) {
            $st = $pdo->prepare(
                'INSERT INTO PORTAIL_CLUB_materiel_equipment_types
                 (slug, label, renewal_years, min_stock_alert, trackable, sort_order)
                 VALUES (?, ?, ?, NULL, 1, ?)'
            );
            $st->execute([$t['slug'], $t['label'], $t['renewal_years'], $t['sort_order']]);
            $stats['types'][array_key_last($stats['types'])]['id'] = (int)$pdo->lastInsertId();
        }
    }

    $checkTypeSlugs = array_values(array_unique(array_merge(
        ['bcd', 'mask'],
        array_column($newTypes, 'slug')
    )));

    foreach ($checkTypeSlugs as $typeSlug) {
        $checks = importMaterielChecksForTypeSlug($typeSlug);
        if ($checks === []) {
            continue;
        }
        $typeId = importMaterielResolveTypeIdBySlug($pdo, $typeSlug);
        if ($typeId === null) {
            if (!$apply) {
                $stats['checks_synced'][] = [
                    'type_slug' => $typeSlug,
                    'action' => 'pending',
                    'count' => count($checks),
                ];
                continue;
            }
            $stats['errors'][] = "Type « {$typeSlug} » introuvable pour sync checks.";
            continue;
        }
        $cntSt = $pdo->prepare('SELECT COUNT(*) FROM PORTAIL_CLUB_materiel_equipment_type_checks WHERE type_id = ?');
        $cntSt->execute([$typeId]);
        $existingCnt = (int)$cntSt->fetchColumn();
        $stats['checks_synced'][] = [
            'type_slug' => $typeSlug,
            'action' => $existingCnt > 0 ? 'replace' : 'create',
            'count' => count($checks),
        ];
        if ($apply) {
            portailClubMaterielSyncTypeChecks($pdo, $typeId, $checks);
        }
    }

    if ($apply) {
        $pdo->commit();
    }

    echo json_encode($stats, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n";
    exit(empty($stats['errors']) ? 0 : 1);
} catch (Throwable $e) {
    if ($apply && isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, 'Erreur : ' . $e->getMessage() . "\n");
    exit(1);
}
