<?php
declare(strict_types=1);

/**
 * Applique un payload JSON produit par import_materiel_sources.py (stdin ou fichier).
 * Usage NAS : /usr/local/bin/php82 /volume1/web/portailClub/tools/import_materiel_apply.php payload.json
 *             /usr/local/bin/php82 .../import_materiel_apply.php --update-states payload.json
 *             /usr/local/bin/php82 .../import_materiel_apply.php --sync-states-only states.json
 *             /usr/local/bin/php82 .../import_materiel_apply.php --sync-regulators-only regulators.json
 */
require_once __DIR__ . '/../lib/db.inc.php';
require_once __DIR__ . '/../lib/materiel.inc.php';
require_once __DIR__ . '/../lib/materiel_person_aliases.php';

$inputFile = null;
$updateStates = false;
$syncStatesOnly = false;
$syncRegulatorsOnly = false;
foreach (array_slice($argv, 1) as $arg) {
    if ($arg === '--update-states') {
        $updateStates = true;
        continue;
    }
    if ($arg === '--sync-states-only') {
        $syncStatesOnly = true;
        continue;
    }
    if ($arg === '--sync-regulators-only') {
        $syncRegulatorsOnly = true;
        continue;
    }
    if ($inputFile === null && !str_starts_with($arg, '--')) {
        $inputFile = $arg;
    }
}

$raw = $inputFile ? @file_get_contents($inputFile) : file_get_contents('php://stdin');
if ($raw === false || trim($raw) === '') {
    fwrite(STDERR, "Payload JSON requis.\n");
    exit(1);
}

$payload = json_decode($raw, true);
if (!is_array($payload) || !isset($payload['items']) || !is_array($payload['items'])) {
    fwrite(STDERR, "Payload invalide.\n");
    exit(1);
}

$pdo = portailClubGetPdo();

function importMaterielResolveStructureId(PDO $pdo, string $slug): int
{
    $st = $pdo->prepare(
        'SELECT id FROM PORTAIL_CLUB_materiel_structures WHERE slug = ? AND active = 1 LIMIT 1'
    );
    $st->execute([$slug]);
    $id = $st->fetchColumn();
    if (!$id) {
        throw new RuntimeException("Structure « {$slug} » introuvable.");
    }
    return (int)$id;
}

function importMaterielResolveTypeId(PDO $pdo, string $slug): int
{
    $st = $pdo->prepare('SELECT id FROM PORTAIL_CLUB_materiel_equipment_types WHERE slug = ? LIMIT 1');
    $st->execute([$slug]);
    $id = $st->fetchColumn();
    if (!$id) {
        throw new RuntimeException("Type « {$slug} » introuvable.");
    }
    return (int)$id;
}

if ($syncStatesOnly) {
    $stats = ['updated' => 0, 'unchanged' => 0, 'not_found' => 0, 'errors' => []];

    foreach ($payload['items'] as $item) {
        $publicId = strtoupper(trim((string)($item['public_id'] ?? '')));
        if ($publicId === '') {
            $stats['errors'][] = 'public_id vide';
            continue;
        }
        try {
            $typeId = importMaterielResolveTypeId($pdo, (string)$item['type_slug']);
            $state = in_array($item['state'] ?? 'operational', PORTAIL_CLUB_MATERIEL_STATES, true)
                ? $item['state'] : 'operational';

            $st = $pdo->prepare(
                'SELECT id, state FROM PORTAIL_CLUB_materiel_equipment WHERE public_id = ? AND type_id = ? LIMIT 1'
            );
            $st->execute([$publicId, $typeId]);
            $row = $st->fetch(PDO::FETCH_ASSOC);
            if (!$row) {
                $stats['not_found']++;
                continue;
            }
            $existingId = (int)$row['id'];
            $curState = (string)$row['state'];
            if ($curState === $state) {
                $stats['unchanged']++;
                continue;
            }
            $pdo->prepare('UPDATE PORTAIL_CLUB_materiel_equipment SET state = ? WHERE id = ?')
                ->execute([$state, $existingId]);
            $stats['updated']++;
        } catch (Throwable $e) {
            $stats['errors'][] = $publicId . ': ' . $e->getMessage();
        }
    }

    echo json_encode($stats, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n";
    exit(empty($stats['errors']) ? 0 : 1);
}

function importMaterielInterventionExists(PDO $pdo, int $equipmentId, string $doneOn, ?string $summary): bool
{
    $st = $pdo->prepare(
        'SELECT 1 FROM PORTAIL_CLUB_materiel_interventions
         WHERE equipment_id = ? AND done_on = ? AND COALESCE(summary, \'\') = ? LIMIT 1'
    );
    $st->execute([$equipmentId, $doneOn, $summary ?? '']);
    return (bool)$st->fetchColumn();
}

if ($syncRegulatorsOnly) {
    $stats = [
        'updated_specs' => 0,
        'updated_meta' => 0,
        'updated_state' => 0,
        'interventions_added' => 0,
        'unchanged' => 0,
        'not_found' => 0,
        'errors' => [],
    ];

    foreach ($payload['items'] as $item) {
        $publicId = strtoupper(trim((string)($item['public_id'] ?? '')));
        if ($publicId === '') {
            $stats['errors'][] = 'public_id vide';
            continue;
        }
        try {
            $typeId = importMaterielResolveTypeId($pdo, (string)$item['type_slug']);
            $st = $pdo->prepare(
                'SELECT id, state, brand, model, serial, purchase_year, specs_json
                 FROM PORTAIL_CLUB_materiel_equipment WHERE public_id = ? AND type_id = ? LIMIT 1'
            );
            $st->execute([$publicId, $typeId]);
            $row = $st->fetch(PDO::FETCH_ASSOC);
            if (!$row) {
                $stats['not_found']++;
                continue;
            }
            $equipmentId = (int)$row['id'];
            $changed = false;

            if (!empty($item['specs_json']) && is_array($item['specs_json'])) {
                $specsJson = json_encode(
                    portailClubMaterielNormalizeRegulatorSpecs($item['specs_json']),
                    JSON_UNESCAPED_UNICODE
                );
                $pdo->prepare('UPDATE PORTAIL_CLUB_materiel_equipment SET specs_json = ? WHERE id = ?')
                    ->execute([$specsJson, $equipmentId]);
                $stats['updated_specs']++;
                $changed = true;
            }

            $metaSets = [];
            $metaParams = [];
            foreach (['brand', 'model', 'serial'] as $field) {
                $val = trim((string)($item[$field] ?? ''));
                if ($val !== '' && $val !== (string)($row[$field] ?? '')) {
                    $metaSets[] = "{$field} = ?";
                    $metaParams[] = $val;
                }
            }
            if (array_key_exists('purchase_year', $item)) {
                $py = $item['purchase_year'] !== '' && $item['purchase_year'] !== null
                    ? (int)$item['purchase_year'] : null;
                $curPy = $row['purchase_year'] !== null ? (int)$row['purchase_year'] : null;
                if ($py !== null && $py !== $curPy) {
                    $metaSets[] = 'purchase_year = ?';
                    $metaParams[] = $py;
                }
            }
            if ($metaSets !== []) {
                $metaParams[] = $equipmentId;
                $pdo->prepare(
                    'UPDATE PORTAIL_CLUB_materiel_equipment SET ' . implode(', ', $metaSets) . ' WHERE id = ?'
                )->execute($metaParams);
                $stats['updated_meta']++;
                $changed = true;
            }

            $state = in_array($item['state'] ?? 'operational', PORTAIL_CLUB_MATERIEL_STATES, true)
                ? $item['state'] : 'operational';
            if ($state !== (string)$row['state']) {
                $pdo->prepare('UPDATE PORTAIL_CLUB_materiel_equipment SET state = ? WHERE id = ?')
                    ->execute([$state, $equipmentId]);
                $stats['updated_state']++;
                $changed = true;
            }

            foreach ($item['interventions'] ?? [] as $int) {
                if (empty($int['done_on'])) {
                    continue;
                }
                $summary = trim((string)($int['summary'] ?? '')) ?: null;
                if (importMaterielInterventionExists($pdo, $equipmentId, (string)$int['done_on'], $summary)) {
                    continue;
                }
                importMaterielInsertIntervention($pdo, $equipmentId, $int);
                $stats['interventions_added']++;
                $changed = true;
            }

            if (!$changed) {
                $stats['unchanged']++;
            }
        } catch (Throwable $e) {
            $stats['errors'][] = $publicId . ': ' . $e->getMessage();
        }
    }

    echo json_encode($stats, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n";
    exit(empty($stats['errors']) ? 0 : 1);
}

$stats = ['created' => 0, 'updated' => 0, 'skipped' => 0, 'interventions' => 0, 'errors' => []];

function importMaterielEnsurePerson(PDO $pdo, string $name): ?int
{
    $name = portailClubMaterielNormalizePersonName(trim($name));
    if ($name === '' || portailClubMaterielIsImportFreeLabel($name)) {
        return null;
    }
    $existing = portailClubMaterielResolvePersonIdByName($pdo, $name);
    if ($existing !== null) {
        return $existing;
    }
    $pdo->prepare('INSERT INTO PORTAIL_CLUB_materiel_persons (display_name) VALUES (?)')->execute([$name]);
    return (int)$pdo->lastInsertId();
}

function importMaterielInsertIntervention(PDO $pdo, int $equipmentId, array $int): void
{
    $raw = trim((string)($int['responsible_free'] ?? ''));
    if ($raw === '') {
        $personId = null;
        $free = null;
    } elseif (portailClubMaterielIsImportFreeLabel($raw)) {
        $personId = null;
        $free = $raw;
    } else {
        $personId = importMaterielEnsurePerson($pdo, $raw);
        $free = $personId ? null : portailClubMaterielNormalizePersonName($raw);
    }
    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_materiel_interventions
         (equipment_id, subtype, done_on, person_id, responsible_free, summary, detail_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    $detailJson = null;
    if (isset($int['detail_json']) && is_array($int['detail_json'])) {
        $detailJson = json_encode(
            portailClubMaterielValidateRegulatorDetail($int['detail_json']),
            JSON_UNESCAPED_UNICODE
        );
    }
    $st->execute([
        $equipmentId,
        $int['subtype'] ?? 'repair',
        $int['done_on'],
        $personId,
        $free !== null && $free !== '' ? $free : null,
        trim((string)($int['summary'] ?? '')) ?: null,
        $detailJson,
    ]);
    $interventionId = (int)$pdo->lastInsertId();

    $subtype = (string)($int['subtype'] ?? 'repair');
    $checkValues = $int['check_values'] ?? null;
    if ($subtype === 'revision' && is_array($checkValues) && $checkValues !== []) {
        $stCheck = $pdo->prepare(
            'INSERT INTO PORTAIL_CLUB_materiel_intervention_check_values (intervention_id, field_key, value)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value)'
        );
        foreach ($checkValues as $fieldKey => $value) {
            $fieldKey = strtolower(trim((string)$fieldKey));
            $value = trim((string)$value);
            if ($fieldKey === '' || $value === '') {
                continue;
            }
            $stCheck->execute([$interventionId, $fieldKey, $value]);
        }
    }
}

foreach ($payload['items'] as $item) {
    $publicId = strtoupper(trim((string)($item['public_id'] ?? '')));
    if ($publicId === '') {
        $stats['errors'][] = 'public_id vide';
        continue;
    }
    try {
        $typeId = importMaterielResolveTypeId($pdo, (string)$item['type_slug']);
        $check = $pdo->prepare(
            'SELECT id FROM PORTAIL_CLUB_materiel_equipment WHERE public_id = ? AND type_id = ? LIMIT 1'
        );
        $check->execute([$publicId, $typeId]);
        $existingId = $check->fetchColumn();
        $state = in_array($item['state'] ?? 'operational', PORTAIL_CLUB_MATERIEL_STATES, true)
            ? $item['state'] : 'operational';

        if ($existingId) {
            if ($updateStates) {
                $stCur = $pdo->prepare('SELECT state FROM PORTAIL_CLUB_materiel_equipment WHERE id = ?');
                $stCur->execute([(int)$existingId]);
                $curState = (string)$stCur->fetchColumn();
                if ($curState !== $state) {
                    $pdo->prepare('UPDATE PORTAIL_CLUB_materiel_equipment SET state = ? WHERE id = ?')
                        ->execute([$state, (int)$existingId]);
                    $stats['updated']++;
                } else {
                    $stats['skipped']++;
                }
            } else {
                $stats['skipped']++;
            }
            continue;
        }

        $structureId = importMaterielResolveStructureId($pdo, (string)$item['structure_slug']);

        $created = portailClubMaterielCreateEquipment($pdo, [
            'public_id' => $publicId,
            'structure_id' => $structureId,
            'type_id' => $typeId,
            'brand' => $item['brand'] ?? '',
            'model' => $item['model'] ?? '',
            'serial' => $item['serial'] ?? '',
            'purchase_year' => $item['purchase_year'] ?? null,
            'notes' => $item['notes'] ?? '',
        ]);

        if ($state !== 'operational') {
            $pdo->prepare('UPDATE PORTAIL_CLUB_materiel_equipment SET state = ? WHERE id = ?')
                ->execute([$state, $created['id']]);
        }

        if (!empty($item['specs_json']) && is_array($item['specs_json'])) {
            portailClubMaterielPatchEquipment($pdo, (int)$created['id'], [
                'specs_json' => $item['specs_json'],
            ]);
        }

        foreach ($item['interventions'] ?? [] as $int) {
            if (empty($int['done_on'])) {
                continue;
            }
            importMaterielInsertIntervention($pdo, (int)$created['id'], $int);
            $stats['interventions']++;
        }

        $stats['created']++;
    } catch (Throwable $e) {
        $stats['errors'][] = $publicId . ': ' . $e->getMessage();
    }
}

echo json_encode($stats, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n";
exit(empty($stats['errors']) ? 0 : 1);
