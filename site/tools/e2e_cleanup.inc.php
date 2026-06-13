<?php
declare(strict_types=1);

/** Données de test E2E Suivi Formation — nettoyage partagé. */
const E2E_TAG = 'E2E_TEST';
const E2E_INSTRUCTORS = ['MoniteurA', 'MoniteurB', 'MoniteurC'];

/**
 * Supprime formations, séances, évaluations et moniteurs E2E.
 *
 * @return array{formations: int, instructors: int}
 */
function e2eCleanupAll(PDO $pdo): array
{
    $st = $pdo->prepare(
        'SELECT DISTINCT f.id
         FROM PORTAIL_CLUB_formations f
         JOIN PORTAIL_CLUB_formation_students s ON s.formation_id = f.id
         WHERE s.first_name LIKE ?'
    );
    $st->execute([E2E_TAG . '%']);
    $ids = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));

    $formationsDeleted = 0;
    if ($ids !== []) {
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $del = $pdo->prepare("DELETE FROM PORTAIL_CLUB_formations WHERE id IN ({$placeholders})");
        $del->execute($ids);
        $formationsDeleted = $del->rowCount();
    }

    $placeholders = implode(',', array_fill(0, count(E2E_INSTRUCTORS), '?'));
    $delInst = $pdo->prepare(
        "DELETE FROM PORTAIL_CLUB_recent_instructors WHERE first_name IN ({$placeholders})"
    );
    $delInst->execute(E2E_INSTRUCTORS);
    $instructorsDeleted = $delInst->rowCount();

    return ['formations' => $formationsDeleted, 'instructors' => $instructorsDeleted];
}
