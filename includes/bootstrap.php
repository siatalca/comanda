<?php
declare(strict_types=1);

$appTimezone = getenv('APP_TIMEZONE');
if (!is_string($appTimezone) || trim($appTimezone) === '') {
    $appTimezone = 'America/Santiago';
}

$appTimezone = trim($appTimezone);
if (!in_array($appTimezone, timezone_identifiers_list(), true)) {
    $appTimezone = 'America/Santiago';
}

date_default_timezone_set($appTimezone);

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/auth.php';
