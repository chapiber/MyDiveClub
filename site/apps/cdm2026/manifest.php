<?php
declare(strict_types=1);

header('Content-Type: application/manifest+json; charset=UTF-8');
header('Cache-Control: public, max-age=300');

$path = __DIR__ . '/manifest.webmanifest';
if (!is_readable($path)) {
    http_response_code(404);
    exit;
}

readfile($path);
