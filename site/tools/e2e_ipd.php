<?php
declare(strict_types=1);

/**
 * Smoke test backend Débrief IPD — usage local ou NAS :
 * php site/tools/e2e_ipd.php
 */
require_once __DIR__ . '/../lib/db.inc.php';
require_once __DIR__ . '/../lib/ipd.inc.php';

$failures = 0;

function ipdAssertTrue(bool $cond, string $msg): void
{
    global $failures;
    if ($cond) {
        echo "OK  {$msg}\n";
        return;
    }
    $failures++;
    echo "KO  {$msg}\n";
}

try {
    $pdo = portailClubGetPdo();
    $externalId = portailClubGenerateUuid();

    $created = portailClubIpdUpsertSession($pdo, [
        'external_id' => $externalId,
        'device_id' => 'e2e-device',
        'device_name' => 'Quad Ci E2E',
        'dive_number' => 99,
        'dive_held_at' => date('c'),
        'dive_max_depth_m' => 38.5,
        'dive_duration_sec' => 1800,
        'instructor_name' => 'E2E Moniteur',
        'events' => [
            [
                'event_index' => 1,
                'is_manual' => false,
                'stabilization_detected' => true,
                'start_depth_m' => 38.0,
                'duration_sec' => 180,
                'ascent_duration_sec' => 90,
                'metrics' => [
                    'max_depth_m' => 38.5,
                    'min_depth_m' => 3.0,
                    'avg_ascent_speed_mpm' => 9.2,
                    'max_ascent_speed_mpm' => 12.0,
                    'max_speed_critical' => false,
                    'redescents' => [],
                ],
                'evaluation' => [
                    'level' => 'n3',
                    'verdict' => 'conforme',
                    'summary' => 'E2E conforme',
                    'criteria' => [
                        ['phase' => 'Remontée', 'label' => 'Vitesse', 'verdict' => 'conforme'],
                    ],
                ],
            ],
        ],
    ]);
    ipdAssertTrue((int)$created['id'] > 0, 'create session');
    ipdAssertTrue(count($created['events']) === 1, 'session events');

    $again = portailClubIpdUpsertSession($pdo, [
        'external_id' => $externalId,
        'device_id' => 'e2e-device',
        'dive_held_at' => date('c'),
        'events' => [
            ['event_index' => 1, 'metrics' => [], 'evaluation' => []],
        ],
    ]);
    ipdAssertTrue((int)$again['id'] === (int)$created['id'], 'idempotent external_id');

    $list = portailClubIpdListSessions($pdo, 5);
    ipdAssertTrue(count($list) >= 1, 'list sessions');

    $detail = portailClubIpdGetSession($pdo, (int)$created['id']);
    ipdAssertTrue($detail['device_name'] === 'Quad Ci E2E', 'get session detail');

    echo $failures === 0 ? "\nE2E IPD OK\n" : "\nE2E IPD KO ({$failures})\n";
    exit($failures === 0 ? 0 : 1);
} catch (Throwable $e) {
    echo 'FATAL ' . $e->getMessage() . "\n";
    exit(1);
}
