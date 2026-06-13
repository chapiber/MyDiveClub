<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../lib/db.inc.php';
require_once __DIR__ . '/../../lib/materiel.inc.php';

try {
    $pdo = portailClubGetPdo();
    $method = portailClubRequestMethod();

    if ($method === 'GET') {
        $activeOnly = !isset($_GET['all']) || (string)$_GET['all'] !== '1';
        $persons = portailClubMaterielListPersons($pdo, $activeOnly);
        $roles = portailClubMaterielListRoles($pdo);
        $suggest = trim((string)($_GET['suggest_roles'] ?? ''));
        if ($suggest !== '') {
            $slugs = array_filter(array_map('trim', explode(',', $suggest)));
            $persons = portailClubMaterielSortPersonsByRoleSuggestion($persons, $roles, $slugs);
        }
        portailClubJsonOk(['persons' => $persons, 'roles' => $roles]);
    }

    if ($method === 'POST') {
        $body = portailClubReadJsonBody();
        portailClubJsonOk(['person' => portailClubMaterielCreatePerson($pdo, $body)]);
    }

    if ($method === 'PATCH') {
        $id = portailClubIntParam($_GET['id'] ?? null, 'id');
        $body = portailClubReadJsonBody();
        portailClubJsonOk(['person' => portailClubMaterielPatchPerson($pdo, $id, $body)]);
    }

    portailClubJsonFail('Méthode non autorisée.', 405);
} catch (Throwable $e) {
    portailClubJsonFail($e->getMessage(), 500);
}
