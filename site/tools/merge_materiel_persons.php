<?php
declare(strict_types=1);

/**
 * Fusionne les doublons de personnes matériel (import AQUABLUE) et réattribue les historiques.
 *
 * Usage :
 *   php site/tools/merge_materiel_persons.php           # dry-run
 *   php site/tools/merge_materiel_persons.php --apply   # exécution
 */
require_once __DIR__ . '/../lib/db.inc.php';
require_once __DIR__ . '/../lib/materiel.inc.php';
require_once __DIR__ . '/../lib/materiel_person_aliases.php';

$apply = in_array('--apply', $argv ?? [], true);

$stats = [
    'dry_run' => !$apply,
    'renamed' => [],
    'merged_interventions' => 0,
    'merged_state_logs' => 0,
    'import_cleared_interventions' => 0,
    'import_cleared_state_logs' => 0,
    'deleted_persons' => [],
    'errors' => [],
];

try {
    $pdo = portailClubGetPdo();
    if ($apply) {
        $pdo->beginTransaction();
    }

    // 1. Renommages
    foreach (portailClubMaterielPersonRenames() as $from => $to) {
        $st = $pdo->prepare(
            'SELECT id, display_name FROM PORTAIL_CLUB_materiel_persons
             WHERE LOWER(TRIM(display_name)) = LOWER(TRIM(?)) LIMIT 1'
        );
        $st->execute([$from]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            continue;
        }
        $stats['renamed'][] = ['from' => $row['display_name'], 'to' => $to, 'id' => (int)$row['id']];
        if ($apply) {
            $pdo->prepare('UPDATE PORTAIL_CLUB_materiel_persons SET display_name = ? WHERE id = ?')
                ->execute([$to, (int)$row['id']]);
        }
    }

    // 2. Fusions alias → canonique
    foreach (portailClubMaterielPersonMergeMap() as $canonical => $aliases) {
        $canonicalId = portailClubMaterielResolvePersonIdByName($pdo, $canonical);
        if ($canonicalId === null) {
            $stats['errors'][] = "Personne canonique introuvable : {$canonical}";
            continue;
        }

        $aliasKeys = array_map(static fn(string $a): string => mb_strtolower(trim($a)), $aliases);
        $dupIds = [];
        foreach ($aliasKeys as $aliasKey) {
            $st = $pdo->prepare(
                'SELECT id, display_name FROM PORTAIL_CLUB_materiel_persons
                 WHERE LOWER(TRIM(display_name)) = ? LIMIT 1'
            );
            $st->execute([$aliasKey]);
            $dup = $st->fetch(PDO::FETCH_ASSOC);
            if ($dup && (int)$dup['id'] !== $canonicalId) {
                $dupIds[] = (int)$dup['id'];
            }
        }

        $allKeys = array_merge([mb_strtolower(trim($canonical))], $aliasKeys);

        // Interventions : person_id ou responsible_free
        $intCount = countAffectedInterventions($pdo, $canonicalId, $dupIds, $allKeys, $apply);
        $stats['merged_interventions'] += $intCount;

        $logCount = countAffectedStateLogs($pdo, $canonicalId, $dupIds, $allKeys, $apply);
        $stats['merged_state_logs'] += $logCount;

        foreach ($dupIds as $dupId) {
            $nameSt = $pdo->prepare('SELECT display_name FROM PORTAIL_CLUB_materiel_persons WHERE id = ?');
            $nameSt->execute([$dupId]);
            $dupName = (string)$nameSt->fetchColumn();
            $stats['deleted_persons'][] = ['id' => $dupId, 'display_name' => $dupName, 'merged_into' => $canonical];
            if ($apply) {
                $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_persons WHERE id = ?')->execute([$dupId]);
            }
        }
    }

    // 3. Import AQUABLUE : pas de fiche personne
    $importId = portailClubMaterielResolvePersonIdByName($pdo, PORTAIL_CLUB_MATERIEL_IMPORT_FREE_LABEL);
    if ($importId !== null) {
        if ($apply) {
            $stInt = $pdo->prepare(
                'UPDATE PORTAIL_CLUB_materiel_interventions
                 SET person_id = NULL, responsible_free = ?
                 WHERE person_id = ?'
            );
            $stInt->execute([PORTAIL_CLUB_MATERIEL_IMPORT_FREE_LABEL, $importId]);
            $stats['import_cleared_interventions'] = $stInt->rowCount();

            $stLog = $pdo->prepare(
                'UPDATE PORTAIL_CLUB_materiel_equipment_state_log
                 SET person_id = NULL, responsible_free = ?
                 WHERE person_id = ?'
            );
            $stLog->execute([PORTAIL_CLUB_MATERIEL_IMPORT_FREE_LABEL, $importId]);
            $stats['import_cleared_state_logs'] = $stLog->rowCount();

            $pdo->prepare('DELETE FROM PORTAIL_CLUB_materiel_persons WHERE id = ?')->execute([$importId]);
        } else {
            $stats['import_cleared_interventions'] = countImportRefs($pdo, 'PORTAIL_CLUB_materiel_interventions', $importId);
            $stats['import_cleared_state_logs'] = countImportRefs($pdo, 'PORTAIL_CLUB_materiel_equipment_state_log', $importId);
        }
        $stats['deleted_persons'][] = [
            'id' => $importId,
            'display_name' => PORTAIL_CLUB_MATERIEL_IMPORT_FREE_LABEL,
            'merged_into' => '(saisie libre)',
        ];
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

function countImportRefs(PDO $pdo, string $table, int $personId): int
{
    $st = $pdo->prepare("SELECT COUNT(*) FROM {$table} WHERE person_id = ?");
    $st->execute([$personId]);
    return (int)$st->fetchColumn();
}

/**
 * @param list<int> $dupIds
 * @param list<string> $nameKeys lower trimmed
 */
function countAffectedInterventions(
    PDO $pdo,
    int $canonicalId,
    array $dupIds,
    array $nameKeys,
    bool $apply
): int {
    $where = buildPersonMatchWhere($dupIds, $nameKeys);
    if ($where === '') {
        return 0;
    }
    $params = buildPersonMatchParams($canonicalId, $dupIds, $nameKeys);
    if ($apply) {
        $sql = 'UPDATE PORTAIL_CLUB_materiel_interventions
                SET person_id = ?, responsible_free = NULL
                WHERE ' . $where;
        $st = $pdo->prepare($sql);
        $st->execute($params);
        return $st->rowCount();
    }
    $sql = 'SELECT COUNT(*) FROM PORTAIL_CLUB_materiel_interventions WHERE ' . $where;
    $st = $pdo->prepare($sql);
    $st->execute(array_slice($params, 1));
    return (int)$st->fetchColumn();
}

function countAffectedStateLogs(
    PDO $pdo,
    int $canonicalId,
    array $dupIds,
    array $nameKeys,
    bool $apply
): int {
    $where = buildPersonMatchWhere($dupIds, $nameKeys);
    if ($where === '') {
        return 0;
    }
    $params = buildPersonMatchParams($canonicalId, $dupIds, $nameKeys);
    if ($apply) {
        $sql = 'UPDATE PORTAIL_CLUB_materiel_equipment_state_log
                SET person_id = ?, responsible_free = NULL
                WHERE ' . $where;
        $st = $pdo->prepare($sql);
        $st->execute($params);
        return $st->rowCount();
    }
    $sql = 'SELECT COUNT(*) FROM PORTAIL_CLUB_materiel_equipment_state_log WHERE ' . $where;
    $st = $pdo->prepare($sql);
    $st->execute(array_slice($params, 1));
    return (int)$st->fetchColumn();
}

/** @param list<int> $dupIds @param list<string> $nameKeys */
function buildPersonMatchWhere(array $dupIds, array $nameKeys): string
{
    $parts = [];
    if ($dupIds !== []) {
        $parts[] = 'person_id IN (' . implode(',', array_fill(0, count($dupIds), '?')) . ')';
    }
    if ($nameKeys !== []) {
        $parts[] = 'LOWER(TRIM(responsible_free)) IN (' . implode(',', array_fill(0, count($nameKeys), '?')) . ')';
    }
    return implode(' OR ', $parts);
}

/** @param list<int> $dupIds @param list<string> $nameKeys */
function buildPersonMatchParams(int $canonicalId, array $dupIds, array $nameKeys): array
{
    return array_merge([$canonicalId], $dupIds, $nameKeys);
}
