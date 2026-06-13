<?php
declare(strict_types=1);

/**
 * Durées indicatives de renouvellement par type (slug).
 * Sources : PADI blog, Scuba Diving mag, pratique club — indicatif, pas réglementaire (bouteille = hydro/TIV).
 *
 * @var array<string, int>
 */
const PORTAIL_CLUB_MATERIEL_MANUFACTURER_RENEWAL_YEARS = [
    'bottle' => 15,
    'regulator' => 10,
    'bcd' => 8,
    'mask' => 5,
    'fins' => 8,
    'combi_homme' => 5,
    'combi_femme' => 5,
    'combi_enfant' => 3,
    'shorty_homme' => 4,
    'shorty_femme' => 4,
    'shorty_enfant' => 3,
    'computer' => 7,
    'compass' => 15,
];

const PORTAIL_CLUB_MATERIEL_MANUFACTURER_RENEWAL_DEFAULT = 5;

function portailClubMaterielManufacturerRenewalYears(string $slug): int
{
    return PORTAIL_CLUB_MATERIEL_MANUFACTURER_RENEWAL_YEARS[$slug]
        ?? PORTAIL_CLUB_MATERIEL_MANUFACTURER_RENEWAL_DEFAULT;
}

/** Expression SQL : années constructeur selon le slug du type. */
function portailClubMaterielManufacturerRenewalYearsSql(): string
{
    $parts = [];
    foreach (PORTAIL_CLUB_MATERIEL_MANUFACTURER_RENEWAL_YEARS as $slug => $years) {
        $quoted = str_replace("'", "''", $slug);
        $parts[] = "WHEN t.slug = '{$quoted}' THEN {$years}";
    }
    $default = PORTAIL_CLUB_MATERIEL_MANUFACTURER_RENEWAL_DEFAULT;
    return 'CASE ' . implode(' ', $parts) . " ELSE {$default} END";
}
