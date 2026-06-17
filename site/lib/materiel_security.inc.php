<?php
declare(strict_types=1);

const PORTAIL_CLUB_MATERIEL_SECURITY_TYPE_SLUGS = [
    'o2',
    'bavu',
    'dae',
    'aspiration_mucosites',
    'trousse_secours',
    'couvertures_survie',
];

const PORTAIL_CLUB_MATERIEL_SECURITY_ALERT_DAYS = 90;

/** @return list<string> */
function portailClubMaterielSecurityTypeSlugs(): array
{
    return PORTAIL_CLUB_MATERIEL_SECURITY_TYPE_SLUGS;
}

function portailClubMaterielIsSecurityTypeSlug(string $slug): bool
{
    return in_array($slug, PORTAIL_CLUB_MATERIEL_SECURITY_TYPE_SLUGS, true);
}

function portailClubMaterielSecurityPublicId(string $typeSlug, string $locationSlug): string
{
    $locPart = strtoupper(str_replace('le_', '', $locationSlug));
    return strtoupper($typeSlug) . '-' . $locPart;
}

function portailClubMaterielNormalizeGaugeStatus(mixed $value): string
{
    $v = strtolower(trim((string)$value));
    if (!in_array($v, ['full_ok', 'low', 'empty'], true)) {
        return '';
    }
    return $v;
}

function portailClubMaterielNormalizeSecurityDate(mixed $value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    $s = trim((string)$value);
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s)) {
        return $s;
    }
    if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})$/', $s, $m)) {
        return sprintf('%04d-%02d-%02d', (int)$m[3], (int)$m[2], (int)$m[1]);
    }
    return null;
}

/** @return array<string, mixed> */
function portailClubMaterielEmptySecuritySpecs(string $typeSlug): array
{
    return match ($typeSlug) {
        'o2' => ['supplier' => '', 'capacity' => '', 'revision_due_on' => null, 'gauge_status' => ''],
        'bavu' => ['model' => '', 'expiry_on' => null, 'mask_sizes' => ''],
        'dae' => ['model' => '', 'battery_on' => null, 'electrodes_on' => null],
        default => ['status' => '', 'notes' => '', 'quantity' => ''],
    };
}

/** @param array<string, mixed> $raw */
function portailClubMaterielNormalizeSecuritySpecs(string $typeSlug, array $raw): array
{
    $base = portailClubMaterielEmptySecuritySpecs($typeSlug);
    if ($typeSlug === 'o2') {
        return [
            'supplier' => portailClubTrimOptionalName($raw['supplier'] ?? '', 120),
            'capacity' => portailClubTrimOptionalName($raw['capacity'] ?? '', 120),
            'revision_due_on' => portailClubMaterielNormalizeSecurityDate($raw['revision_due_on'] ?? null),
            'gauge_status' => portailClubMaterielNormalizeGaugeStatus($raw['gauge_status'] ?? ''),
        ];
    }
    if ($typeSlug === 'bavu') {
        return [
            'model' => portailClubTrimOptionalName($raw['model'] ?? '', 120),
            'expiry_on' => portailClubMaterielNormalizeSecurityDate($raw['expiry_on'] ?? null),
            'mask_sizes' => portailClubTrimOptionalName($raw['mask_sizes'] ?? '', 200),
        ];
    }
    if ($typeSlug === 'dae') {
        return [
            'model' => portailClubTrimOptionalName($raw['model'] ?? '', 120),
            'battery_on' => portailClubMaterielNormalizeSecurityDate($raw['battery_on'] ?? null),
            'electrodes_on' => portailClubMaterielNormalizeSecurityDate($raw['electrodes_on'] ?? null),
        ];
    }
    return [
        'status' => portailClubTrimOptionalName($raw['status'] ?? '', 120),
        'notes' => portailClubTrimOptionalName($raw['notes'] ?? '', 500),
        'quantity' => portailClubTrimOptionalName($raw['quantity'] ?? '', 40),
    ];
}

/** @return 'red'|'orange'|'green'|'none' */
function portailClubMaterielDateComplianceLevel(?string $isoDate): string
{
    if ($isoDate === null || $isoDate === '') {
        return 'none';
    }
    try {
        $due = new DateTimeImmutable($isoDate);
        $today = new DateTimeImmutable('today');
        if ($due < $today) {
            return 'red';
        }
        $warn = $today->modify('+' . PORTAIL_CLUB_MATERIEL_SECURITY_ALERT_DAYS . ' days');
        if ($due <= $warn) {
            return 'orange';
        }
        return 'green';
    } catch (Throwable) {
        return 'none';
    }
}

/** @param array<string, mixed> $item */
function portailClubMaterielComputeSecurityCompliance(array $item): array
{
    $slug = (string)($item['type_slug'] ?? '');
    $domain = (string)($item['type_domain'] ?? $item['domain'] ?? 'epi');
    if ($domain !== 'security' && !portailClubMaterielIsSecurityTypeSlug($slug)) {
        return [
            'security_status' => 'none',
            'security_alerts' => [],
        ];
    }

    $specs = is_array($item['specs_json'] ?? null) ? $item['specs_json'] : [];
    $alerts = [];
    $worst = 'none';
    $rank = ['none' => 0, 'green' => 1, 'orange' => 2, 'red' => 3];

    $apply = static function (string $level, string $message) use (&$worst, &$alerts, $rank): void {
        if ($rank[$level] > $rank[$worst]) {
            $worst = $level;
        }
        if ($level === 'red' || $level === 'orange') {
            $alerts[] = $message;
        }
    };

    if ($slug === 'o2') {
        $gauge = (string)($specs['gauge_status'] ?? '');
        if ($gauge === 'low' || $gauge === 'empty') {
            $apply('red', 'Jauge O2 basse');
        }
        $revLevel = portailClubMaterielDateComplianceLevel(
            isset($specs['revision_due_on']) ? (string)$specs['revision_due_on'] : null
        );
        if ($revLevel === 'red') {
            $apply('red', 'Révision O2 dépassée');
        } elseif ($revLevel === 'orange') {
            $apply('orange', 'Révision O2 à prévoir');
        } elseif ($revLevel === 'green' && $worst === 'none') {
            $worst = 'green';
        }
    } elseif ($slug === 'bavu') {
        $exp = isset($item['expiry_on']) && $item['expiry_on']
            ? (string)$item['expiry_on']
            : (isset($specs['expiry_on']) ? (string)$specs['expiry_on'] : null);
        $lvl = portailClubMaterielDateComplianceLevel($exp);
        if ($lvl === 'red') {
            $apply('red', 'BAVU périmé');
        } elseif ($lvl === 'orange') {
            $apply('orange', 'Péremption BAVU proche');
        } elseif ($lvl === 'green' && $worst === 'none') {
            $worst = 'green';
        }
    } elseif ($slug === 'dae') {
        foreach (['battery_on' => 'Batterie DAE', 'electrodes_on' => 'Électrodes DAE'] as $key => $label) {
            $lvl = portailClubMaterielDateComplianceLevel(
                isset($specs[$key]) ? (string)$specs[$key] : null
            );
            if ($lvl === 'red') {
                $apply('red', $label . ' dépassée');
            } elseif ($lvl === 'orange') {
                $apply('orange', $label . ' à prévoir');
            } elseif ($lvl === 'green' && $worst === 'none') {
                $worst = 'green';
            }
        }
    }

    return [
        'security_status' => $worst,
        'security_alerts' => $alerts,
    ];
}

function portailClubMaterielFetchLocationStructureIds(PDO $pdo, int $locationId): array
{
    $st = $pdo->prepare(
        'SELECT structure_id FROM PORTAIL_CLUB_materiel_location_structure_links WHERE location_id = ?'
    );
    $st->execute([$locationId]);
    return array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
}

function portailClubMaterielSyncLocationStructures(PDO $pdo, int $locationId, array $structureIds): void
{
    $structureIds = array_values(array_unique(array_filter(array_map('intval', $structureIds))));
    foreach ($structureIds as $sid) {
        portailClubMaterielValidateStructureId($pdo, $sid);
    }
    $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_location_structure_links WHERE location_id = ?')
        ->execute([$locationId]);
    if ($structureIds === []) {
        return;
    }
    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_materiel_location_structure_links (location_id, structure_id) VALUES (?, ?)'
    );
    foreach ($structureIds as $sid) {
        $st->execute([$locationId, $sid]);
    }
}

function portailClubMaterielFormatLocationRow(PDO $pdo, array $r): array
{
    $id = (int)$r['id'];
    return [
        'id' => $id,
        'slug' => $r['slug'],
        'label' => $r['label'],
        'active' => (bool)$r['active'],
        'sort_order' => (int)$r['sort_order'],
        'notes' => $r['notes'],
        'structure_ids' => portailClubMaterielFetchLocationStructureIds($pdo, $id),
        'security_count' => (int)($r['security_count'] ?? 0),
    ];
}

function portailClubMaterielListLocations(PDO $pdo, bool $activeOnly = false): array
{
    $sql = 'SELECT l.id, l.slug, l.label, l.active, l.sort_order, l.notes,
            (SELECT COUNT(*) FROM PORTAIL_CLUB_materiel_equipment e
             JOIN PORTAIL_CLUB_materiel_equipment_types t ON t.id = e.type_id AND t.domain = \'security\'
             WHERE e.location_id = l.id) AS security_count
            FROM PORTAIL_CLUB_materiel_locations l';
    if ($activeOnly) {
        $sql .= ' WHERE l.active = 1';
    }
    $sql .= ' ORDER BY l.sort_order, l.label';
    return array_map(
        static fn(array $r): array => portailClubMaterielFormatLocationRow($pdo, $r),
        $pdo->query($sql)->fetchAll()
    );
}

function portailClubMaterielGetLocation(PDO $pdo, int $id): array
{
    $st = $pdo->prepare(
        'SELECT l.id, l.slug, l.label, l.active, l.sort_order, l.notes,
                (SELECT COUNT(*) FROM PORTAIL_CLUB_materiel_equipment e
                 JOIN PORTAIL_CLUB_materiel_equipment_types t ON t.id = e.type_id AND t.domain = \'security\'
                 WHERE e.location_id = l.id) AS security_count
         FROM PORTAIL_CLUB_materiel_locations l WHERE l.id = ?'
    );
    $st->execute([$id]);
    $r = $st->fetch();
    if (!$r) {
        portailClubJsonFail('Localisation introuvable.', 404);
    }
    return portailClubMaterielFormatLocationRow($pdo, $r);
}

function portailClubMaterielEnsureSecurityEquipmentForLocation(PDO $pdo, int $locationId): void
{
    $loc = portailClubMaterielGetLocation($pdo, $locationId);
    $stTypes = $pdo->query(
        'SELECT id, slug FROM PORTAIL_CLUB_materiel_equipment_types WHERE domain = \'security\''
    );
    $insert = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_materiel_equipment
         (public_id, structure_id, location_id, type_id, brand, state, specs_json)
         VALUES (?, NULL, ?, ?, \'\', \'operational\', NULL)'
    );
    foreach ($stTypes->fetchAll() as $t) {
        $check = $pdo->prepare(
            'SELECT 1 FROM PORTAIL_CLUB_materiel_equipment WHERE location_id = ? AND type_id = ? LIMIT 1'
        );
        $check->execute([$locationId, (int)$t['id']]);
        if ($check->fetchColumn()) {
            continue;
        }
        $publicId = portailClubMaterielSecurityPublicId((string)$t['slug'], $loc['slug']);
        $insert->execute([$publicId, $locationId, (int)$t['id']]);
        portailClubMaterielLogStateChange($pdo, (int)$pdo->lastInsertId(), null, 'operational', null, null);
    }
}

function portailClubMaterielCreateLocation(PDO $pdo, array $body): array
{
    $label = portailClubTrimName($body['label'] ?? '', 'Libellé localisation');
    $slug = strtolower(trim((string)($body['slug'] ?? '')));
    if ($slug === '') {
        $slug = preg_replace('/[^a-z0-9]+/', '_', strtolower($label)) ?? 'location';
        $slug = trim($slug, '_');
    }
    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_materiel_locations (slug, label, sort_order, notes)
         VALUES (?, ?, ?, ?)'
    );
    $st->execute([
        $slug,
        $label,
        (int)($body['sort_order'] ?? 0),
        portailClubTrimOptionalName($body['notes'] ?? '', 2000),
    ]);
    $id = (int)$pdo->lastInsertId();
    if (array_key_exists('structure_ids', $body) && is_array($body['structure_ids'])) {
        portailClubMaterielSyncLocationStructures($pdo, $id, $body['structure_ids']);
    }
    portailClubMaterielEnsureSecurityEquipmentForLocation($pdo, $id);
    return portailClubMaterielGetLocation($pdo, $id);
}

function portailClubMaterielPatchLocation(PDO $pdo, int $id, array $body): array
{
    portailClubMaterielGetLocation($pdo, $id);
    $sets = [];
    $params = [];
    foreach (['label', 'slug', 'notes'] as $field) {
        if (!array_key_exists($field, $body)) {
            continue;
        }
        if ($field === 'notes') {
            $sets[] = 'notes = ?';
            $params[] = portailClubTrimOptionalName($body[$field], 2000);
        } elseif ($field === 'label') {
            $sets[] = 'label = ?';
            $params[] = portailClubTrimName($body[$field], 'Libellé localisation');
        } else {
            $sets[] = 'slug = ?';
            $params[] = strtolower(trim((string)$body[$field]));
        }
    }
    if (array_key_exists('active', $body)) {
        $sets[] = 'active = ?';
        $params[] = (bool)$body['active'] ? 1 : 0;
    }
    if (array_key_exists('sort_order', $body)) {
        $sets[] = 'sort_order = ?';
        $params[] = (int)$body['sort_order'];
    }
    if ($sets !== []) {
        $params[] = $id;
        $pdo->prepare('UPDATE PORTAIL_CLUB_materiel_locations SET ' . implode(', ', $sets) . ' WHERE id = ?')
            ->execute($params);
    }
    if (array_key_exists('structure_ids', $body) && is_array($body['structure_ids'])) {
        portailClubMaterielSyncLocationStructures($pdo, $id, $body['structure_ids']);
    }
    return portailClubMaterielGetLocation($pdo, $id);
}

function portailClubMaterielDeleteLocation(PDO $pdo, int $id): array
{
    portailClubMaterielGetLocation($pdo, $id);
    $st = $pdo->prepare(
        'SELECT COUNT(*) FROM PORTAIL_CLUB_materiel_equipment e
         JOIN PORTAIL_CLUB_materiel_equipment_types t ON t.id = e.type_id AND t.domain = \'security\'
         WHERE e.location_id = ?'
    );
    $st->execute([$id]);
    if ((int)$st->fetchColumn() > 0) {
        portailClubJsonFail('Impossible de supprimer : matériel sécurité rattaché. Désactivez la localisation.');
    }
    $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_locations WHERE id = ?')->execute([$id]);
    return ['deleted' => true];
}

function portailClubMaterielGetSecurityEquipmentByLocationType(
    PDO $pdo,
    int $locationId,
    string $typeSlug
): ?array {
    $st = $pdo->prepare(
        portailClubMaterielEquipmentSelectSql()
        . ' WHERE e.location_id = ? AND t.slug = ? AND t.domain = \'security\' LIMIT 1'
    );
    $st->execute([$locationId, $typeSlug]);
    $r = $st->fetch();
    if (!$r) {
        return null;
    }
    return portailClubMaterielFormatEquipmentRowWithPair($r);
}

function portailClubMaterielFormatSecurityCell(array $item): array
{
    $compliance = portailClubMaterielComputeSecurityCompliance($item);
    return [
        'id' => $item['id'],
        'public_id' => $item['public_id'],
        'type_slug' => $item['type_slug'],
        'type_label' => $item['type_label'],
        'specs_json' => $item['specs_json'],
        'expiry_on' => $item['expiry_on'] ?? null,
        'updated_at' => $item['updated_at'],
        'security_status' => $compliance['security_status'],
        'security_alerts' => $compliance['security_alerts'],
    ];
}

/** @return array<string, mixed> */
function portailClubMaterielGetSecurityRegister(PDO $pdo, array $filters = []): array
{
    $structureIds = portailClubMaterielParseStructureIds($filters['structure_ids'] ?? null);
    $alertOnly = !empty($filters['alert_only']);
    $locations = portailClubMaterielListLocations($pdo, true);

    if ($structureIds !== []) {
        $locations = array_values(array_filter($locations, static function (array $loc) use ($structureIds): bool {
            $linked = $loc['structure_ids'] ?? [];
            if ($linked === []) {
                return true;
            }
            foreach ($structureIds as $sid) {
                if (in_array($sid, $linked, true)) {
                    return true;
                }
            }
            return false;
        }));
    }

    $matrix = [];
    $lastUpdated = null;
    $alertCount = 0;

    foreach ($locations as $loc) {
        $locId = (int)$loc['id'];
        $cells = [];
        $locWorst = 'none';
        $rank = ['none' => 0, 'green' => 1, 'orange' => 2, 'red' => 3];

        foreach (PORTAIL_CLUB_MATERIEL_SECURITY_TYPE_SLUGS as $typeSlug) {
            $item = portailClubMaterielGetSecurityEquipmentByLocationType($pdo, $locId, $typeSlug);
            if ($item === null) {
                $cells[$typeSlug] = null;
                continue;
            }
            $cell = portailClubMaterielFormatSecurityCell($item);
            $cells[$typeSlug] = $cell;
            if ($cell['updated_at'] !== null && ($lastUpdated === null || $cell['updated_at'] > $lastUpdated)) {
                $lastUpdated = $cell['updated_at'];
            }
            if ($rank[$cell['security_status']] > $rank[$locWorst]) {
                $locWorst = $cell['security_status'];
            }
        }

        if ($alertOnly && !in_array($locWorst, ['red', 'orange'], true)) {
            continue;
        }
        if (in_array($locWorst, ['red', 'orange'], true)) {
            $alertCount++;
        }

        $matrix[(string)$locId] = [
            'location' => $loc,
            'cells' => $cells,
            'location_status' => $locWorst,
        ];
    }

    return [
        'locations' => $locations,
        'matrix' => $matrix,
        'last_updated' => $lastUpdated,
        'alert_count' => $alertCount,
        'security_types' => PORTAIL_CLUB_MATERIEL_SECURITY_TYPE_SLUGS,
    ];
}

function portailClubMaterielPatchSecurityCell(PDO $pdo, array $body): array
{
    $locationId = portailClubIntParam($body['location_id'] ?? null, 'location_id');
    $typeSlug = strtolower(trim((string)($body['type_slug'] ?? '')));
    if (!portailClubMaterielIsSecurityTypeSlug($typeSlug)) {
        portailClubJsonFail('Type sécurité invalide.');
    }

    $item = portailClubMaterielGetSecurityEquipmentByLocationType($pdo, $locationId, $typeSlug);
    if ($item === null) {
        portailClubMaterielEnsureSecurityEquipmentForLocation($pdo, $locationId);
        $item = portailClubMaterielGetSecurityEquipmentByLocationType($pdo, $locationId, $typeSlug);
    }
    if ($item === null) {
        portailClubJsonFail('Équipement sécurité introuvable.');
    }

    $specsRaw = is_array($body['specs_json'] ?? null) ? $body['specs_json'] : [];
    if ($specsRaw === [] && is_array($item['specs_json'])) {
        $specsRaw = $item['specs_json'];
    }
    foreach (['supplier', 'capacity', 'revision_due_on', 'gauge_status', 'model', 'expiry_on',
        'mask_sizes', 'battery_on', 'electrodes_on', 'status', 'notes', 'quantity'] as $key) {
        if (array_key_exists($key, $body)) {
            $specsRaw[$key] = $body[$key];
        }
    }

    $specs = portailClubMaterielNormalizeSecuritySpecs($typeSlug, $specsRaw);
    $sets = ['specs_json = ?'];
    $params = [json_encode($specs, JSON_UNESCAPED_UNICODE)];

    if ($typeSlug === 'o2' && ($specs['supplier'] ?? '') !== '') {
        $sets[] = 'brand = ?';
        $params[] = $specs['supplier'];
    }
    if ($typeSlug === 'bavu') {
        $sets[] = 'expiry_on = ?';
        $params[] = $specs['expiry_on'];
    }
    if ($typeSlug === 'bavu' || $typeSlug === 'dae') {
        $model = (string)($specs['model'] ?? '');
        if ($model !== '') {
            $sets[] = 'model = ?';
            $params[] = $model;
        }
    }

    $params[] = (int)$item['id'];
    $pdo->prepare('UPDATE PORTAIL_CLUB_materiel_equipment SET ' . implode(', ', $sets) . ' WHERE id = ?')
        ->execute($params);

    $updated = portailClubMaterielGetEquipment($pdo, (int)$item['id']);
    return portailClubMaterielFormatSecurityCell($updated);
}

function portailClubMaterielAttachSecurityComplianceToItem(array $item): array
{
    $domain = (string)($item['type_domain'] ?? 'epi');
    if ($domain !== 'security') {
        return $item;
    }
    $sec = portailClubMaterielComputeSecurityCompliance($item);
    $item['security_status'] = $sec['security_status'];
    $item['security_alerts'] = $sec['security_alerts'];
    if (in_array($sec['security_status'], ['red', 'orange'], true)) {
        $item['revision_due'] = $sec['security_status'] === 'red';
        $item['renewal_soon'] = $sec['security_status'] === 'orange';
    }
    return $item;
}
