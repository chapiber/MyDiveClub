<?php
declare(strict_types=1);

require_once __DIR__ . '/api.inc.php';

const PORTAIL_CLUB_MATERIEL_STATES = ['operational', 'in_repair', 'scrapped', 'for_sale'];
const PORTAIL_CLUB_MATERIEL_INTERVENTION_SUBTYPES = ['revision', 'repair'];
const PORTAIL_CLUB_MATERIEL_CHECK_INPUT_TYPES = ['text', 'select_ok_ko', 'select_ok_ko_na'];

function portailClubMaterielStateLabel(string $state): string
{
    return match ($state) {
        'operational' => 'Opérationnel',
        'in_repair' => 'En réparation',
        'scrapped' => 'Au rebut',
        'for_sale' => 'À vendre',
        default => $state,
    };
}

function portailClubMaterielParseStructureIds(mixed $raw): array
{
    if ($raw === null || $raw === '' || $raw === []) {
        return [];
    }
    if (is_string($raw)) {
        $raw = array_filter(array_map('trim', explode(',', $raw)));
    }
    if (!is_array($raw)) {
        portailClubJsonFail('structure_ids invalide.');
    }
    $ids = [];
    foreach ($raw as $v) {
        if (!is_numeric($v)) {
            continue;
        }
        $n = (int)$v;
        if ($n >= 0) {
            $ids[$n] = $n;
        }
    }
    return array_values($ids);
}

/** @return array{0: string, 1: list<int>} */
function portailClubMaterielStructureFilterParts(array $structureIds, string $col = 'e.structure_id'): array
{
    if ($structureIds === []) {
        return ['', []];
    }
    $includeNone = in_array(0, $structureIds, true);
    $ids = array_values(array_filter($structureIds, static fn (int $id): bool => $id > 0));
    if ($includeNone && $ids === []) {
        return [" AND {$col} IS NULL", []];
    }
    if ($includeNone) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        return [" AND ({$col} IS NULL OR {$col} IN ({$ph}))", $ids];
    }
    $ph = implode(',', array_fill(0, count($ids), '?'));
    return [" AND {$col} IN ({$ph})", $ids];
}

function portailClubMaterielValidateStructureId(PDO $pdo, int $structureId): void
{
    $st = $pdo->prepare(
        'SELECT 1 FROM PORTAIL_CLUB_materiel_structures WHERE id = ? AND active = 1 LIMIT 1'
    );
    $st->execute([$structureId]);
    if (!$st->fetchColumn()) {
        portailClubJsonFail('Structure invalide ou inactive.');
    }
}

function portailClubMaterielValidatePersonId(PDO $pdo, int $personId): void
{
    $st = $pdo->prepare(
        'SELECT 1 FROM PORTAIL_CLUB_materiel_persons WHERE id = ? AND active = 1 LIMIT 1'
    );
    $st->execute([$personId]);
    if (!$st->fetchColumn()) {
        portailClubJsonFail('Personne invalide ou inactive.');
    }
}

function portailClubMaterielNormalizeState(mixed $value): string
{
    $v = strtolower(trim((string)$value));
    if (!in_array($v, PORTAIL_CLUB_MATERIEL_STATES, true)) {
        portailClubJsonFail('État invalide.');
    }
    return $v;
}

function portailClubMaterielNormalizeIdPrefix(mixed $value): string
{
    $s = strtoupper(trim((string)$value));
    if ($s === '' || strlen($s) > 16) {
        portailClubJsonFail('Préfixe ID requis (max 16 car.).');
    }
    if (!preg_match('/^[A-Z0-9\-_]+$/', $s)) {
        portailClubJsonFail('Préfixe ID : lettres, chiffres, tirets uniquement.');
    }
    return $s;
}

function portailClubMaterielResolveStructureIdPrefix(PDO $pdo, int $structureId): string
{
    $st = $pdo->prepare(
        'SELECT id_prefix FROM PORTAIL_CLUB_materiel_structures WHERE id = ? AND active = 1 LIMIT 1'
    );
    $st->execute([$structureId]);
    $prefix = $st->fetchColumn();
    if (is_string($prefix) && trim($prefix) !== '') {
        return strtoupper(trim($prefix));
    }
    $settings = portailClubMaterielGetSettings($pdo);
    return (string)$settings['id_prefix'];
}

function portailClubMaterielNormalizePublicId(mixed $value): string
{
    $s = strtoupper(trim((string)$value));
    if ($s === '' || strlen($s) > 64) {
        portailClubJsonFail('Identifiant public requis (max 64 car.).');
    }
    if (!preg_match('/^[A-Z0-9\-_]+$/', $s)) {
        portailClubJsonFail('Identifiant public : lettres, chiffres, tirets uniquement.');
    }
    return $s;
}

function portailClubMaterielGetSettings(PDO $pdo): array
{
    $rows = $pdo->query(
        'SELECT setting_key, value_json FROM PORTAIL_CLUB_materiel_settings'
    )->fetchAll();
    $out = [
        'nfc_enabled' => false,
        'id_prefix' => 'EQ-',
        'default_structure_id' => null,
    ];
    foreach ($rows as $row) {
        $key = (string)$row['setting_key'];
        $decoded = json_decode((string)$row['value_json'], true);
        if (!is_array($decoded) || !array_key_exists('value', $decoded)) {
            continue;
        }
        if ($key === 'nfc_enabled') {
            $out['nfc_enabled'] = (bool)$decoded['value'];
        } elseif ($key === 'id_prefix') {
            $out['id_prefix'] = (string)$decoded['value'];
        } elseif ($key === 'default_structure_id') {
            $out['default_structure_id'] = $decoded['value'] !== null ? (int)$decoded['value'] : null;
        }
    }
    return $out;
}

function portailClubMaterielPatchSettings(PDO $pdo, array $body): array
{
    $allowed = ['nfc_enabled', 'id_prefix', 'default_structure_id'];
    foreach ($allowed as $key) {
        if (!array_key_exists($key, $body)) {
            continue;
        }
        $val = $body[$key];
        if ($key === 'nfc_enabled') {
            $val = (bool)$val;
        } elseif ($key === 'id_prefix') {
            $val = portailClubTrimName($val, 'Préfixe ID', 16);
        } elseif ($key === 'default_structure_id') {
            if ($val === null || $val === '') {
                $val = null;
            } else {
                $val = portailClubIntParam($val, 'default_structure_id');
                portailClubMaterielValidateStructureId($pdo, $val);
            }
        }
        $st = $pdo->prepare(
            'INSERT INTO PORTAIL_CLUB_materiel_settings (setting_key, value_json)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)'
        );
        $st->execute([$key, json_encode(['value' => $val], JSON_UNESCAPED_UNICODE)]);
    }
    return portailClubMaterielGetSettings($pdo);
}

function portailClubMaterielListStructures(PDO $pdo, bool $activeOnly = false): array
{
    $sql = 'SELECT s.id, s.slug, s.label, s.id_prefix, s.active, s.sort_order,
            (SELECT COUNT(*) FROM PORTAIL_CLUB_materiel_equipment e WHERE e.structure_id = s.id) AS equipment_count
            FROM PORTAIL_CLUB_materiel_structures s';
    if ($activeOnly) {
        $sql .= ' WHERE active = 1';
    }
    $sql .= ' ORDER BY sort_order, label';
    return array_map(static function (array $r): array {
        return [
            'id' => (int)$r['id'],
            'slug' => $r['slug'],
            'label' => $r['label'],
            'id_prefix' => $r['id_prefix'] !== null && $r['id_prefix'] !== '' ? (string)$r['id_prefix'] : null,
            'active' => (bool)$r['active'],
            'sort_order' => (int)$r['sort_order'],
            'equipment_count' => (int)($r['equipment_count'] ?? 0),
        ];
    }, $pdo->query($sql)->fetchAll());
}

function portailClubMaterielCreateStructure(PDO $pdo, array $body): array
{
    $label = portailClubTrimName($body['label'] ?? '', 'Libellé structure');
    $slug = strtolower(trim((string)($body['slug'] ?? '')));
    if ($slug === '') {
        $slug = preg_replace('/[^a-z0-9]+/', '_', strtolower($label)) ?? 'structure';
    }
    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_materiel_structures (slug, label, id_prefix, sort_order)
         VALUES (?, ?, ?, ?)'
    );
    $idPrefix = null;
    if (isset($body['id_prefix']) && trim((string)$body['id_prefix']) !== '') {
        $idPrefix = portailClubMaterielNormalizeIdPrefix($body['id_prefix']);
    }
    $st->execute([$slug, $label, $idPrefix, (int)($body['sort_order'] ?? 0)]);
    return portailClubMaterielGetStructure($pdo, (int)$pdo->lastInsertId());
}

function portailClubMaterielGetStructure(PDO $pdo, int $id): array
{
    $st = $pdo->prepare(
        'SELECT id, slug, label, id_prefix, active, sort_order FROM PORTAIL_CLUB_materiel_structures WHERE id = ?'
    );
    $st->execute([$id]);
    $r = $st->fetch();
    if (!$r) {
        portailClubJsonFail('Structure introuvable.', 404);
    }
    return [
        'id' => (int)$r['id'],
        'slug' => $r['slug'],
        'label' => $r['label'],
        'id_prefix' => $r['id_prefix'] !== null && $r['id_prefix'] !== '' ? (string)$r['id_prefix'] : null,
        'active' => (bool)$r['active'],
        'sort_order' => (int)$r['sort_order'],
    ];
}

function portailClubMaterielPatchStructure(PDO $pdo, int $id, array $body): array
{
    portailClubMaterielGetStructure($pdo, $id);
    $sets = [];
    $params = [];
    if (array_key_exists('label', $body)) {
        $sets[] = 'label = ?';
        $params[] = portailClubTrimName($body['label'], 'Libellé structure');
    }
    if (array_key_exists('id_prefix', $body)) {
        if ($body['id_prefix'] === null || trim((string)$body['id_prefix']) === '') {
            $sets[] = 'id_prefix = NULL';
        } else {
            $sets[] = 'id_prefix = ?';
            $params[] = portailClubMaterielNormalizeIdPrefix($body['id_prefix']);
        }
    }
    if (array_key_exists('slug', $body)) {
        $sets[] = 'slug = ?';
        $params[] = strtolower(trim((string)$body['slug']));
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
        $pdo->prepare('UPDATE PORTAIL_CLUB_materiel_structures SET ' . implode(', ', $sets) . ' WHERE id = ?')
            ->execute($params);
    }
    return portailClubMaterielGetStructure($pdo, $id);
}

function portailClubMaterielDeleteStructure(PDO $pdo, int $id): array
{
    portailClubMaterielGetStructure($pdo, $id);
    $st = $pdo->prepare('SELECT COUNT(*) FROM PORTAIL_CLUB_materiel_equipment WHERE structure_id = ?');
    $st->execute([$id]);
    $equipCount = (int)$st->fetchColumn();

    $pdo->beginTransaction();
    try {
        $pdo->prepare('UPDATE PORTAIL_CLUB_materiel_equipment SET structure_id = NULL WHERE structure_id = ?')
            ->execute([$id]);
        $pdo->prepare('UPDATE PORTAIL_CLUB_materiel_persons SET structure_id = NULL WHERE structure_id = ?')
            ->execute([$id]);
        $settings = portailClubMaterielGetSettings($pdo);
        if ((int)($settings['default_structure_id'] ?? 0) === $id) {
            portailClubMaterielPatchSettings($pdo, ['default_structure_id' => null]);
        }
        $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_structures WHERE id = ?')->execute([$id]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    return ['deleted' => true, 'equipment_unassigned' => $equipCount];
}

function portailClubMaterielListRoles(PDO $pdo): array
{
    return array_map(static function (array $r): array {
        return [
            'id' => (int)$r['id'],
            'slug' => $r['slug'],
            'label' => $r['label'],
            'description' => $r['description'],
            'sort_order' => (int)$r['sort_order'],
        ];
    }, $pdo->query(
        'SELECT id, slug, label, description, sort_order
         FROM PORTAIL_CLUB_materiel_roles ORDER BY sort_order, label'
    )->fetchAll());
}

function portailClubMaterielCreateRole(PDO $pdo, array $body): array
{
    $label = portailClubTrimName($body['label'] ?? '', 'Libellé rôle');
    $slug = strtolower(trim((string)($body['slug'] ?? '')));
    if ($slug === '') {
        $slug = preg_replace('/[^a-z0-9]+/', '_', strtolower($label)) ?? 'role';
    }
    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_materiel_roles (slug, label, description, sort_order)
         VALUES (?, ?, ?, ?)'
    );
    $st->execute([
        $slug,
        $label,
        portailClubTrimOptionalName($body['description'] ?? '', 500),
        (int)($body['sort_order'] ?? 0),
    ]);
    return portailClubMaterielGetRole($pdo, (int)$pdo->lastInsertId());
}

function portailClubMaterielGetRole(PDO $pdo, int $id): array
{
    $st = $pdo->prepare(
        'SELECT id, slug, label, description, sort_order FROM PORTAIL_CLUB_materiel_roles WHERE id = ?'
    );
    $st->execute([$id]);
    $r = $st->fetch();
    if (!$r) {
        portailClubJsonFail('Rôle introuvable.', 404);
    }
    return [
        'id' => (int)$r['id'],
        'slug' => $r['slug'],
        'label' => $r['label'],
        'description' => $r['description'],
        'sort_order' => (int)$r['sort_order'],
    ];
}

function portailClubMaterielPatchRole(PDO $pdo, int $id, array $body): array
{
    portailClubMaterielGetRole($pdo, $id);
    $sets = [];
    $params = [];
    foreach (['label', 'slug', 'description'] as $field) {
        if (!array_key_exists($field, $body)) {
            continue;
        }
        if ($field === 'description') {
            $sets[] = 'description = ?';
            $params[] = portailClubTrimOptionalName($body[$field], 500);
        } elseif ($field === 'slug') {
            $sets[] = 'slug = ?';
            $params[] = strtolower(trim((string)$body[$field]));
        } else {
            $sets[] = "{$field} = ?";
            $params[] = portailClubTrimName($body[$field], 'Libellé rôle');
        }
    }
    if (array_key_exists('sort_order', $body)) {
        $sets[] = 'sort_order = ?';
        $params[] = (int)$body['sort_order'];
    }
    if ($sets !== []) {
        $params[] = $id;
        $pdo->prepare('UPDATE PORTAIL_CLUB_materiel_roles SET ' . implode(', ', $sets) . ' WHERE id = ?')
            ->execute($params);
    }
    return portailClubMaterielGetRole($pdo, $id);
}

function portailClubMaterielFetchPersonRoleIds(PDO $pdo, int $personId): array
{
    $st = $pdo->prepare(
        'SELECT role_id FROM PORTAIL_CLUB_materiel_person_role_links WHERE person_id = ?'
    );
    $st->execute([$personId]);
    return array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
}

function portailClubMaterielSyncPersonRoles(PDO $pdo, int $personId, array $roleIds): void
{
    $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_person_role_links WHERE person_id = ?')
        ->execute([$personId]);
    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_materiel_person_role_links (person_id, role_id) VALUES (?, ?)'
    );
    foreach ($roleIds as $rid) {
        if (!is_numeric($rid)) {
            continue;
        }
        $rid = (int)$rid;
        portailClubMaterielGetRole($pdo, $rid);
        $st->execute([$personId, $rid]);
    }
}

function portailClubMaterielFormatPerson(PDO $pdo, array $r, ?array $rolesById = null): array
{
    $pid = (int)$r['id'];
    $roleIds = portailClubMaterielFetchPersonRoleIds($pdo, $pid);
    $roleLabels = [];
    if ($rolesById !== null) {
        foreach ($roleIds as $rid) {
            if (isset($rolesById[$rid])) {
                $roleLabels[] = $rolesById[$rid];
            }
        }
    }
    return [
        'id' => $pid,
        'display_name' => $r['display_name'],
        'structure_id' => $r['structure_id'] !== null ? (int)$r['structure_id'] : null,
        'active' => (bool)$r['active'],
        'role_ids' => $roleIds,
        'role_labels' => $roleLabels,
    ];
}

function portailClubMaterielListPersons(PDO $pdo, bool $activeOnly = false): array
{
    $sql = 'SELECT id, display_name, structure_id, active FROM PORTAIL_CLUB_materiel_persons';
    if ($activeOnly) {
        $sql .= ' WHERE active = 1';
    }
    $sql .= ' ORDER BY display_name';
    $rows = $pdo->query($sql)->fetchAll();
    $rolesById = [];
    foreach (portailClubMaterielListRoles($pdo) as $role) {
        $rolesById[$role['id']] = $role['label'];
    }
    return array_map(fn(array $r) => portailClubMaterielFormatPerson($pdo, $r, $rolesById), $rows);
}

function portailClubMaterielCreatePerson(PDO $pdo, array $body): array
{
    $name = portailClubTrimName($body['display_name'] ?? '', 'Nom');
    $structureId = null;
    if (isset($body['structure_id']) && $body['structure_id'] !== '' && $body['structure_id'] !== null) {
        $structureId = portailClubIntParam($body['structure_id'], 'structure_id');
        portailClubMaterielValidateStructureId($pdo, $structureId);
    }
    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_materiel_persons (display_name, structure_id) VALUES (?, ?)'
    );
    $st->execute([$name, $structureId]);
    $id = (int)$pdo->lastInsertId();
    if (isset($body['role_ids']) && is_array($body['role_ids'])) {
        portailClubMaterielSyncPersonRoles($pdo, $id, $body['role_ids']);
    }
    return portailClubMaterielGetPerson($pdo, $id);
}

function portailClubMaterielGetPerson(PDO $pdo, int $id): array
{
    $st = $pdo->prepare(
        'SELECT id, display_name, structure_id, active FROM PORTAIL_CLUB_materiel_persons WHERE id = ?'
    );
    $st->execute([$id]);
    $r = $st->fetch();
    if (!$r) {
        portailClubJsonFail('Personne introuvable.', 404);
    }
    $rolesById = [];
    foreach (portailClubMaterielListRoles($pdo) as $role) {
        $rolesById[$role['id']] = $role['label'];
    }
    return portailClubMaterielFormatPerson($pdo, $r, $rolesById);
}

function portailClubMaterielPatchPerson(PDO $pdo, int $id, array $body): array
{
    portailClubMaterielGetPerson($pdo, $id);
    $sets = [];
    $params = [];
    if (array_key_exists('display_name', $body)) {
        $sets[] = 'display_name = ?';
        $params[] = portailClubTrimName($body['display_name'], 'Nom');
    }
    if (array_key_exists('structure_id', $body)) {
        if ($body['structure_id'] === null || $body['structure_id'] === '') {
            $sets[] = 'structure_id = NULL';
        } else {
            $sid = portailClubIntParam($body['structure_id'], 'structure_id');
            portailClubMaterielValidateStructureId($pdo, $sid);
            $sets[] = 'structure_id = ?';
            $params[] = $sid;
        }
    }
    if (array_key_exists('active', $body)) {
        $sets[] = 'active = ?';
        $params[] = (bool)$body['active'] ? 1 : 0;
    }
    if ($sets !== []) {
        $params[] = $id;
        $pdo->prepare('UPDATE PORTAIL_CLUB_materiel_persons SET ' . implode(', ', $sets) . ' WHERE id = ?')
            ->execute($params);
    }
    if (isset($body['role_ids']) && is_array($body['role_ids'])) {
        portailClubMaterielSyncPersonRoles($pdo, $id, $body['role_ids']);
    }
    return portailClubMaterielGetPerson($pdo, $id);
}

function portailClubMaterielGetCatalog(PDO $pdo): array
{
    $types = $pdo->query(
        'SELECT id, slug, label, renewal_years, min_stock_alert, trackable, sort_order
         FROM PORTAIL_CLUB_materiel_equipment_types ORDER BY sort_order, label'
    )->fetchAll();
    $checks = $pdo->query(
        'SELECT id, type_id, field_key, label, input_type, sort_order
         FROM PORTAIL_CLUB_materiel_equipment_type_checks ORDER BY sort_order'
    )->fetchAll();
    $checksByType = [];
    foreach ($checks as $c) {
        $tid = (int)$c['type_id'];
        $checksByType[$tid][] = [
            'id' => (int)$c['id'],
            'field_key' => $c['field_key'],
            'label' => $c['label'],
            'input_type' => $c['input_type'],
            'sort_order' => (int)$c['sort_order'],
        ];
    }
    $out = [];
    foreach ($types as $t) {
        $tid = (int)$t['id'];
        $out[] = [
            'id' => $tid,
            'slug' => $t['slug'],
            'label' => $t['label'],
            'renewal_years' => $t['renewal_years'] !== null ? (int)$t['renewal_years'] : null,
            'min_stock_alert' => $t['min_stock_alert'] !== null ? (int)$t['min_stock_alert'] : null,
            'trackable' => (bool)$t['trackable'],
            'sort_order' => (int)$t['sort_order'],
            'checks' => $checksByType[$tid] ?? [],
        ];
    }
    return ['types' => $out];
}

function portailClubMaterielGetEquipmentType(PDO $pdo, int $id): array
{
    foreach (portailClubMaterielGetCatalog($pdo)['types'] as $type) {
        if ($type['id'] === $id) {
            return $type;
        }
    }
    portailClubJsonFail('Type EPI introuvable.', 404);
}

function portailClubMaterielCreateEquipmentType(PDO $pdo, array $body): array
{
    $label = portailClubTrimName($body['label'] ?? '', 'Libellé type');
    $slug = strtolower(trim((string)($body['slug'] ?? '')));
    if ($slug === '') {
        $slug = preg_replace('/[^a-z0-9]+/', '_', strtolower($label)) ?? 'type';
    }
    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_materiel_equipment_types
         (slug, label, renewal_years, min_stock_alert, trackable, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $st->execute([
        $slug,
        $label,
        isset($body['renewal_years']) && $body['renewal_years'] !== '' ? (int)$body['renewal_years'] : null,
        isset($body['min_stock_alert']) && $body['min_stock_alert'] !== '' ? (int)$body['min_stock_alert'] : null,
        !isset($body['trackable']) || (bool)$body['trackable'] ? 1 : 0,
        (int)($body['sort_order'] ?? 0),
    ]);
    $typeId = (int)$pdo->lastInsertId();
    if (isset($body['checks']) && is_array($body['checks'])) {
        portailClubMaterielSyncTypeChecks($pdo, $typeId, $body['checks']);
    }
    return portailClubMaterielGetEquipmentType($pdo, $typeId);
}

function portailClubMaterielSyncTypeChecks(PDO $pdo, int $typeId, array $checks): void
{
    $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_equipment_type_checks WHERE type_id = ?')
        ->execute([$typeId]);
    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_materiel_equipment_type_checks
         (type_id, field_key, label, input_type, sort_order) VALUES (?, ?, ?, ?, ?)'
    );
    $order = 0;
    foreach ($checks as $check) {
        if (!is_array($check)) {
            continue;
        }
        $fieldKey = strtolower(trim((string)($check['field_key'] ?? '')));
        $label = portailClubTrimName($check['label'] ?? $fieldKey, 'Critère');
        if ($fieldKey === '') {
            continue;
        }
        $st->execute([
            $typeId,
            $fieldKey,
            $label,
            trim((string)($check['input_type'] ?? 'text')),
            (int)($check['sort_order'] ?? $order),
        ]);
        $order++;
    }
}

function portailClubMaterielPatchEquipmentType(PDO $pdo, int $id, array $body): array
{
    portailClubMaterielGetEquipmentType($pdo, $id);
    $sets = [];
    $params = [];
    foreach (['label', 'slug'] as $f) {
        if (!array_key_exists($f, $body)) {
            continue;
        }
        if ($f === 'slug') {
            $sets[] = 'slug = ?';
            $params[] = strtolower(trim((string)$body[$f]));
        } else {
            $sets[] = 'label = ?';
            $params[] = portailClubTrimName($body[$f], 'Libellé type');
        }
    }
    foreach (['renewal_years', 'min_stock_alert', 'sort_order'] as $f) {
        if (array_key_exists($f, $body)) {
            $sets[] = "{$f} = ?";
            $params[] = $body[$f] !== '' && $body[$f] !== null ? (int)$body[$f] : null;
        }
    }
    if (array_key_exists('trackable', $body)) {
        $sets[] = 'trackable = ?';
        $params[] = (bool)$body['trackable'] ? 1 : 0;
    }
    if ($sets !== []) {
        $params[] = $id;
        $pdo->prepare('UPDATE PORTAIL_CLUB_materiel_equipment_types SET ' . implode(', ', $sets) . ' WHERE id = ?')
            ->execute($params);
    }
    if (isset($body['checks']) && is_array($body['checks'])) {
        portailClubMaterielSyncTypeChecks($pdo, $id, $body['checks']);
    }
    return portailClubMaterielGetEquipmentType($pdo, $id);
}

function portailClubMaterielNormalizeCheckInputType(mixed $value): string
{
    $v = strtolower(trim((string)$value));
    if (!in_array($v, PORTAIL_CLUB_MATERIEL_CHECK_INPUT_TYPES, true)) {
        portailClubJsonFail('Type de champ invalide.');
    }
    return $v;
}

function portailClubMaterielFormatTypeCheck(array $r): array
{
    return [
        'id' => (int)$r['id'],
        'type_id' => (int)$r['type_id'],
        'field_key' => $r['field_key'],
        'label' => $r['label'],
        'input_type' => $r['input_type'],
        'sort_order' => (int)$r['sort_order'],
    ];
}

function portailClubMaterielGetTypeCheck(PDO $pdo, int $checkId): array
{
    $st = $pdo->prepare(
        'SELECT id, type_id, field_key, label, input_type, sort_order
         FROM PORTAIL_CLUB_materiel_equipment_type_checks WHERE id = ?'
    );
    $st->execute([$checkId]);
    $r = $st->fetch();
    if (!$r) {
        portailClubJsonFail('Critère introuvable.', 404);
    }
    return portailClubMaterielFormatTypeCheck($r);
}

function portailClubMaterielCreateTypeCheck(PDO $pdo, array $body): array
{
    $typeId = portailClubIntParam($body['type_id'] ?? null, 'type_id');
    portailClubMaterielGetEquipmentType($pdo, $typeId);
    $fieldKey = strtolower(trim((string)($body['field_key'] ?? '')));
    if ($fieldKey === '') {
        $label = portailClubTrimName($body['label'] ?? '', 'Libellé critère');
        $fieldKey = preg_replace('/[^a-z0-9]+/', '_', strtolower($label)) ?? 'critere';
    }
    $label = portailClubTrimName($body['label'] ?? $fieldKey, 'Libellé critère');
    $inputType = portailClubMaterielNormalizeCheckInputType($body['input_type'] ?? 'select_ok_ko');
    $sortOrder = (int)($body['sort_order'] ?? 0);
    if ($sortOrder <= 0) {
        $stMax = $pdo->prepare(
            'SELECT COALESCE(MAX(sort_order), 0) FROM PORTAIL_CLUB_materiel_equipment_type_checks WHERE type_id = ?'
        );
        $stMax->execute([$typeId]);
        $sortOrder = (int)$stMax->fetchColumn() + 1;
    }
    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_materiel_equipment_type_checks
         (type_id, field_key, label, input_type, sort_order) VALUES (?, ?, ?, ?, ?)'
    );
    $st->execute([$typeId, $fieldKey, $label, $inputType, $sortOrder]);
    return portailClubMaterielGetTypeCheck($pdo, (int)$pdo->lastInsertId());
}

function portailClubMaterielPatchTypeCheck(PDO $pdo, int $checkId, array $body): array
{
    $check = portailClubMaterielGetTypeCheck($pdo, $checkId);
    $sets = [];
    $params = [];
    if (array_key_exists('label', $body)) {
        $sets[] = 'label = ?';
        $params[] = portailClubTrimName($body['label'], 'Libellé critère');
    }
    if (array_key_exists('field_key', $body)) {
        $sets[] = 'field_key = ?';
        $params[] = strtolower(trim((string)$body['field_key']));
    }
    if (array_key_exists('input_type', $body)) {
        $sets[] = 'input_type = ?';
        $params[] = portailClubMaterielNormalizeCheckInputType($body['input_type']);
    }
    if (array_key_exists('sort_order', $body)) {
        $sets[] = 'sort_order = ?';
        $params[] = (int)$body['sort_order'];
    }
    if ($sets !== []) {
        $params[] = $checkId;
        $pdo->prepare(
            'UPDATE PORTAIL_CLUB_materiel_equipment_type_checks SET ' . implode(', ', $sets) . ' WHERE id = ?'
        )->execute($params);
    }
    return portailClubMaterielGetTypeCheck($pdo, $checkId);
}

function portailClubMaterielDeleteTypeCheck(PDO $pdo, int $checkId): void
{
    portailClubMaterielGetTypeCheck($pdo, $checkId);
    $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_equipment_type_checks WHERE id = ?')
        ->execute([$checkId]);
}

function portailClubMaterielFormatEquipmentRow(array $r): array
{
    return [
        'id' => (int)$r['id'],
        'public_id' => $r['public_id'],
        'structure_id' => $r['structure_id'] !== null ? (int)$r['structure_id'] : null,
        'structure_label' => $r['structure_label'] ?? null,
        'type_id' => (int)$r['type_id'],
        'type_slug' => $r['type_slug'] ?? null,
        'type_label' => $r['type_label'] ?? null,
        'brand' => $r['brand'],
        'purchase_year' => $r['purchase_year'] !== null ? (int)$r['purchase_year'] : null,
        'model' => $r['model'],
        'serial' => $r['serial'],
        'state' => $r['state'],
        'state_label' => portailClubMaterielStateLabel($r['state']),
        'nfc_linked' => (bool)$r['nfc_linked'],
        'nfc_linked_at' => $r['nfc_linked_at'],
        'notes' => $r['notes'],
        'created_at' => $r['created_at'],
        'updated_at' => $r['updated_at'],
    ];
}

function portailClubMaterielEquipmentSelectSql(): string
{
    return 'SELECT e.*, s.label AS structure_label, t.slug AS type_slug, t.label AS type_label
            FROM PORTAIL_CLUB_materiel_equipment e
            LEFT JOIN PORTAIL_CLUB_materiel_structures s ON s.id = e.structure_id
            JOIN PORTAIL_CLUB_materiel_equipment_types t ON t.id = e.type_id';
}

function portailClubMaterielListEquipment(PDO $pdo, array $filters = []): array
{
    $sql = portailClubMaterielEquipmentSelectSql() . ' WHERE 1=1';
    $params = [];

    $structureIds = portailClubMaterielParseStructureIds($filters['structure_ids'] ?? null);
    [$structSql, $structParams] = portailClubMaterielStructureFilterParts($structureIds);
    $sql .= $structSql;
    $params = array_merge($params, $structParams);

    $state = trim((string)($filters['state'] ?? ''));
    if ($state !== '') {
        $sql .= ' AND e.state = ?';
        $params[] = portailClubMaterielNormalizeState($state);
    }

    $typeId = (int)($filters['type_id'] ?? 0);
    if ($typeId > 0) {
        $sql .= ' AND e.type_id = ?';
        $params[] = $typeId;
    }

    $q = trim((string)($filters['q'] ?? ''));
    if ($q !== '') {
        $sql .= ' AND (e.public_id LIKE ? OR e.brand LIKE ? OR e.model LIKE ? OR e.serial LIKE ?)';
        $like = '%' . $q . '%';
        $params = array_merge($params, [$like, $like, $like, $like]);
    }

    $sql .= ' ORDER BY e.public_id';
    $st = $pdo->prepare($sql);
    $st->execute($params);
    return array_map('portailClubMaterielFormatEquipmentRow', $st->fetchAll());
}

function portailClubMaterielGetEquipment(PDO $pdo, int $id): array
{
    $st = $pdo->prepare(portailClubMaterielEquipmentSelectSql() . ' WHERE e.id = ?');
    $st->execute([$id]);
    $r = $st->fetch();
    if (!$r) {
        portailClubJsonFail('Matériel introuvable.', 404);
    }
    $item = portailClubMaterielFormatEquipmentRow($r);
    $item['state_log'] = portailClubMaterielListStateLog($pdo, $id);
    $item['interventions'] = portailClubMaterielListInterventions($pdo, $id);
    return $item;
}

function portailClubMaterielGetEquipmentByPublicId(PDO $pdo, string $publicId): array
{
    $st = $pdo->prepare(portailClubMaterielEquipmentSelectSql() . ' WHERE e.public_id = ?');
    $st->execute([portailClubMaterielNormalizePublicId($publicId)]);
    $r = $st->fetch();
    if (!$r) {
        portailClubJsonFail('Matériel introuvable.', 404);
    }
    return portailClubMaterielFormatEquipmentRow($r);
}

function portailClubMaterielCheckPublicIdAvailable(PDO $pdo, string $publicId, ?int $excludeId = null): bool
{
    $sql = 'SELECT 1 FROM PORTAIL_CLUB_materiel_equipment WHERE public_id = ?';
    $params = [$publicId];
    if ($excludeId !== null) {
        $sql .= ' AND id != ?';
        $params[] = $excludeId;
    }
    $st = $pdo->prepare($sql . ' LIMIT 1');
    $st->execute($params);
    return !$st->fetchColumn();
}

function portailClubMaterielSuggestNextPublicId(PDO $pdo, ?int $structureId = null): string
{
    if ($structureId !== null && $structureId > 0) {
        portailClubMaterielValidateStructureId($pdo, $structureId);
        $prefix = portailClubMaterielResolveStructureIdPrefix($pdo, $structureId);
    } else {
        $settings = portailClubMaterielGetSettings($pdo);
        $prefix = (string)$settings['id_prefix'];
    }
    $sql = 'SELECT public_id FROM PORTAIL_CLUB_materiel_equipment WHERE public_id LIKE ?';
    $params = [$prefix . '%'];
    if ($structureId !== null && $structureId > 0) {
        $sql .= ' AND structure_id = ?';
        $params[] = $structureId;
    }
    $sql .= ' ORDER BY id DESC LIMIT 1';
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $last = $st->fetchColumn();
    $num = 1;
    if (is_string($last) && preg_match('/(\d+)$/', $last, $m)) {
        $num = (int)$m[1] + 1;
    }
    return $prefix . str_pad((string)$num, 5, '0', STR_PAD_LEFT);
}

function portailClubMaterielCreateEquipment(PDO $pdo, array $body): array
{
    $publicId = portailClubMaterielNormalizePublicId($body['public_id'] ?? '');
    if (!portailClubMaterielCheckPublicIdAvailable($pdo, $publicId)) {
        portailClubJsonFail('Identifiant public déjà utilisé.');
    }
    $structureId = null;
    if (isset($body['structure_id']) && $body['structure_id'] !== '' && $body['structure_id'] !== null) {
        $structureId = portailClubIntParam($body['structure_id'], 'structure_id');
        portailClubMaterielValidateStructureId($pdo, $structureId);
    }
    $typeId = portailClubIntParam($body['type_id'] ?? null, 'type_id');
    portailClubMaterielGetEquipmentType($pdo, $typeId);

    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_materiel_equipment
         (public_id, structure_id, type_id, brand, purchase_year, model, serial, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $year = isset($body['purchase_year']) && $body['purchase_year'] !== '' ? (int)$body['purchase_year'] : null;
    $st->execute([
        $publicId,
        $structureId,
        $typeId,
        portailClubTrimOptionalName($body['brand'] ?? '', 120),
        $year,
        portailClubTrimOptionalName($body['model'] ?? '', 120),
        portailClubTrimOptionalName($body['serial'] ?? '', 120),
        portailClubTrimOptionalName($body['notes'] ?? '', 2000),
    ]);
    $id = (int)$pdo->lastInsertId();
    portailClubMaterielLogStateChange($pdo, $id, null, 'operational', null, null);
    return portailClubMaterielGetEquipment($pdo, $id);
}

function portailClubMaterielPatchEquipment(PDO $pdo, int $id, array $body): array
{
    portailClubMaterielGetEquipment($pdo, $id);
    $sets = [];
    $params = [];

    if (array_key_exists('public_id', $body)) {
        $pid = portailClubMaterielNormalizePublicId($body['public_id']);
        if (!portailClubMaterielCheckPublicIdAvailable($pdo, $pid, $id)) {
            portailClubJsonFail('Identifiant public déjà utilisé.');
        }
        $sets[] = 'public_id = ?';
        $params[] = $pid;
    }
    if (array_key_exists('structure_id', $body)) {
        if ($body['structure_id'] === null || $body['structure_id'] === '') {
            $sets[] = 'structure_id = NULL';
        } else {
            $sid = portailClubIntParam($body['structure_id'], 'structure_id');
            portailClubMaterielValidateStructureId($pdo, $sid);
            $sets[] = 'structure_id = ?';
            $params[] = $sid;
        }
    }
    if (array_key_exists('type_id', $body)) {
        $tid = portailClubIntParam($body['type_id'], 'type_id');
        portailClubMaterielGetEquipmentType($pdo, $tid);
        $sets[] = 'type_id = ?';
        $params[] = $tid;
    }
    foreach (['brand', 'model', 'serial', 'notes'] as $f) {
        if (array_key_exists($f, $body)) {
            $sets[] = "{$f} = ?";
            $max = $f === 'notes' ? 2000 : 120;
            $params[] = portailClubTrimOptionalName($body[$f], $max);
        }
    }
    if (array_key_exists('purchase_year', $body)) {
        $sets[] = 'purchase_year = ?';
        $params[] = $body['purchase_year'] !== '' && $body['purchase_year'] !== null ? (int)$body['purchase_year'] : null;
    }

    if ($sets !== []) {
        $params[] = $id;
        $pdo->prepare('UPDATE PORTAIL_CLUB_materiel_equipment SET ' . implode(', ', $sets) . ' WHERE id = ?')
            ->execute($params);
    }
    return portailClubMaterielGetEquipment($pdo, $id);
}

function portailClubMaterielLogStateChange(
    PDO $pdo,
    int $equipmentId,
    ?string $oldState,
    string $newState,
    ?int $personId,
    ?string $responsibleFree
): void {
    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_materiel_equipment_state_log
         (equipment_id, old_state, new_state, person_id, responsible_free)
         VALUES (?, ?, ?, ?, ?)'
    );
    $st->execute([
        $equipmentId,
        $oldState,
        $newState,
        $personId,
        $responsibleFree !== null && $responsibleFree !== '' ? portailClubTruncateName($responsibleFree, 120) : null,
    ]);
}

function portailClubMaterielChangeEquipmentState(PDO $pdo, int $id, array $body): array
{
    $item = portailClubMaterielGetEquipment($pdo, $id);
    $newState = portailClubMaterielNormalizeState($body['state'] ?? '');
    $personId = null;
    $free = portailClubTrimOptionalName($body['responsible_free'] ?? '', 120);
    if (isset($body['person_id']) && $body['person_id'] !== '' && $body['person_id'] !== null) {
        $personId = portailClubIntParam($body['person_id'], 'person_id');
        portailClubMaterielValidatePersonId($pdo, $personId);
    }
    if ($personId === null && $free === '') {
        portailClubJsonFail('Responsable requis (personne ou saisie libre).');
    }
    $pdo->prepare('UPDATE PORTAIL_CLUB_materiel_equipment SET state = ? WHERE id = ?')
        ->execute([$newState, $id]);
    portailClubMaterielLogStateChange($pdo, $id, $item['state'], $newState, $personId, $free);
    return portailClubMaterielGetEquipment($pdo, $id);
}

function portailClubMaterielSetNfcLinked(PDO $pdo, int $id, bool $linked): array
{
    portailClubMaterielGetEquipment($pdo, $id);
    $pdo->prepare(
        'UPDATE PORTAIL_CLUB_materiel_equipment
         SET nfc_linked = ?, nfc_linked_at = CASE WHEN ? = 1 THEN NOW() ELSE NULL END
         WHERE id = ?'
    )->execute([$linked ? 1 : 0, $linked ? 1 : 0, $id]);
    return portailClubMaterielGetEquipment($pdo, $id);
}

function portailClubMaterielListStateLog(PDO $pdo, int $equipmentId): array
{
    $st = $pdo->prepare(
        'SELECT l.*, p.display_name AS person_name
         FROM PORTAIL_CLUB_materiel_equipment_state_log l
         LEFT JOIN PORTAIL_CLUB_materiel_persons p ON p.id = l.person_id
         WHERE l.equipment_id = ?
         ORDER BY l.logged_at DESC'
    );
    $st->execute([$equipmentId]);
    return array_map(static function (array $r): array {
        return [
            'id' => (int)$r['id'],
            'old_state' => $r['old_state'],
            'new_state' => $r['new_state'],
            'old_state_label' => $r['old_state'] ? portailClubMaterielStateLabel($r['old_state']) : null,
            'new_state_label' => portailClubMaterielStateLabel($r['new_state']),
            'person_id' => $r['person_id'] !== null ? (int)$r['person_id'] : null,
            'person_name' => $r['person_name'],
            'responsible_free' => $r['responsible_free'],
            'logged_at' => $r['logged_at'],
        ];
    }, $st->fetchAll());
}

function portailClubMaterielListInterventions(PDO $pdo, ?int $equipmentId = null): array
{
    $sql = 'SELECT i.*, p.display_name AS person_name
            FROM PORTAIL_CLUB_materiel_interventions i
            LEFT JOIN PORTAIL_CLUB_materiel_persons p ON p.id = i.person_id';
    $params = [];
    if ($equipmentId !== null) {
        $sql .= ' WHERE i.equipment_id = ?';
        $params[] = $equipmentId;
    }
    $sql .= ' ORDER BY i.done_on DESC, i.id DESC';
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll();
    $out = [];
    foreach ($rows as $r) {
        $iid = (int)$r['id'];
        $out[] = [
            'id' => $iid,
            'equipment_id' => (int)$r['equipment_id'],
            'subtype' => $r['subtype'],
            'done_on' => $r['done_on'],
            'person_id' => $r['person_id'] !== null ? (int)$r['person_id'] : null,
            'person_name' => $r['person_name'],
            'responsible_free' => $r['responsible_free'],
            'summary' => $r['summary'],
            'check_values' => portailClubMaterielFetchInterventionChecks($pdo, $iid),
            'created_at' => $r['created_at'],
        ];
    }
    return $out;
}

function portailClubMaterielFetchInterventionChecks(PDO $pdo, int $interventionId): array
{
    $st = $pdo->prepare(
        'SELECT field_key, value FROM PORTAIL_CLUB_materiel_intervention_check_values
         WHERE intervention_id = ? ORDER BY field_key'
    );
    $st->execute([$interventionId]);
    $out = [];
    foreach ($st->fetchAll() as $r) {
        $out[$r['field_key']] = $r['value'];
    }
    return $out;
}

function portailClubMaterielCreateIntervention(PDO $pdo, array $body): array
{
    $equipmentId = portailClubIntParam($body['equipment_id'] ?? null, 'equipment_id');
    $equipment = portailClubMaterielGetEquipment($pdo, $equipmentId);
    $subtype = strtolower(trim((string)($body['subtype'] ?? '')));
    if (!in_array($subtype, PORTAIL_CLUB_MATERIEL_INTERVENTION_SUBTYPES, true)) {
        portailClubJsonFail('Sous-type intervention invalide.');
    }
    $doneOn = trim((string)($body['done_on'] ?? ''));
    if ($doneOn === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $doneOn)) {
        portailClubJsonFail('Date intervention invalide.');
    }
    $personId = null;
    $free = portailClubTrimOptionalName($body['responsible_free'] ?? '', 120);
    if (isset($body['person_id']) && $body['person_id'] !== '' && $body['person_id'] !== null) {
        $personId = portailClubIntParam($body['person_id'], 'person_id');
        portailClubMaterielValidatePersonId($pdo, $personId);
    }
    if ($personId === null && $free === '') {
        portailClubJsonFail('Responsable requis (personne ou saisie libre).');
    }
    $summary = portailClubTrimOptionalName($body['summary'] ?? '', 2000);
    if ($subtype === 'repair' && $summary === '') {
        portailClubJsonFail('Résumé obligatoire pour une réparation.');
    }

    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_materiel_interventions
         (equipment_id, subtype, done_on, person_id, responsible_free, summary)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $st->execute([$equipmentId, $subtype, $doneOn, $personId, $free !== '' ? $free : null, $summary !== '' ? $summary : null]);
    $interventionId = (int)$pdo->lastInsertId();

    if ($subtype === 'revision') {
        $type = portailClubMaterielGetEquipmentType($pdo, $equipment['type_id']);
        $checks = is_array($body['check_values'] ?? null) ? $body['check_values'] : [];
        $stCheck = $pdo->prepare(
            'INSERT INTO PORTAIL_CLUB_materiel_intervention_check_values (intervention_id, field_key, value)
             VALUES (?, ?, ?)'
        );
        foreach ($type['checks'] as $def) {
            $key = $def['field_key'];
            if (!array_key_exists($key, $checks)) {
                portailClubJsonFail("Critère « {$def['label']} » requis.");
            }
            $stCheck->execute([$interventionId, $key, trim((string)$checks[$key])]);
        }
    }

    foreach (portailClubMaterielListInterventions($pdo, $equipmentId) as $row) {
        if ($row['id'] === $interventionId) {
            return $row;
        }
    }
    portailClubJsonFail('Intervention créée mais introuvable.', 500);
}

function portailClubMaterielGetStats(PDO $pdo, array $structureIds = []): array
{
    [$structSql, $structParams] = portailClubMaterielStructureFilterParts($structureIds);
    $where = $structSql !== '' ? ' WHERE 1=1' . $structSql : '';
    $params = $structParams;

    $byState = [];
    $st = $pdo->prepare(
        'SELECT e.state, COUNT(*) AS cnt FROM PORTAIL_CLUB_materiel_equipment e' . $where . ' GROUP BY e.state'
    );
    $st->execute($params);
    foreach ($st->fetchAll() as $r) {
        $byState[] = [
            'state' => $r['state'],
            'label' => portailClubMaterielStateLabel($r['state']),
            'count' => (int)$r['cnt'],
        ];
    }

    $byType = [];
    $st = $pdo->prepare(
        'SELECT t.label, t.slug, COUNT(*) AS cnt
         FROM PORTAIL_CLUB_materiel_equipment e
         JOIN PORTAIL_CLUB_materiel_equipment_types t ON t.id = e.type_id' . $where .
        ' GROUP BY t.id ORDER BY cnt DESC'
    );
    $st->execute($params);
    foreach ($st->fetchAll() as $r) {
        $byType[] = ['label' => $r['label'], 'slug' => $r['slug'], 'count' => (int)$r['cnt']];
    }

    $byStructure = [];
    $st = $pdo->prepare(
        'SELECT COALESCE(s.id, 0) AS id, COALESCE(s.label, \'Sans structure\') AS label,
                COALESCE(s.sort_order, 9999) AS sort_order, COUNT(*) AS cnt
         FROM PORTAIL_CLUB_materiel_equipment e
         LEFT JOIN PORTAIL_CLUB_materiel_structures s ON s.id = e.structure_id' . $where .
        ' GROUP BY s.id, s.label, s.sort_order ORDER BY sort_order, label'
    );
    $st->execute($params);
    foreach ($st->fetchAll() as $r) {
        $byStructure[] = [
            'structure_id' => (int)$r['id'],
            'label' => $r['label'],
            'count' => (int)$r['cnt'],
        ];
    }

    $currentYear = (int)date('Y');
    $byAge = ['0-2' => 0, '3-5' => 0, '6-10' => 0, '10+' => 0, 'unknown' => 0];
    $st = $pdo->prepare(
        'SELECT purchase_year FROM PORTAIL_CLUB_materiel_equipment e' . $where
    );
    $st->execute($params);
    foreach ($st->fetchAll() as $r) {
        if ($r['purchase_year'] === null) {
            $byAge['unknown']++;
            continue;
        }
        $age = $currentYear - (int)$r['purchase_year'];
        if ($age <= 2) {
            $byAge['0-2']++;
        } elseif ($age <= 5) {
            $byAge['3-5']++;
        } elseif ($age <= 10) {
            $byAge['6-10']++;
        } else {
            $byAge['10+']++;
        }
    }
    $byAgeOut = [];
    foreach ($byAge as $bucket => $cnt) {
        $byAgeOut[] = ['bucket' => $bucket, 'count' => $cnt];
    }

    $stockAlerts = [];
    $types = portailClubMaterielGetCatalog($pdo)['types'];
    foreach ($types as $type) {
        if (!$type['trackable'] || $type['min_stock_alert'] === null) {
            continue;
        }
        $sql = 'SELECT COUNT(*) FROM PORTAIL_CLUB_materiel_equipment e
                WHERE e.type_id = ? AND e.state = \'operational\'';
        $p = [$type['id']];
        [$stockStructSql, $stockStructParams] = portailClubMaterielStructureFilterParts($structureIds);
        $sql .= $stockStructSql;
        $p = array_merge($p, $stockStructParams);
        $stCnt = $pdo->prepare($sql);
        $stCnt->execute($p);
        $cnt = (int)$stCnt->fetchColumn();
        if ($cnt < $type['min_stock_alert']) {
            $stockAlerts[] = [
                'type_id' => $type['id'],
                'type_label' => $type['label'],
                'count' => $cnt,
                'min_stock_alert' => $type['min_stock_alert'],
                'suggested_order' => $type['min_stock_alert'] - $cnt,
            ];
        }
    }

    return [
        'by_state' => $byState,
        'by_type' => $byType,
        'by_structure' => $byStructure,
        'by_age' => $byAgeOut,
        'stock_alerts' => $stockAlerts,
        'total' => array_sum(array_column($byState, 'count')),
    ];
}

function portailClubMaterielExportCsv(PDO $pdo, array $structureIds = []): string
{
    $items = portailClubMaterielListEquipment($pdo, [
        'structure_ids' => $structureIds,
    ]);
    $lines = [];
    $lines[] = implode(';', [
        'public_id', 'structure', 'type', 'brand', 'purchase_year', 'state', 'model', 'serial', 'nfc_linked',
    ]);
    foreach ($items as $item) {
        $lines[] = implode(';', [
            $item['public_id'],
            str_replace(';', ',', (string)($item['structure_label'] ?? 'Sans structure')),
            str_replace(';', ',', (string)$item['type_label']),
            str_replace(';', ',', $item['brand']),
            $item['purchase_year'] ?? '',
            $item['state'],
            str_replace(';', ',', $item['model']),
            str_replace(';', ',', $item['serial']),
            $item['nfc_linked'] ? '1' : '0',
        ]);
    }
    return "\xEF\xBB\xBF" . implode("\n", $lines);
}

function portailClubMaterielSortPersonsByRoleSuggestion(array $persons, array $roles, array $suggestedSlugs): array
{
    if ($suggestedSlugs === []) {
        return $persons;
    }
    $roleIdBySlug = [];
    foreach ($roles as $role) {
        $roleIdBySlug[$role['slug']] = $role['id'];
    }
    $suggestedRoleIds = [];
    foreach ($suggestedSlugs as $slug) {
        if (isset($roleIdBySlug[$slug])) {
            $suggestedRoleIds[$roleIdBySlug[$slug]] = true;
        }
    }
    $first = [];
    $rest = [];
    foreach ($persons as $p) {
        $match = false;
        foreach ($p['role_ids'] as $rid) {
            if (isset($suggestedRoleIds[$rid])) {
                $match = true;
                break;
            }
        }
        if ($match) {
            $first[] = $p;
        } else {
            $rest[] = $p;
        }
    }
    return array_merge($first, $rest);
}
