<?php
declare(strict_types=1);

return [
    'driver' => 'mysql',
    'mysql' => [
        'host' => getenv('COMANDA_DB_HOST') ?: '127.0.0.1',
        'port' => (int) (getenv('COMANDA_DB_PORT') ?: 3306),
        'database' => getenv('COMANDA_DB_NAME') ?: 'comanda',
        'username' => getenv('COMANDA_DB_USER') ?: 'root',
        'password' => getenv('COMANDA_DB_PASS') ?: '',
        'charset' => getenv('COMANDA_DB_CHARSET') ?: 'utf8mb4',
        'collation' => getenv('COMANDA_DB_COLLATION') ?: 'utf8mb4_unicode_ci',
        'skip_create' => filter_var(getenv('COMANDA_DB_SKIP_CREATE') ?: false, FILTER_VALIDATE_BOOLEAN),
    ],
];
