<?php
declare(strict_types=1);

function portailClubJsonOk(array $extra = []): void
{
    echo json_encode(['ok' => true] + $extra, JSON_UNESCAPED_UNICODE);
    exit;
}

function portailClubJsonFail(string $message, int $code = 400): void
{
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

function portailClubRequestMethod(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

function portailClubReadJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        portailClubJsonFail('Corps JSON invalide.');
    }
    return $data;
}

function portailClubRequireMethod(string ...$allowed): void
{
    $method = portailClubRequestMethod();
    if (!in_array($method, $allowed, true)) {
        portailClubJsonFail('Méthode non autorisée.', 405);
    }
}

function portailClubIntParam(mixed $value, string $label, int $min = 1): int
{
    if (!is_numeric($value)) {
        portailClubJsonFail("Paramètre {$label} invalide.");
    }
    $n = (int)$value;
    if ($n < $min) {
        portailClubJsonFail("Paramètre {$label} invalide.");
    }
    return $n;
}

function portailClubTrimName(mixed $value, string $label, int $max = 80): string
{
    $s = trim((string)$value);
    if ($s === '') {
        portailClubJsonFail("{$label} requis.");
    }
    return portailClubTruncateName($s, $max);
}

function portailClubTrimOptionalName(mixed $value, int $max = 80): string
{
    $s = trim((string)$value);
    if ($s === '') {
        return '';
    }
    return portailClubTruncateName($s, $max);
}

function portailClubTruncateName(string $s, int $max): string
{
    if (function_exists('mb_strlen') && mb_strlen($s) > $max) {
        return mb_substr($s, 0, $max);
    }
    if (strlen($s) > $max) {
        return substr($s, 0, $max);
    }
    return $s;
}
