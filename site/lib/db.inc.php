<?php
declare(strict_types=1);

require_once __DIR__ . '/secrets.inc.php';

function portailClubGetPdo(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dbc = portailClubGetDbConfig();
    $opts = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ];
    if (defined('PDO::MYSQL_ATTR_INIT_COMMAND')) {
        $opts[PDO::MYSQL_ATTR_INIT_COMMAND] = 'SET NAMES utf8mb4';
    }

    $hosts = array_values(array_unique([$dbc['host'], $dbc['host'] === 'localhost' ? '127.0.0.1' : null]));
    $ports = array_values(array_unique([$dbc['port'], '3307', '3306']));

    $last = null;
    foreach ($hosts as $h) {
        if ($h === null || $h === '') {
            continue;
        }
        foreach ($ports as $p) {
            try {
                $pdo = new PDO(
                    "mysql:host={$h};port={$p};dbname={$dbc['name']};charset=utf8mb4",
                    $dbc['user'],
                    $dbc['pass'],
                    $opts
                );
                return $pdo;
            } catch (PDOException $e) {
                $last = $e;
            }
        }
    }

    if ($last instanceof PDOException) {
        throw $last;
    }
    throw new RuntimeException('Connexion DB impossible.');
}
