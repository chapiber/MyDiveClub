<?php
declare(strict_types=1);

function loadSecretsFromPath(string $path): array
{
    if (!is_file($path) || !is_readable($path)) {
        return [];
    }
    $cfg = @include $path;
    return is_array($cfg) ? $cfg : [];
}

function portailClubIsPlaceholder(string $value): bool
{
    $v = strtoupper(trim($value));
    return $v === '' || str_contains($v, 'CHANGE_ME');
}

function portailClubGetDbConfig(): array
{
    $consulting = loadSecretsFromPath('/volume1/homes/admin/config/consulting-secrets.php');
    $divekit = loadSecretsFromPath('/volume1/homes/admin/config/divekit-secrets.php');
    $local = loadSecretsFromPath(__DIR__ . '/../config.local.php');

    $db = is_array($consulting['db'] ?? null) ? $consulting['db'] : [];
    foreach ([$divekit, $local] as $overlay) {
        $src = is_array($overlay['db'] ?? null) ? $overlay['db'] : [];
        foreach (['host', 'port', 'name', 'user', 'pass'] as $key) {
            $val = trim((string)($src[$key] ?? ''));
            if ($val !== '' && !portailClubIsPlaceholder($val)) {
                $db[$key] = $src[$key];
            }
        }
    }

    $host = trim((string)($db['host'] ?? 'localhost'));
    $port = trim((string)($db['port'] ?? '3307'));
    $name = trim((string)($db['name'] ?? 'DiveKit'));
    $user = trim((string)($db['user'] ?? ''));
    $pass = (string)($db['pass'] ?? '');

    if (portailClubIsPlaceholder($user) || portailClubIsPlaceholder($pass)) {
        throw new RuntimeException('Configuration DB incomplète (secrets NAS).');
    }
    if ($host === '' || $user === '') {
        throw new RuntimeException('Configuration DB manquante.');
    }

    return [
        'host' => $host,
        'port' => $port !== '' ? $port : '3307',
        'name' => $name !== '' ? $name : 'DiveKit',
        'user' => $user,
        'pass' => $pass,
    ];
}
