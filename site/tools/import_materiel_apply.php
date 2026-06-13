<?php
declare(strict_types=1);

/**
 * Applique un payload JSON produit par import_materiel_sources.py (stdin ou fichier).
 * Usage NAS : /usr/local/bin/php82 /volume1/web/portailClub/tools/import_materiel_apply.php payload.json
 */
require_once __DIR__ . '/../lib/db.inc.php';
require_once __DIR__ . '/../lib/materiel.inc.php';

$inputFile = $argv[1] ?? null;
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
$stats = ['created' => 0, 'skipped' => 0, 'interventions' => 0, 'errors' => []];

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

function importMaterielEnsurePerson(PDO $pdo, string $name): ?int
{
    $name = trim($name);
    if ($name === '') {
        return null;
    }
    $st = $pdo->prepare('SELECT id FROM PORTAIL_CLUB_materiel_persons WHERE display_name = ? LIMIT 1');
    $st->execute([$name]);
    $id = $st->fetchColumn();
    if ($id) {
        return (int)$id;
    }
    $pdo->prepare('INSERT INTO PORTAIL_CLUB_materiel_persons (display_name) VALUES (?)')->execute([$name]);
    return (int)$pdo->lastInsertId();
}

function importMaterielInsertIntervention(PDO $pdo, int $equipmentId, array $int): void
{
    $personId = importMaterielEnsurePerson($pdo, (string)($int['responsible_free'] ?? ''));
    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_materiel_interventions
         (equipment_id, subtype, done_on, person_id, responsible_free, summary)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $free = $personId ? null : trim((string)($int['responsible_free'] ?? ''));
    $st->execute([
        $equipmentId,
        $int['subtype'] ?? 'repair',
        $int['done_on'],
        $personId,
        $free !== '' ? $free : null,
        trim((string)($int['summary'] ?? '')) ?: null,
    ]);
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
        if ($check->fetchColumn()) {
            $stats['skipped']++;
            continue;
        }

        $structureId = importMaterielResolveStructureId($pdo, (string)$item['structure_slug']);
        $state = in_array($item['state'] ?? 'operational', PORTAIL_CLUB_MATERIEL_STATES, true)
            ? $item['state'] : 'operational';

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
