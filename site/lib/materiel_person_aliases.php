<?php
declare(strict_types=1);

/** Libellé saisie libre pour interventions importées (pas de fiche personne). */
const PORTAIL_CLUB_MATERIEL_IMPORT_FREE_LABEL = 'Import AQUABLUE';

/** Renommages display_name avant fusion des alias. */
function portailClubMaterielPersonRenames(): array
{
    return [
        'coffin nicolas' => 'Nicolas C.',
        'julie (juju)' => 'Julie L.',
    ];
}

/** Canonique => alias Excel / doublons à absorber. */
function portailClubMaterielPersonMergeMap(): array
{
    return [
        'Julien C.' => ['COURTAUDIERE', 'COUTAUDIERE'],
        'Marie M.' => ['MESNIER'],
        'Eric D.' => ['PETIT'],
        'Julie L.' => ['LACOTE'],
    ];
}

function portailClubMaterielIsImportFreeLabel(string $name): bool
{
    return mb_strtolower(trim($name)) === mb_strtolower(PORTAIL_CLUB_MATERIEL_IMPORT_FREE_LABEL);
}

/**
 * Normalise un nom technicien (alias Excel → fiche canonique).
 * Retourne PORTAIL_CLUB_MATERIEL_IMPORT_FREE_LABEL pour l'import détendeurs (pas de person_id).
 */
function portailClubMaterielNormalizePersonName(string $name): string
{
    $name = trim($name);
    if ($name === '') {
        return '';
    }
    if (portailClubMaterielIsImportFreeLabel($name)) {
        return PORTAIL_CLUB_MATERIEL_IMPORT_FREE_LABEL;
    }

    $lower = mb_strtolower($name);

    foreach (portailClubMaterielPersonRenames() as $from => $to) {
        if ($lower === mb_strtolower($from)) {
            return $to;
        }
    }

    foreach (portailClubMaterielPersonMergeMap() as $canonical => $aliases) {
        if ($lower === mb_strtolower($canonical)) {
            return $canonical;
        }
        foreach ($aliases as $alias) {
            if ($lower === mb_strtolower($alias)) {
                return $canonical;
            }
        }
    }

    return $name;
}

/** @return array<string, int> clé LOWER(TRIM(display_name)) => id */
function portailClubMaterielPersonIdMap(PDO $pdo): array
{
    $map = [];
    $rows = $pdo->query('SELECT id, display_name FROM PORTAIL_CLUB_materiel_persons')->fetchAll();
    foreach ($rows as $row) {
        $key = mb_strtolower(trim((string)$row['display_name']));
        $map[$key] = (int)$row['id'];
    }
    return $map;
}

function portailClubMaterielResolvePersonIdByName(PDO $pdo, string $displayName): ?int
{
    $st = $pdo->prepare(
        'SELECT id FROM PORTAIL_CLUB_materiel_persons WHERE LOWER(TRIM(display_name)) = LOWER(TRIM(?)) LIMIT 1'
    );
    $st->execute([$displayName]);
    $id = $st->fetchColumn();
    return $id ? (int)$id : null;
}
