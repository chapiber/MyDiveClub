<?php
declare(strict_types=1);

/** Libellé saisie libre pour interventions importées AQUABLUE (pas de fiche personne). */
const PORTAIL_CLUB_MATERIEL_IMPORT_FREE_LABEL = 'Import AQUABLUE';

/** Libellé saisie libre pour interventions importées RÉDERIS. */
const PORTAIL_CLUB_MATERIEL_IMPORT_FREE_LABEL_REDERIS = 'Import RÉDERIS';

/** Renommages display_name avant fusion des alias. */
function portailClubMaterielPersonRenames(): array
{
    return [
        'coffin nicolas' => 'Nicolas C.',
        'julie (juju)' => 'Julie L.',
        'chaumeton' => 'Jérôme C.',
    ];
}

/** Canonique => alias Excel / doublons à absorber. */
function portailClubMaterielPersonMergeMap(): array
{
    return [
        'Julien C.' => ['COURTAUDIERE', 'COUTAUDIERE', 'COURDAUDIERE', 'COURTAIDIERE', 'CPUTAUDIERE'],
        'Marie M.' => ['MESNIER'],
        'Eric D.' => ['PETIT', 'DELMAS', 'ENJALBERT', 'VIDAL', 'ROYNARD', 'LE PROVOST', 'LEPROVOST', 'JEREMIE GEORGES'],
        'Julie L.' => ['LACOTE'],
        'Nicolas C.' => ['coffin nicolas', 'coffin', 'nicolas'],
        'Jérôme C.' => ['CHAUMETON'],
    ];
}

function portailClubMaterielImportFreeLabels(): array
{
    return [PORTAIL_CLUB_MATERIEL_IMPORT_FREE_LABEL, PORTAIL_CLUB_MATERIEL_IMPORT_FREE_LABEL_REDERIS];
}

function portailClubMaterielIsImportFreeLabel(string $name): bool
{
    $lower = mb_strtolower(trim($name));
    foreach (portailClubMaterielImportFreeLabels() as $label) {
        if ($lower === mb_strtolower($label)) {
            return true;
        }
    }
    return false;
}

function portailClubMaterielImportFreeLabelForStructure(string $structureSlug): string
{
    return $structureSlug === 'rederis'
        ? PORTAIL_CLUB_MATERIEL_IMPORT_FREE_LABEL_REDERIS
        : PORTAIL_CLUB_MATERIEL_IMPORT_FREE_LABEL;
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

/** Résout l'id canonique (compte les renommages prévus si la cible n'existe pas encore). */
function portailClubMaterielResolveCanonicalPersonId(PDO $pdo, string $canonical): ?int
{
    $id = portailClubMaterielResolvePersonIdByName($pdo, $canonical);
    if ($id !== null) {
        return $id;
    }
    $canonicalLower = mb_strtolower(trim($canonical));
    foreach (portailClubMaterielPersonRenames() as $from => $to) {
        if (mb_strtolower(trim($to)) === $canonicalLower) {
            return portailClubMaterielResolvePersonIdByName($pdo, $from);
        }
    }
    return null;
}
