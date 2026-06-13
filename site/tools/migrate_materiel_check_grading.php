<?php
declare(strict_types=1);

/**
 * Migration best-effort des check_values vers select_grading (mask/bcd/wetsuit).
 * Usage : php migrate_materiel_check_grading.php [--dry-run] [--apply-grids]
 */
require_once __DIR__ . '/../lib/db.inc.php';
require_once __DIR__ . '/../lib/materiel.inc.php';
require_once __DIR__ . '/import_materiel_prepare.php';

$dryRun = in_array('--dry-run', $argv, true);
$applyGrids = in_array('--apply-grids', $argv, true) || !$dryRun;

/** @var array<string, array<string, list<string>>> */
const LEGACY_DEFECT_MAP = [
    'mask' => [
        'jupe' => ['jupe_trou', 'jupe_desolidarisee'],
        'sangle_boucles' => [],
        'verres' => ['verres_rayures'],
    ],
    'bcd' => [
        'sangles' => ['flex_ds_devise', 'flex_ds_coupe', 'flex_ds_hernie', 'flex_ds_5ans'],
        'boucles' => [],
        'confort' => [],
    ],
    'wetsuit' => [
        'coutures' => [],
        'fermeture' => ['fermeture_dents', 'fermeture_curseur'],
        'revetement' => [],
    ],
];

/** @return list<string> */
function gradingProfileKeys(string $profile): array
{
    return array_column(importMaterielCheckProfile($profile), 'field_key');
}

function inferGradingForCriterion(array $legacy, array $defectKeys, bool $globalMineure, bool $globalMajeure): string
{
    $hasDefect = false;
    foreach ($defectKeys as $key) {
        $val = strtolower(trim((string)($legacy[$key] ?? '')));
        if ($val === 'ok' || $val === '1' || $val === 'true') {
            $hasDefect = true;
            break;
        }
    }
    if ($globalMajeure) {
        return 'majeure';
    }
    if ($globalMineure || $hasDefect) {
        return 'mineure';
    }
    $ras = strtolower(trim((string)($legacy['ras'] ?? '')));
    if ($ras === 'ok' || $ras === '') {
        return 'ras';
    }
    return 'ras';
}

function migrateLegacyChecks(string $profile, array $legacy): array
{
    $map = LEGACY_DEFECT_MAP[$profile] ?? [];
    $globalMineure = strtolower(trim((string)($legacy['mineure'] ?? ''))) === 'ok';
    $globalMajeure = strtolower(trim((string)($legacy['majeure'] ?? ''))) === 'ok';
    $out = [];
    foreach (gradingProfileKeys($profile) as $key) {
        $out[$key] = inferGradingForCriterion($legacy, $map[$key] ?? [], $globalMineure, $globalMajeure);
    }
    if ($globalMajeure) {
        foreach ($out as $k => $v) {
            if ($v === 'ras' && !empty($map[$k])) {
                $out[$k] = 'majeure';
            }
        }
    }
    return $out;
}

function profileForTypeSlug(string $slug): string
{
    if (in_array($slug, ['bcd', 'mask'], true)) {
        return $slug;
    }
    if (str_starts_with($slug, 'combi_') || str_starts_with($slug, 'shorty_')) {
        return 'wetsuit';
    }
    return '';
}

$pdo = portailClubGetPdo();
$stats = ['grids_synced' => 0, 'migrated' => 0, 'ambiguous' => 0, 'skipped' => 0];

if ($applyGrids) {
    $stTypes = $pdo->query('SELECT id, slug FROM PORTAIL_CLUB_materiel_equipment_types');
    foreach ($stTypes->fetchAll() as $row) {
        $checks = importMaterielChecksForTypeSlug((string)$row['slug']);
        if ($checks === []) {
            continue;
        }
        if (!$dryRun) {
            portailClubMaterielSyncTypeChecks($pdo, (int)$row['id'], $checks);
        }
        $stats['grids_synced']++;
        echo ($dryRun ? '[dry-run] ' : '') . "Grille sync type {$row['slug']}\n";
    }
}

$st = $pdo->query(
    'SELECT i.id AS intervention_id, i.detail_json, t.slug AS type_slug,
            cv.field_key, cv.value
     FROM PORTAIL_CLUB_materiel_interventions i
     JOIN PORTAIL_CLUB_materiel_equipment e ON e.id = i.equipment_id
     JOIN PORTAIL_CLUB_materiel_equipment_types t ON t.id = e.type_id
     JOIN PORTAIL_CLUB_materiel_intervention_check_values cv ON cv.intervention_id = i.id
     WHERE i.subtype = \'revision\'
     ORDER BY i.id'
);

/** @var array<int, array{slug:string, values:array<string,string>}> */
$byIntervention = [];
foreach ($st->fetchAll() as $r) {
    $iid = (int)$r['intervention_id'];
    if (!isset($byIntervention[$iid])) {
        $byIntervention[$iid] = ['slug' => (string)$r['type_slug'], 'values' => []];
    }
    $byIntervention[$iid]['values'][(string)$r['field_key']] = (string)$r['value'];
}

$newKeys = ['jupe', 'sangle_boucles', 'verres', 'sangles', 'boucles', 'confort', 'coutures', 'fermeture', 'revetement'];

foreach ($byIntervention as $iid => $bundle) {
    $profile = profileForTypeSlug($bundle['slug']);
    if ($profile === '') {
        $stats['skipped']++;
        continue;
    }
    $legacy = $bundle['values'];
    $alreadyNew = false;
    foreach ($newKeys as $nk) {
        if (isset($legacy[$nk])) {
            $alreadyNew = true;
            break;
        }
    }
    if ($alreadyNew) {
        $stats['skipped']++;
        continue;
    }

    $migrated = migrateLegacyChecks($profile, $legacy);
    $ambiguous = empty($legacy['ras']) && empty($legacy['mineure']) && empty($legacy['majeure'])
        && count($legacy) > 0;

    echo ($dryRun ? '[dry-run] ' : '') . "Intervention #{$iid} ({$bundle['slug']})\n";

    if (!$dryRun) {
        $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_intervention_check_values WHERE intervention_id = ?')
            ->execute([$iid]);
        $stIns = $pdo->prepare(
            'INSERT INTO PORTAIL_CLUB_materiel_intervention_check_values (intervention_id, field_key, value)
             VALUES (?, ?, ?)'
        );
        foreach ($migrated as $key => $val) {
            $stIns->execute([$iid, $key, $val]);
        }
        if ($ambiguous) {
            $detail = ['legacy_checks' => $legacy];
            $pdo->prepare('UPDATE PORTAIL_CLUB_materiel_interventions SET detail_json = ? WHERE id = ?')
                ->execute([json_encode($detail, JSON_UNESCAPED_UNICODE), $iid]);
        }
    }

    if ($ambiguous) {
        $stats['ambiguous']++;
    }
    $stats['migrated']++;
}

echo json_encode($stats, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";
