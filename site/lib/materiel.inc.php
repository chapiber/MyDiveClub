<?php
declare(strict_types=1);

require_once __DIR__ . '/api.inc.php';
require_once __DIR__ . '/materiel_manufacturer_renewal.inc.php';
require_once __DIR__ . '/materiel_security.inc.php';

const PORTAIL_CLUB_MATERIEL_STATES = ['operational', 'in_repair', 'scrapped', 'for_sale'];
const PORTAIL_CLUB_MATERIEL_INTERVENTION_SUBTYPES = ['revision', 'repair'];
const PORTAIL_CLUB_MATERIEL_CHECK_INPUT_TYPES = ['text', 'select_ok_ko', 'select_ok_ko_na', 'select_grading'];
const PORTAIL_CLUB_MATERIEL_GRADING_VALUES = ['ras', 'mineure', 'majeure', 'definitive'];
const PORTAIL_CLUB_MATERIEL_RENEWAL_POLICIES = ['manufacturer', 'health_score', 'manual'];
const PORTAIL_CLUB_MATERIEL_REVISION_POLICIES = ['annual_anniversary', 'annual_season', 'none'];
const PORTAIL_CLUB_MATERIEL_LIST_PAGE_SIZE = 100;
const PORTAIL_CLUB_MATERIEL_HEALTH_PENALTY_MINEURE = 5;
const PORTAIL_CLUB_MATERIEL_HEALTH_PENALTY_MAJEURE = 15;
const PORTAIL_CLUB_MATERIEL_HEALTH_PENALTY_REPAIR = 10;

function portailClubMaterielGradingLabel(string $value): string
{
    return match (portailClubMaterielNormalizeGradingValue($value)) {
        'ras' => 'RAS',
        'mineure' => 'Mineure',
        'majeure' => 'Majeure',
        'definitive' => 'Définitive',
        default => $value,
    };
}

function portailClubMaterielNormalizeGradingValue(mixed $value): string
{
    $v = strtolower(trim((string)$value));
    $map = [
        'ok' => 'ras',
        'ras' => 'ras',
        'mineure' => 'mineure',
        'majeure' => 'majeure',
        'definitive' => 'definitive',
        'définitive' => 'definitive',
    ];
    if (!isset($map[$v])) {
        portailClubJsonFail('Valeur de critère invalide (RAS / Mineure / Majeure / Définitive).');
    }
    return $map[$v];
}

/** @return array<string, mixed> */
function portailClubMaterielEmptyRegulatorSpecs(): array
{
    return [
        'model_hp' => '',
        'model_mp' => '',
        'model_octopus' => '',
        'serial_hp' => '',
        'serial_mp' => '',
        'serial_octopus' => '',
        'accessories' => '',
        'product_label' => '',
        'configuration' => '',
    ];
}

/** @return array<string, mixed> */
function portailClubMaterielEmptyRegulatorDetail(): array
{
    return [
        'tasks' => [
            'maint_hp' => false,
            'maint_mp' => false,
            'maint_octopus' => false,
            'maint_gauge' => false,
            'maint_hose' => false,
            'direct_system' => false,
            'hose_replaced' => false,
            'nipple_replaced' => false,
        ],
        'tasks_other' => [],
        'observations' => '',
        'parts_changed' => [],
        'test_values' => [
            'hp_test' => null,
            'mp_hp' => null,
            'mp_open_effort' => null,
            'mp_flow_effort' => null,
            'oct_open_effort' => null,
            'oct_flow_effort' => null,
            'gauge_precision' => null,
            'leak_test_ok' => null,
        ],
        'kits' => [
            'kit_hp_cpn' => '',
            'kit_hp_lot' => '',
            'kit_mp_cpn' => '',
            'kit_mp_lot' => '',
        ],
    ];
}

/** @param array<string, mixed> $raw */
function portailClubMaterielDecodeJsonColumn(mixed $raw): ?array
{
    if ($raw === null || $raw === '') {
        return null;
    }
    if (is_array($raw)) {
        return $raw;
    }
    $decoded = json_decode((string)$raw, true);
    return is_array($decoded) ? $decoded : null;
}

/** @param array<string, mixed> $detail */
function portailClubMaterielValidateRegulatorDetail(array $detail): array
{
    $base = portailClubMaterielEmptyRegulatorDetail();
    $tasks = is_array($detail['tasks'] ?? null) ? $detail['tasks'] : [];
    foreach ($base['tasks'] as $key => $default) {
        $base['tasks'][$key] = !empty($tasks[$key]);
    }
    $other = $detail['tasks_other'] ?? [];
    $base['tasks_other'] = is_array($other)
        ? array_values(array_filter(array_map(static fn($v) => portailClubTrimOptionalName($v, 200), $other)))
        : [];
    $base['observations'] = portailClubTrimOptionalName($detail['observations'] ?? '', 2000);
    $parts = $detail['parts_changed'] ?? [];
    $base['parts_changed'] = is_array($parts)
        ? array_values(array_filter(array_map(static fn($v) => portailClubTrimOptionalName($v, 200), $parts)))
        : [];
    $tests = is_array($detail['test_values'] ?? null) ? $detail['test_values'] : [];
    foreach ($base['test_values'] as $key => $default) {
        if ($key === 'leak_test_ok') {
            $base['test_values'][$key] = array_key_exists($key, $tests)
                ? (bool)$tests[$key]
                : null;
            continue;
        }
        $raw = $tests[$key] ?? null;
        $base['test_values'][$key] = ($raw === null || $raw === '') ? null : (float)$raw;
    }
    $kits = is_array($detail['kits'] ?? null) ? $detail['kits'] : [];
    foreach ($base['kits'] as $key => $default) {
        $base['kits'][$key] = portailClubTrimOptionalName($kits[$key] ?? '', 80);
    }
    if (isset($detail['legacy_checks']) && is_array($detail['legacy_checks'])) {
        $base['legacy_checks'] = $detail['legacy_checks'];
    }
    return $base;
}

/** @param array<string, mixed> $raw */
function portailClubMaterielNormalizeRegulatorSpecs(array $raw): array
{
    $base = portailClubMaterielEmptyRegulatorSpecs();
    foreach ($base as $key => $default) {
        $base[$key] = portailClubTrimOptionalName($raw[$key] ?? '', $key === 'accessories' || $key === 'configuration' ? 500 : 120);
    }
    return $base;
}

function portailClubMaterielNormalizeCheckValue(string $inputType, mixed $value): string
{
    if ($inputType === 'select_grading') {
        return portailClubMaterielNormalizeGradingValue($value);
    }
    return trim((string)$value);
}

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

function portailClubMaterielNormalizeRenewalPolicy(mixed $value): string
{
    $v = strtolower(trim((string)$value));
    if (!in_array($v, PORTAIL_CLUB_MATERIEL_RENEWAL_POLICIES, true)) {
        portailClubJsonFail('Politique de renouvellement invalide.');
    }
    return $v;
}

function portailClubMaterielNormalizeRevisionPolicy(mixed $value): string
{
    $v = strtolower(trim((string)$value));
    if (!in_array($v, PORTAIL_CLUB_MATERIEL_REVISION_POLICIES, true)) {
        portailClubJsonFail('Politique de révision invalide.');
    }
    return $v;
}

/** @param array<string, mixed> $t */
function portailClubMaterielFormatEquipmentTypeRow(array $t, array $checks = []): array
{
    $slug = (string)$t['slug'];
    $revisionPolicy = (string)($t['revision_policy'] ?? 'annual_season');
    $trackable = $revisionPolicy !== 'none';
    return [
        'id' => (int)$t['id'],
        'slug' => $slug,
        'domain' => (string)($t['domain'] ?? 'epi'),
        'label' => $t['label'],
        'renewal_years' => $t['renewal_years'] !== null ? (int)$t['renewal_years'] : null,
        'renewal_policy' => (string)($t['renewal_policy'] ?? 'manufacturer'),
        'renewal_health_threshold' => (int)($t['renewal_health_threshold'] ?? 40),
        'manufacturer_renewal_years' => portailClubMaterielManufacturerRenewalYears($slug),
        'revision_policy' => $revisionPolicy,
        'revision_season_month' => isset($t['revision_season_month']) && $t['revision_season_month'] !== null
            ? (int)$t['revision_season_month'] : null,
        'min_stock_alert' => $t['min_stock_alert'] !== null ? (int)$t['min_stock_alert'] : null,
        'trackable' => $trackable,
        'allows_pairing' => (bool)($t['allows_pairing'] ?? false),
        'sort_order' => (int)$t['sort_order'],
        'checks' => $checks,
    ];
}

function portailClubMaterielGetCatalog(PDO $pdo): array
{
    $types = $pdo->query(
        'SELECT id, slug, domain, label, renewal_years, renewal_policy, renewal_health_threshold,
                revision_policy, revision_season_month,
                min_stock_alert, trackable, allows_pairing, sort_order
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
        $out[] = portailClubMaterielFormatEquipmentTypeRow($t, $checksByType[$tid] ?? []);
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
        $slug = trim($slug, '_');
    }
    $dup = $pdo->prepare('SELECT 1 FROM PORTAIL_CLUB_materiel_equipment_types WHERE slug = ? LIMIT 1');
    $dup->execute([$slug]);
    if ($dup->fetchColumn()) {
        portailClubJsonFail('Ce code type (slug) existe déjà.');
    }
    $renewalPolicy = isset($body['renewal_policy'])
        ? portailClubMaterielNormalizeRenewalPolicy($body['renewal_policy'])
        : 'manufacturer';
    $revisionPolicy = isset($body['revision_policy'])
        ? portailClubMaterielNormalizeRevisionPolicy($body['revision_policy'])
        : 'annual_season';
    $seasonMonth = null;
    if ($revisionPolicy === 'annual_season') {
        $seasonMonth = isset($body['revision_season_month']) && $body['revision_season_month'] !== ''
            ? max(1, min(12, (int)$body['revision_season_month'])) : 1;
    }
    $healthThreshold = isset($body['renewal_health_threshold']) && $body['renewal_health_threshold'] !== ''
        ? max(0, min(100, (int)$body['renewal_health_threshold'])) : 40;
    $trackable = $revisionPolicy !== 'none' ? 1 : 0;
    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_materiel_equipment_types
         (slug, label, renewal_years, renewal_policy, renewal_health_threshold,
          revision_policy, revision_season_month,
          min_stock_alert, trackable, allows_pairing, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $st->execute([
        $slug,
        $label,
        isset($body['renewal_years']) && $body['renewal_years'] !== '' ? (int)$body['renewal_years'] : null,
        $renewalPolicy,
        $healthThreshold,
        $revisionPolicy,
        $seasonMonth,
        isset($body['min_stock_alert']) && $body['min_stock_alert'] !== '' ? (int)$body['min_stock_alert'] : null,
        $trackable,
        !empty($body['allows_pairing']) ? 1 : 0,
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
    foreach (['renewal_years', 'min_stock_alert', 'sort_order', 'renewal_health_threshold'] as $f) {
        if (array_key_exists($f, $body)) {
            $sets[] = "{$f} = ?";
            $params[] = $body[$f] !== '' && $body[$f] !== null ? (int)$body[$f] : null;
        }
    }
    if (array_key_exists('renewal_policy', $body)) {
        $sets[] = 'renewal_policy = ?';
        $params[] = portailClubMaterielNormalizeRenewalPolicy($body['renewal_policy']);
    }
    if (array_key_exists('revision_policy', $body)) {
        $revPol = portailClubMaterielNormalizeRevisionPolicy($body['revision_policy']);
        $sets[] = 'revision_policy = ?';
        $params[] = $revPol;
        $sets[] = 'trackable = ?';
        $params[] = $revPol !== 'none' ? 1 : 0;
        if ($revPol === 'annual_season') {
            $sets[] = 'revision_season_month = ?';
            $params[] = isset($body['revision_season_month']) && $body['revision_season_month'] !== ''
                ? max(1, min(12, (int)$body['revision_season_month'])) : 1;
        } else {
            $sets[] = 'revision_season_month = NULL';
        }
    } elseif (array_key_exists('revision_season_month', $body)) {
        $sets[] = 'revision_season_month = ?';
        $params[] = max(1, min(12, (int)$body['revision_season_month']));
    }
    if (array_key_exists('trackable', $body)) {
        $trackable = (bool)$body['trackable'];
        $sets[] = 'trackable = ?';
        $params[] = $trackable ? 1 : 0;
        if (!array_key_exists('revision_policy', $body)) {
            $sets[] = 'revision_policy = ?';
            $params[] = $trackable ? 'annual_season' : 'none';
            $sets[] = $trackable ? 'revision_season_month = COALESCE(revision_season_month, 1)' : 'revision_season_month = NULL';
        }
    }
    if (array_key_exists('allows_pairing', $body)) {
        $sets[] = 'allows_pairing = ?';
        $params[] = (bool)$body['allows_pairing'] ? 1 : 0;
    }
    if (array_key_exists('slug', $body)) {
        $newSlug = strtolower(trim((string)$body['slug']));
        if ($newSlug !== '') {
            $dup = $pdo->prepare(
                'SELECT 1 FROM PORTAIL_CLUB_materiel_equipment_types WHERE slug = ? AND id != ? LIMIT 1'
            );
            $dup->execute([$newSlug, $id]);
            if ($dup->fetchColumn()) {
                portailClubJsonFail('Ce code type (slug) existe déjà.');
            }
        }
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

function portailClubMaterielDeleteEquipmentType(PDO $pdo, int $id): void
{
    portailClubMaterielGetEquipmentType($pdo, $id);
    $st = $pdo->prepare('SELECT COUNT(*) FROM PORTAIL_CLUB_materiel_equipment WHERE type_id = ?');
    $st->execute([$id]);
    if ((int)$st->fetchColumn() > 0) {
        portailClubJsonFail('Impossible de supprimer : du matériel utilise encore ce type.');
    }
    $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_equipment_types WHERE id = ?')->execute([$id]);
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
    $typeSlug = $r['type_slug'] ?? null;
    $typeDomain = (string)($r['type_domain'] ?? 'epi');
    $specs = portailClubMaterielDecodeJsonColumn($r['specs_json'] ?? null);
    if ($typeSlug === 'regulator' && $specs === null) {
        $specs = portailClubMaterielEmptyRegulatorSpecs();
    }
    if ($typeDomain === 'security' && $specs === null && is_string($typeSlug)) {
        $specs = portailClubMaterielEmptySecuritySpecs($typeSlug);
    }
    return [
        'id' => (int)$r['id'],
        'public_id' => $r['public_id'],
        'structure_id' => $r['structure_id'] !== null ? (int)$r['structure_id'] : null,
        'structure_label' => $r['structure_label'] ?? null,
        'location_id' => isset($r['location_id']) && $r['location_id'] !== null ? (int)$r['location_id'] : null,
        'location_label' => $r['location_label'] ?? null,
        'type_id' => (int)$r['type_id'],
        'type_slug' => $typeSlug,
        'type_domain' => (string)($r['type_domain'] ?? 'epi'),
        'type_label' => $r['type_label'] ?? null,
        'brand' => $r['brand'],
        'purchase_year' => $r['purchase_year'] !== null ? (int)$r['purchase_year'] : null,
        'model' => $r['model'],
        'serial' => $r['serial'],
        'state' => $r['state'],
        'state_label' => portailClubMaterielStateLabel($r['state']),
        'nfc_linked' => (bool)$r['nfc_linked'],
        'nfc_linked_at' => $r['nfc_linked_at'],
        'nfc_group_id' => isset($r['nfc_group_id']) && $r['nfc_group_id'] !== null ? (int)$r['nfc_group_id'] : null,
        'nfc_group_size' => isset($r['nfc_group_size']) ? (int)$r['nfc_group_size'] : null,
        'pair_id' => isset($r['pair_id']) && $r['pair_id'] !== null ? (int)$r['pair_id'] : null,
        'notes' => $r['notes'],
        'renewal_flagged' => !empty($r['renewal_flagged']),
        'renewal_flagged_at' => $r['renewal_flagged_at'] ?? null,
        'health_score' => isset($r['health_score']) && $r['health_score'] !== null ? (int)$r['health_score'] : null,
        'specs_json' => $specs,
        'expiry_on' => isset($r['expiry_on']) && $r['expiry_on'] !== null ? (string)$r['expiry_on'] : null,
        'created_at' => $r['created_at'],
        'updated_at' => $r['updated_at'],
    ];
}

/** @return array{id:int,public_id:string,type_label:?string,state:string,state_label:string}|null */
function portailClubMaterielFormatPairPartnerFromRow(array $r): ?array
{
    if (empty($r['pair_partner_id'])) {
        return null;
    }
    $state = (string)($r['pair_partner_state'] ?? 'operational');
    return [
        'id' => (int)$r['pair_partner_id'],
        'public_id' => (string)$r['pair_partner_public_id'],
        'type_label' => $r['type_label'] ?? null,
        'state' => $state,
        'state_label' => portailClubMaterielStateLabel($state),
    ];
}

function portailClubMaterielFormatEquipmentRowWithPair(array $r): array
{
    $item = portailClubMaterielFormatEquipmentRow($r);
    $item['type_allows_pairing'] = !empty($r['type_allows_pairing']);
    $item['pair_partner'] = portailClubMaterielFormatPairPartnerFromRow($r);
    $item = portailClubMaterielAttachComplianceToItem($item, $r);
    return portailClubMaterielAttachSecurityComplianceToItem($item);
}

/** @return array{last_revision_on:?string,revision_due:bool,renewal_due:bool,renewal_soon:bool,health_score:?int} */
function portailClubMaterielComputeRevisionDueFromRow(array $r): bool
{
    $policy = (string)($r['type_revision_policy'] ?? 'annual_season');
    if ($policy === 'none') {
        return false;
    }
    $lastRev = isset($r['last_revision_on']) && $r['last_revision_on'] !== null && $r['last_revision_on'] !== ''
        ? (string)$r['last_revision_on']
        : null;
    if ($policy === 'annual_anniversary') {
        if ($lastRev === null) {
            return true;
        }
        $due = (new DateTimeImmutable($lastRev))->modify('+12 months');
        return $due <= new DateTimeImmutable('today');
    }
    // annual_season
    $month = (int)($r['type_revision_season_month'] ?? 1);
    $currentMonth = (int)date('n');
    if ($currentMonth < $month) {
        return false;
    }
    if ($lastRev === null) {
        return true;
    }
    return (int)substr($lastRev, 0, 4) < (int)date('Y');
}

/** @return array{renewal_due:bool,renewal_soon:bool} */
function portailClubMaterielComputeRenewalFromRow(array $r): array
{
    if (!empty($r['renewal_flagged'])) {
        return ['renewal_due' => true, 'renewal_soon' => false];
    }
    $policy = (string)($r['type_renewal_policy'] ?? 'manufacturer');
    $currentYear = (int)date('Y');
    if ($policy === 'manual') {
        return ['renewal_due' => false, 'renewal_soon' => false];
    }
    if ($policy === 'health_score') {
        $threshold = (int)($r['type_renewal_health_threshold'] ?? 40);
        $score = isset($r['health_score']) && $r['health_score'] !== null ? (int)$r['health_score'] : 100;
        return ['renewal_due' => $score < $threshold, 'renewal_soon' => false];
    }
    $purchaseYear = $r['purchase_year'] !== null ? (int)$r['purchase_year'] : null;
    if ($purchaseYear === null) {
        return ['renewal_due' => false, 'renewal_soon' => false];
    }
    $years = portailClubMaterielManufacturerRenewalYears((string)($r['type_slug'] ?? ''));
    $dueYear = $purchaseYear + $years;
    return [
        'renewal_due' => $dueYear <= $currentYear,
        'renewal_soon' => $dueYear > $currentYear && $dueYear <= $currentYear + 1,
    ];
}

/** @return array{last_revision_on:?string,revision_due:bool,renewal_due:bool,renewal_soon:bool,health_score:?int} */
function portailClubMaterielComputeComplianceFlags(array $r): array
{
    $lastRev = isset($r['last_revision_on']) && $r['last_revision_on'] !== null && $r['last_revision_on'] !== ''
        ? (string)$r['last_revision_on']
        : null;
    $renewal = portailClubMaterielComputeRenewalFromRow($r);
    $healthScore = isset($r['health_score']) && $r['health_score'] !== null ? (int)$r['health_score'] : null;

    return [
        'last_revision_on' => $lastRev,
        'revision_due' => portailClubMaterielComputeRevisionDueFromRow($r),
        'renewal_due' => $renewal['renewal_due'],
        'renewal_soon' => $renewal['renewal_soon'],
        'health_score' => $healthScore,
    ];
}

/** @param array<string, mixed> $item */
function portailClubMaterielAttachComplianceToItem(array $item, array $r): array
{
    $merged = array_merge($item, portailClubMaterielComputeComplianceFlags($r));
    $slug = (string)($item['type_slug'] ?? $r['type_slug'] ?? '');
    $merged['type_renewal_policy'] = (string)($r['type_renewal_policy'] ?? 'manufacturer');
    $merged['type_revision_policy'] = (string)($r['type_revision_policy'] ?? 'annual_season');
    $merged['type_revision_season_month'] = isset($r['type_revision_season_month']) && $r['type_revision_season_month'] !== null
        ? (int)$r['type_revision_season_month'] : null;
    $merged['type_renewal_health_threshold'] = (int)($r['type_renewal_health_threshold'] ?? 40);
    $merged['manufacturer_renewal_years'] = portailClubMaterielManufacturerRenewalYears($slug);
    return $merged;
}

function portailClubMaterielRevisionDueSql(): string
{
    return '('
        . '(t.revision_policy = \'annual_anniversary\' AND (rev.last_revision_on IS NULL OR rev.last_revision_on < DATE_SUB(CURDATE(), INTERVAL 12 MONTH)))'
        . ' OR (t.revision_policy = \'annual_season\' AND MONTH(CURDATE()) >= COALESCE(t.revision_season_month, 1)'
        . '     AND (rev.last_revision_on IS NULL OR YEAR(rev.last_revision_on) < YEAR(CURDATE())))'
        . ')';
}

function portailClubMaterielRenewalDueSql(): string
{
    $mfgYears = portailClubMaterielManufacturerRenewalYearsSql();
    return '('
        . 'e.renewal_flagged = 1'
        . ' OR (t.renewal_policy = \'manufacturer\' AND e.purchase_year IS NOT NULL'
        . "     AND (e.purchase_year + ({$mfgYears})) <= YEAR(CURDATE()))"
        . ' OR (t.renewal_policy = \'health_score\' AND e.health_score IS NOT NULL'
        . '     AND e.health_score < t.renewal_health_threshold)'
        . ')';
}

function portailClubMaterielRenewalSoonSql(): string
{
    $mfgYears = portailClubMaterielManufacturerRenewalYearsSql();
    return '('
        . 'e.renewal_flagged = 0'
        . ' AND t.renewal_policy = \'manufacturer\' AND e.purchase_year IS NOT NULL'
        . " AND (e.purchase_year + ({$mfgYears})) = YEAR(CURDATE()) + 1"
        . ')';
}

function portailClubMaterielComplianceFilterSql(string $compliance): string
{
    $compliance = strtolower(trim($compliance));
    return match ($compliance) {
        'revision_due' => ' AND ' . portailClubMaterielRevisionDueSql(),
        'renewal_due' => ' AND ' . portailClubMaterielRenewalDueSql(),
        'renewal_soon' => ' AND ' . portailClubMaterielRenewalSoonSql(),
        'any' => ' AND (' . portailClubMaterielRevisionDueSql()
            . ' OR ' . portailClubMaterielRenewalDueSql()
            . ' OR ' . portailClubMaterielRenewalSoonSql() . ')',
        default => '',
    };
}

function portailClubMaterielEquipmentSelectSql(): string
{
    return 'SELECT e.*, s.label AS structure_label,
            loc.label AS location_label,
            t.slug AS type_slug, t.domain AS type_domain, t.label AS type_label,
            t.trackable AS type_trackable, t.renewal_years AS type_renewal_years,
            t.renewal_policy AS type_renewal_policy, t.renewal_health_threshold AS type_renewal_health_threshold,
            t.revision_policy AS type_revision_policy, t.revision_season_month AS type_revision_season_month,
            t.allows_pairing AS type_allows_pairing,
            rev.last_revision_on,
            (SELECT COUNT(*) FROM PORTAIL_CLUB_materiel_equipment g
             WHERE g.nfc_group_id = e.nfc_group_id AND e.nfc_group_id IS NOT NULL) AS nfc_group_size,
            (SELECT p.id FROM PORTAIL_CLUB_materiel_equipment p
             WHERE p.pair_id = e.pair_id AND p.id != e.id AND e.pair_id IS NOT NULL LIMIT 1) AS pair_partner_id,
            (SELECT p.public_id FROM PORTAIL_CLUB_materiel_equipment p
             WHERE p.pair_id = e.pair_id AND p.id != e.id AND e.pair_id IS NOT NULL LIMIT 1) AS pair_partner_public_id,
            (SELECT p.state FROM PORTAIL_CLUB_materiel_equipment p
             WHERE p.pair_id = e.pair_id AND p.id != e.id AND e.pair_id IS NOT NULL LIMIT 1) AS pair_partner_state
            FROM PORTAIL_CLUB_materiel_equipment e
            LEFT JOIN PORTAIL_CLUB_materiel_structures s ON s.id = e.structure_id
            LEFT JOIN PORTAIL_CLUB_materiel_locations loc ON loc.id = e.location_id
            JOIN PORTAIL_CLUB_materiel_equipment_types t ON t.id = e.type_id
            LEFT JOIN (
                SELECT equipment_id, MAX(done_on) AS last_revision_on
                FROM PORTAIL_CLUB_materiel_interventions
                WHERE subtype = \'revision\'
                GROUP BY equipment_id
            ) rev ON rev.equipment_id = e.id';
}

/** @return array{0:string,1:list<mixed>} */
function portailClubMaterielListEquipmentFilterParts(array $filters): array
{
    $sql = '';
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

    $nfcLinked = trim((string)($filters['nfc_linked'] ?? ''));
    if ($nfcLinked === '1' || $nfcLinked === 'linked') {
        $sql .= ' AND e.nfc_linked = 1';
    } elseif ($nfcLinked === '0' || $nfcLinked === 'unlinked') {
        $sql .= ' AND e.nfc_linked = 0';
    }

    if (!empty($filters['unpaired'])) {
        $sql .= ' AND e.pair_id IS NULL';
    }

    $compliance = trim((string)($filters['compliance'] ?? ''));
    if ($compliance !== '') {
        $sql .= portailClubMaterielComplianceFilterSql($compliance);
    }

    $domain = strtolower(trim((string)($filters['domain'] ?? '')));
    if ($domain === 'epi' || $domain === 'security') {
        $sql .= ' AND t.domain = ?';
        $params[] = $domain;
    }

    $locationId = (int)($filters['location_id'] ?? 0);
    if ($locationId > 0) {
        $sql .= ' AND e.location_id = ?';
        $params[] = $locationId;
    }

    return [$sql, $params];
}

function portailClubMaterielListEquipment(PDO $pdo, array $filters = []): array
{
    [$filterSql, $params] = portailClubMaterielListEquipmentFilterParts($filters);
    $baseSql = portailClubMaterielEquipmentSelectSql() . ' WHERE 1=1' . $filterSql;
    $limit = isset($filters['limit']) ? max(1, min(PORTAIL_CLUB_MATERIEL_LIST_PAGE_SIZE, (int)$filters['limit'])) : 0;
    $page = max(1, (int)($filters['page'] ?? 1));

    if ($limit > 0) {
        $countSt = $pdo->prepare(
            'SELECT COUNT(*) FROM PORTAIL_CLUB_materiel_equipment e
             JOIN PORTAIL_CLUB_materiel_equipment_types t ON t.id = e.type_id
             LEFT JOIN PORTAIL_CLUB_materiel_structures s ON s.id = e.structure_id
             LEFT JOIN (
                 SELECT equipment_id, MAX(done_on) AS last_revision_on
                 FROM PORTAIL_CLUB_materiel_interventions
                 WHERE subtype = \'revision\'
                 GROUP BY equipment_id
             ) rev ON rev.equipment_id = e.id
             WHERE 1=1' . $filterSql
        );
        $countSt->execute($params);
        $total = (int)$countSt->fetchColumn();
        $offset = ($page - 1) * $limit;
        $sql = $baseSql . ' ORDER BY e.public_id LIMIT ' . $limit . ' OFFSET ' . $offset;
        $st = $pdo->prepare($sql);
        $st->execute($params);
        $items = array_map('portailClubMaterielFormatEquipmentRowWithPair', $st->fetchAll());
        $totalPages = $total > 0 ? (int)ceil($total / $limit) : 1;
        return [
            'items' => $items,
            'pagination' => [
                'page' => $page,
                'limit' => $limit,
                'total' => $total,
                'total_pages' => $totalPages,
            ],
        ];
    }

    $sql = $baseSql . ' ORDER BY e.public_id';
    $st = $pdo->prepare($sql);
    $st->execute($params);
    return array_map('portailClubMaterielFormatEquipmentRowWithPair', $st->fetchAll());
}

function portailClubMaterielGetEquipment(PDO $pdo, int $id): array
{
    $st = $pdo->prepare(portailClubMaterielEquipmentSelectSql() . ' WHERE e.id = ?');
    $st->execute([$id]);
    $r = $st->fetch();
    if (!$r) {
        portailClubJsonFail('Matériel introuvable.', 404);
    }
    $item = portailClubMaterielFormatEquipmentRowWithPair($r);
    $item['state_log'] = portailClubMaterielListStateLog($pdo, $id);
    $item['interventions'] = portailClubMaterielListInterventions($pdo, $id);
    $item['nfc_group_members'] = portailClubMaterielListNfcGroupMembers($pdo, $item['nfc_group_id']);
    return $item;
}

/** @return list<array<string, mixed>> */
function portailClubMaterielListNfcGroupMembers(PDO $pdo, ?int $groupId): array
{
    if ($groupId === null || $groupId <= 0) {
        return [];
    }
    $st = $pdo->prepare(
        portailClubMaterielEquipmentSelectSql() . ' WHERE e.nfc_group_id = ? ORDER BY e.public_id'
    );
    $st->execute([$groupId]);
    return array_map(static function (array $row): array {
        $item = portailClubMaterielFormatEquipmentRow($row);
        return [
            'id' => $item['id'],
            'public_id' => $item['public_id'],
            'type_label' => $item['type_label'],
            'type_slug' => $item['type_slug'],
            'brand' => $item['brand'],
            'state' => $item['state'],
            'state_label' => $item['state_label'],
        ];
    }, $st->fetchAll());
}

/** @param list<int> $equipmentIds */
function portailClubMaterielAssignNfcGroup(PDO $pdo, array $equipmentIds): int
{
    $equipmentIds = array_values(array_unique(array_filter(array_map('intval', $equipmentIds))));
    if ($equipmentIds === []) {
        portailClubJsonFail('Aucun équipement pour le groupe NFC.');
    }
    foreach ($equipmentIds as $eid) {
        portailClubMaterielGetEquipment($pdo, $eid);
    }

    $existingGroupId = null;
    foreach ($equipmentIds as $eid) {
        $st = $pdo->prepare('SELECT nfc_group_id FROM PORTAIL_CLUB_materiel_equipment WHERE id = ?');
        $st->execute([$eid]);
        $gid = $st->fetchColumn();
        if ($gid !== false && $gid !== null && (int)$gid > 0) {
            if ($existingGroupId === null) {
                $existingGroupId = (int)$gid;
            } elseif ($existingGroupId !== (int)$gid) {
                portailClubJsonFail('Ces équipements appartiennent déjà à des badges différents.');
            }
        }
    }

    if ($existingGroupId === null) {
        $pdo->exec('INSERT INTO PORTAIL_CLUB_materiel_nfc_groups () VALUES ()');
        $existingGroupId = (int)$pdo->lastInsertId();
    }

    $ph = implode(',', array_fill(0, count($equipmentIds), '?'));
    $st = $pdo->prepare(
        "UPDATE PORTAIL_CLUB_materiel_equipment SET nfc_group_id = ? WHERE id IN ({$ph})"
    );
    $st->execute(array_merge([$existingGroupId], $equipmentIds));

    return $existingGroupId;
}

/** @param list<int> $memberIds IDs additionnels (hors équipement principal) */
function portailClubMaterielLinkNfc(PDO $pdo, int $id, array $memberIds = []): array
{
    $allIds = array_merge([$id], $memberIds);
    portailClubMaterielAssignNfcGroup($pdo, $allIds);

    $ph = implode(',', array_fill(0, count($allIds), '?'));
    $pdo->prepare(
        "UPDATE PORTAIL_CLUB_materiel_equipment
         SET nfc_linked = 1, nfc_linked_at = NOW()
         WHERE id IN ({$ph})"
    )->execute($allIds);

    error_log('[materiel] nfc_link group ids=' . implode(',', $allIds));
    return portailClubMaterielGetEquipment($pdo, $id);
}

function portailClubMaterielUnlinkNfc(PDO $pdo, int $id): array
{
    $item = portailClubMaterielGetEquipment($pdo, $id);
    $groupId = $item['nfc_group_id'];
    error_log('[materiel] nfc_unlink id=' . $id . ' public_id=' . $item['public_id'] . ' group=' . ($groupId ?? 'null'));

    if ($groupId !== null && $groupId > 0) {
        $pdo->prepare(
            'UPDATE PORTAIL_CLUB_materiel_equipment
             SET nfc_linked = 0, nfc_linked_at = NULL, nfc_group_id = NULL
             WHERE nfc_group_id = ?'
        )->execute([$groupId]);
        $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_nfc_groups WHERE id = ?')->execute([$groupId]);
    } else {
        $pdo->prepare(
            'UPDATE PORTAIL_CLUB_materiel_equipment
             SET nfc_linked = 0, nfc_linked_at = NULL, nfc_group_id = NULL
             WHERE id = ?'
        )->execute([$id]);
    }
    return portailClubMaterielGetEquipment($pdo, $id);
}

function portailClubMaterielSetNfcLinked(PDO $pdo, int $id, bool $linked): array
{
    if (!$linked) {
        return portailClubMaterielUnlinkNfc($pdo, $id);
    }
    return portailClubMaterielLinkNfc($pdo, $id, []);
}

function portailClubMaterielAddToNfcGroup(PDO $pdo, int $id, int $addId): array
{
    if ($id === $addId) {
        portailClubJsonFail('Impossible d\'associer un équipement à lui-même.');
    }
    $item = portailClubMaterielGetEquipment($pdo, $id);
    portailClubMaterielGetEquipment($pdo, $addId);
    if (!$item['nfc_linked']) {
        portailClubJsonFail('L\'équipement principal n\'a pas encore de badge associé.');
    }
    portailClubMaterielLinkNfc($pdo, $id, [$addId]);
    return portailClubMaterielGetEquipment($pdo, $id);
}

function portailClubMaterielRemoveFromNfcGroup(PDO $pdo, int $id): array
{
    $item = portailClubMaterielGetEquipment($pdo, $id);
    $groupId = $item['nfc_group_id'];
    if ($groupId === null || $groupId <= 0) {
        return portailClubMaterielUnlinkNfc($pdo, $id);
    }
    $members = portailClubMaterielListNfcGroupMembers($pdo, $groupId);
    if (count($members) <= 1) {
        return portailClubMaterielUnlinkNfc($pdo, $id);
    }

    $pdo->prepare(
        'UPDATE PORTAIL_CLUB_materiel_equipment
         SET nfc_linked = 0, nfc_linked_at = NULL, nfc_group_id = NULL
         WHERE id = ?'
    )->execute([$id]);

    $remaining = array_values(array_filter($members, static fn (array $m): bool => $m['id'] !== $id));
    if (count($remaining) === 1) {
        $pdo->prepare(
            'UPDATE PORTAIL_CLUB_materiel_equipment SET nfc_group_id = NULL WHERE id = ?'
        )->execute([(int)$remaining[0]['id']]);
        $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_nfc_groups WHERE id = ?')->execute([$groupId]);
    }

    return portailClubMaterielGetEquipment($pdo, $id);
}

function portailClubMaterielAssertTypeAllowsPairing(PDO $pdo, int $typeId): void
{
    $st = $pdo->prepare(
        'SELECT allows_pairing FROM PORTAIL_CLUB_materiel_equipment_types WHERE id = ? LIMIT 1'
    );
    $st->execute([$typeId]);
    if (!(bool)$st->fetchColumn()) {
        portailClubJsonFail('Ce type d\'équipement ne permet pas de former une paire.');
    }
}

function portailClubMaterielLinkPair(PDO $pdo, int $id, int $partnerId): array
{
    if ($id === $partnerId) {
        portailClubJsonFail('Impossible de former une paire avec le même équipement.');
    }
    $item = portailClubMaterielGetEquipment($pdo, $id);
    $partner = portailClubMaterielGetEquipment($pdo, $partnerId);

    if ((int)$item['type_id'] !== (int)$partner['type_id']) {
        portailClubJsonFail('Les deux équipements doivent être du même type.');
    }
    portailClubMaterielAssertTypeAllowsPairing($pdo, (int)$item['type_id']);

    if ($item['pair_id'] !== null && $item['pair_id'] > 0) {
        portailClubJsonFail('Cet équipement fait déjà partie d\'une paire.');
    }
    if ($partner['pair_id'] !== null && $partner['pair_id'] > 0) {
        portailClubJsonFail('L\'équipement sélectionné fait déjà partie d\'une paire.');
    }

    $pdo->exec('INSERT INTO PORTAIL_CLUB_materiel_pairs () VALUES ()');
    $pairId = (int)$pdo->lastInsertId();
    $st = $pdo->prepare('UPDATE PORTAIL_CLUB_materiel_equipment SET pair_id = ? WHERE id IN (?, ?)');
    $st->execute([$pairId, $id, $partnerId]);

    error_log('[materiel] pair_link ids=' . $id . ',' . $partnerId . ' pair_id=' . $pairId);
    return portailClubMaterielGetEquipment($pdo, $id);
}

function portailClubMaterielUnlinkPair(PDO $pdo, int $id): array
{
    $item = portailClubMaterielGetEquipment($pdo, $id);
    $pairId = $item['pair_id'];
    if ($pairId === null || $pairId <= 0) {
        return $item;
    }

    $pdo->prepare(
        'UPDATE PORTAIL_CLUB_materiel_equipment SET pair_id = NULL WHERE pair_id = ?'
    )->execute([$pairId]);
    $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_pairs WHERE id = ?')->execute([$pairId]);

    error_log('[materiel] pair_unlink id=' . $id . ' pair_id=' . $pairId);
    return portailClubMaterielGetEquipment($pdo, $id);
}

function portailClubMaterielListEquipmentByPublicId(PDO $pdo, string $publicId, ?int $typeId = null): array
{
    $publicId = portailClubMaterielNormalizePublicId($publicId);
    $sql = portailClubMaterielEquipmentSelectSql() . ' WHERE e.public_id = ?';
    $params = [$publicId];
    if ($typeId !== null && $typeId > 0) {
        $sql .= ' AND e.type_id = ?';
        $params[] = $typeId;
    }
    $sql .= ' ORDER BY t.label, e.id';
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll();
    return array_map('portailClubMaterielFormatEquipmentRowWithPair', $rows);
}

function portailClubMaterielGetEquipmentByPublicId(PDO $pdo, string $publicId, ?int $typeId = null): array
{
    $matches = portailClubMaterielListEquipmentByPublicId($pdo, $publicId, $typeId);
    if ($matches === []) {
        portailClubJsonFail('Matériel introuvable.', 404);
    }
    if (count($matches) > 1 && ($typeId === null || $typeId <= 0)) {
        portailClubJsonFail('Plusieurs matériels portent cet identifiant — précisez le type.', 409);
    }
    return $matches[0];
}

function portailClubMaterielCheckPublicIdAvailable(
    PDO $pdo,
    string $publicId,
    int $typeId,
    ?int $excludeId = null
): bool {
    portailClubMaterielGetEquipmentType($pdo, $typeId);
    $sql = 'SELECT 1 FROM PORTAIL_CLUB_materiel_equipment WHERE public_id = ? AND type_id = ?';
    $params = [$publicId, $typeId];
    if ($excludeId !== null) {
        $sql .= ' AND id != ?';
        $params[] = $excludeId;
    }
    $st = $pdo->prepare($sql . ' LIMIT 1');
    $st->execute($params);
    return !$st->fetchColumn();
}

function portailClubMaterielSuggestNextPublicId(PDO $pdo, ?int $structureId = null, ?int $typeId = null): string
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
    if ($typeId !== null && $typeId > 0) {
        portailClubMaterielGetEquipmentType($pdo, $typeId);
        $sql .= ' AND type_id = ?';
        $params[] = $typeId;
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
    $typeId = portailClubIntParam($body['type_id'] ?? null, 'type_id');
    if (!portailClubMaterielCheckPublicIdAvailable($pdo, $publicId, $typeId)) {
        portailClubJsonFail('Identifiant déjà utilisé pour ce type de matériel.');
    }
    $structureId = null;
    if (isset($body['structure_id']) && $body['structure_id'] !== '' && $body['structure_id'] !== null) {
        $structureId = portailClubIntParam($body['structure_id'], 'structure_id');
        portailClubMaterielValidateStructureId($pdo, $structureId);
    }
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
    if (!empty($body['nfc_linked'])) {
        error_log('[materiel] create nfc_linked flag id=' . $id . ' public_id=' . $publicId);
        portailClubMaterielSetNfcLinked($pdo, $id, true);
    } else {
        error_log('[materiel] create id=' . $id . ' public_id=' . $publicId . ' nfc_pending_write');
    }
    return portailClubMaterielGetEquipment($pdo, $id);
}

function portailClubMaterielApplyHealthGradingPenalty(int $score, string $grading): int
{
    return match (strtolower(trim($grading))) {
        'mineure' => max(0, $score - PORTAIL_CLUB_MATERIEL_HEALTH_PENALTY_MINEURE),
        'majeure' => max(0, $score - PORTAIL_CLUB_MATERIEL_HEALTH_PENALTY_MAJEURE),
        'definitive' => 0,
        default => $score,
    };
}

function portailClubMaterielComputeHealthScoreFromInterventions(array $interventions): int
{
    $score = 100;
    usort($interventions, static function (array $a, array $b): int {
        return strcmp((string)($a['done_on'] ?? ''), (string)($b['done_on'] ?? ''));
    });
    foreach ($interventions as $intv) {
        if ($score <= 0) {
            break;
        }
        if (($intv['subtype'] ?? '') === 'repair') {
            $score = max(0, $score - PORTAIL_CLUB_MATERIEL_HEALTH_PENALTY_REPAIR);
            continue;
        }
        if (($intv['subtype'] ?? '') !== 'revision') {
            continue;
        }
        $checks = is_array($intv['check_values'] ?? null) ? $intv['check_values'] : [];
        foreach ($checks as $value) {
            if ($score <= 0) {
                break 2;
            }
            $v = strtolower(trim((string)$value));
            if (!in_array($v, PORTAIL_CLUB_MATERIEL_GRADING_VALUES, true)) {
                continue;
            }
            $score = portailClubMaterielApplyHealthGradingPenalty($score, $v);
        }
    }
    return max(0, min(100, $score));
}

function portailClubMaterielRecomputeHealthScore(PDO $pdo, int $equipmentId): int
{
    $interventions = portailClubMaterielListInterventions($pdo, $equipmentId);
    $score = portailClubMaterielComputeHealthScoreFromInterventions($interventions);
    $pdo->prepare(
        'UPDATE PORTAIL_CLUB_materiel_equipment SET health_score = ?, health_score_at = NOW() WHERE id = ?'
    )->execute([$score, $equipmentId]);
    return $score;
}

function portailClubMaterielSetRenewalFlag(PDO $pdo, int $equipmentId, bool $flagged): array
{
    portailClubMaterielGetEquipment($pdo, $equipmentId);
    $pdo->prepare(
        'UPDATE PORTAIL_CLUB_materiel_equipment SET renewal_flagged = ?, renewal_flagged_at = ? WHERE id = ?'
    )->execute([
        $flagged ? 1 : 0,
        $flagged ? date('Y-m-d H:i:s') : null,
        $equipmentId,
    ]);
    return portailClubMaterielGetEquipment($pdo, $equipmentId);
}

function portailClubMaterielPatchEquipment(PDO $pdo, int $id, array $body): array
{
    $current = portailClubMaterielGetEquipment($pdo, $id);
    $sets = [];
    $params = [];

    $finalPublicId = array_key_exists('public_id', $body)
        ? portailClubMaterielNormalizePublicId($body['public_id'])
        : $current['public_id'];
    $finalTypeId = array_key_exists('type_id', $body)
        ? portailClubIntParam($body['type_id'], 'type_id')
        : (int)$current['type_id'];
    if (
        $finalPublicId !== $current['public_id']
        || $finalTypeId !== (int)$current['type_id']
    ) {
        if (!portailClubMaterielCheckPublicIdAvailable($pdo, $finalPublicId, $finalTypeId, $id)) {
            portailClubJsonFail('Identifiant déjà utilisé pour ce type de matériel.');
        }
    }

    if (array_key_exists('public_id', $body)) {
        $sets[] = 'public_id = ?';
        $params[] = $finalPublicId;
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
    $typeSlug = (string)($current['type_slug'] ?? '');
    if (array_key_exists('specs_json', $body) && $typeSlug === 'regulator') {
        $specs = portailClubMaterielNormalizeRegulatorSpecs(
            is_array($body['specs_json']) ? $body['specs_json'] : []
        );
        $sets[] = 'specs_json = ?';
        $params[] = json_encode($specs, JSON_UNESCAPED_UNICODE);
    }
    if (array_key_exists('specs_json', $body) && ($current['type_domain'] ?? '') === 'security') {
        $specs = portailClubMaterielNormalizeSecuritySpecs(
            $typeSlug,
            is_array($body['specs_json']) ? $body['specs_json'] : []
        );
        $sets[] = 'specs_json = ?';
        $params[] = json_encode($specs, JSON_UNESCAPED_UNICODE);
        if ($typeSlug === 'bavu') {
            $sets[] = 'expiry_on = ?';
            $params[] = $specs['expiry_on'];
        }
        if ($typeSlug === 'o2' && ($specs['supplier'] ?? '') !== '') {
            $sets[] = 'brand = ?';
            $params[] = $specs['supplier'];
        }
        if (($typeSlug === 'bavu' || $typeSlug === 'dae') && ($specs['model'] ?? '') !== '') {
            $sets[] = 'model = ?';
            $params[] = $specs['model'];
        }
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
            'detail_json' => portailClubMaterielDecodeJsonColumn($r['detail_json'] ?? null),
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

    $typeSlug = $equipment['type_slug'] ?? '';
    $detailJson = null;
    if ($typeSlug === 'regulator' && isset($body['detail_json']) && is_array($body['detail_json'])) {
        $detailJson = portailClubMaterielValidateRegulatorDetail($body['detail_json']);
        $subtype = 'revision';
    }

    $st = $pdo->prepare(
        'INSERT INTO PORTAIL_CLUB_materiel_interventions
         (equipment_id, subtype, done_on, person_id, responsible_free, summary, detail_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    $st->execute([
        $equipmentId,
        $subtype,
        $doneOn,
        $personId,
        $free !== '' ? $free : null,
        $summary !== '' ? $summary : null,
        $detailJson !== null ? json_encode($detailJson, JSON_UNESCAPED_UNICODE) : null,
    ]);
    $interventionId = (int)$pdo->lastInsertId();

    if ($subtype === 'revision' && $detailJson === null) {
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
            $normalized = portailClubMaterielNormalizeCheckValue(
                $def['input_type'],
                $checks[$key]
            );
            $stCheck->execute([$interventionId, $key, $normalized]);
        }
    }

    foreach (portailClubMaterielListInterventions($pdo, $equipmentId) as $row) {
        if ($row['id'] === $interventionId) {
            portailClubMaterielRecomputeHealthScore($pdo, $equipmentId);
            return $row;
        }
    }
    portailClubJsonFail('Intervention créée mais introuvable.', 500);
}

function portailClubMaterielGetStats(PDO $pdo, array $structureIds = []): array
{
    [$structSql, $structParams] = portailClubMaterielStructureFilterParts($structureIds);
    $where = ' WHERE t.domain = \'epi\'' . $structSql;
    $params = $structParams;

    $byState = [];
    $st = $pdo->prepare(
        'SELECT e.state, COUNT(*) AS cnt FROM PORTAIL_CLUB_materiel_equipment e
         JOIN PORTAIL_CLUB_materiel_equipment_types t ON t.id = e.type_id' . $where . ' GROUP BY e.state'
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
         JOIN PORTAIL_CLUB_materiel_equipment_types t ON t.id = e.type_id
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
        'SELECT purchase_year FROM PORTAIL_CLUB_materiel_equipment e
         JOIN PORTAIL_CLUB_materiel_equipment_types t ON t.id = e.type_id' . $where
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

    $nfcLinked = 0;
    $nfcUnlinked = 0;
    $st = $pdo->prepare(
        'SELECT e.nfc_linked, COUNT(*) AS cnt FROM PORTAIL_CLUB_materiel_equipment e
         JOIN PORTAIL_CLUB_materiel_equipment_types t ON t.id = e.type_id' . $where . ' GROUP BY e.nfc_linked'
    );
    $st->execute($params);
    foreach ($st->fetchAll() as $r) {
        if ((int)$r['nfc_linked'] === 1) {
            $nfcLinked = (int)$r['cnt'];
        } else {
            $nfcUnlinked += (int)$r['cnt'];
        }
    }

    $stockAlerts = [];
    $types = portailClubMaterielGetCatalog($pdo)['types'];
    foreach ($types as $type) {
        if (!$type['trackable'] || $type['min_stock_alert'] === null || ($type['domain'] ?? 'epi') !== 'epi') {
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

    $byTypeModel = portailClubMaterielGetAvailabilityByTypeModel($pdo, $structureIds);
    $compliance = portailClubMaterielGetComplianceSummary($pdo, $structureIds);

    return [
        'by_state' => $byState,
        'by_type' => $byType,
        'by_structure' => $byStructure,
        'by_age' => $byAgeOut,
        'by_nfc' => [
            'linked' => $nfcLinked,
            'unlinked' => $nfcUnlinked,
        ],
        'stock_alerts' => $stockAlerts,
        'by_type_model' => $byTypeModel,
        'compliance' => $compliance['counts'],
        'total' => array_sum(array_column($byState, 'count')),
    ];
}

/** @return list<array<string, mixed>> */
function portailClubMaterielGetAvailabilityByTypeModel(PDO $pdo, array $structureIds = []): array
{
    [$structSql, $structParams] = portailClubMaterielStructureFilterParts($structureIds);
    $where = $structSql !== '' ? ' WHERE 1=1' . $structSql : '';
    $st = $pdo->prepare(
        'SELECT t.slug AS type_slug, t.label AS type_label, t.min_stock_alert,
                COALESCE(NULLIF(TRIM(e.model), \'\'), \'—\') AS model_label,
                e.state, COUNT(*) AS cnt
         FROM PORTAIL_CLUB_materiel_equipment e
         JOIN PORTAIL_CLUB_materiel_equipment_types t ON t.id = e.type_id' . $where . '
         GROUP BY t.id, t.slug, t.label, t.min_stock_alert, model_label, e.state
         ORDER BY t.sort_order, t.label, model_label, e.state'
    );
    $st->execute($structParams);
    $buckets = [];
    foreach ($st->fetchAll() as $r) {
        $key = $r['type_slug'] . '|' . $r['model_label'];
        if (!isset($buckets[$key])) {
            $buckets[$key] = [
                'type_slug' => $r['type_slug'],
                'type_label' => $r['type_label'],
                'model' => $r['model_label'],
                'operational' => 0,
                'in_repair' => 0,
                'scrapped' => 0,
                'for_sale' => 0,
                'total' => 0,
                'min_stock_alert' => $r['min_stock_alert'] !== null ? (int)$r['min_stock_alert'] : null,
            ];
        }
        $state = (string)$r['state'];
        $cnt = (int)$r['cnt'];
        if (isset($buckets[$key][$state])) {
            $buckets[$key][$state] += $cnt;
        }
        $buckets[$key]['total'] += $cnt;
    }
    $out = [];
    foreach ($buckets as $row) {
        $row['below_threshold'] = $row['min_stock_alert'] !== null
            && $row['operational'] < $row['min_stock_alert'];
        $out[] = $row;
    }
    return $out;
}

/** @return array{counts: array{revision_due:int,renewal_due:int,renewal_soon:int}, items: list<array<string,mixed>>} */
function portailClubMaterielGetComplianceSummary(PDO $pdo, array $structureIds = []): array
{
    [$structSql, $structParams] = portailClubMaterielStructureFilterParts($structureIds);
    $where = $structSql !== '' ? ' WHERE 1=1' . $structSql : '';
    $revSql = portailClubMaterielRevisionDueSql();
    $renDueSql = portailClubMaterielRenewalDueSql();
    $renSoonSql = portailClubMaterielRenewalSoonSql();

    $baseFrom = ' FROM PORTAIL_CLUB_materiel_equipment e
         JOIN PORTAIL_CLUB_materiel_equipment_types t ON t.id = e.type_id
         LEFT JOIN (
             SELECT equipment_id, MAX(done_on) AS last_revision_on
             FROM PORTAIL_CLUB_materiel_interventions
             WHERE subtype = \'revision\'
             GROUP BY equipment_id
         ) rev ON rev.equipment_id = e.id';

    $st = $pdo->prepare('SELECT COUNT(*)' . $baseFrom . $where . ' AND ' . $revSql);
    $st->execute($structParams);
    $revisionDue = (int)$st->fetchColumn();

    $st = $pdo->prepare('SELECT COUNT(*)' . $baseFrom . $where . ' AND ' . $renDueSql);
    $st->execute($structParams);
    $renewalDue = (int)$st->fetchColumn();

    $st = $pdo->prepare('SELECT COUNT(*)' . $baseFrom . $where . ' AND ' . $renSoonSql);
    $st->execute($structParams);
    $renewalSoon = (int)$st->fetchColumn();

    $items = portailClubMaterielListEquipment($pdo, [
        'structure_ids' => $structureIds,
        'domain' => 'epi',
    ]);
    $urgent = [];
    foreach ($items as $item) {
        $flags = [];
        if (!empty($item['revision_due'])) {
            $flags[] = 'revision_due';
        }
        if (!empty($item['renewal_due'])) {
            $flags[] = 'renewal_due';
        }
        if (!empty($item['renewal_soon'])) {
            $flags[] = 'renewal_soon';
        }
        if ($flags === []) {
            continue;
        }
        $priority = in_array('revision_due', $flags, true) ? 0
            : (in_array('renewal_due', $flags, true) ? 1 : 2);
        $urgent[] = [
            'id' => $item['id'],
            'public_id' => $item['public_id'],
            'type_id' => $item['type_id'],
            'type_label' => $item['type_label'],
            'type_slug' => $item['type_slug'],
            'model' => $item['model'],
            'state' => $item['state'],
            'state_label' => $item['state_label'],
            'last_revision_on' => $item['last_revision_on'],
            'flags' => $flags,
            '_priority' => $priority,
        ];
    }
    usort($urgent, static function (array $a, array $b): int {
        $cmp = $a['_priority'] <=> $b['_priority'];
        return $cmp !== 0 ? $cmp : strcmp($a['public_id'], $b['public_id']);
    });
    foreach ($urgent as &$row) {
        unset($row['_priority']);
    }
    unset($row);

    return [
        'counts' => [
            'revision_due' => $revisionDue,
            'renewal_due' => $renewalDue,
            'renewal_soon' => $renewalSoon,
        ],
        'items' => array_slice($urgent, 0, 50),
    ];
}

function portailClubMaterielExportCsv(PDO $pdo, array $structureIds = []): string
{
    $items = portailClubMaterielListEquipment($pdo, [
        'structure_ids' => $structureIds,
        'domain' => 'epi',
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
