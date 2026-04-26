<?php
declare(strict_types=1);

function json_response(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        json_response([
            'ok' => false,
            'error' => 'El cuerpo JSON no es valido.',
        ], 400);
    }

    return $decoded;
}

function required_fields(array $body, array $fields): void
{
    foreach ($fields as $field) {
        if (!array_key_exists($field, $body)) {
            json_response([
                'ok' => false,
                'error' => "Falta el campo obligatorio: {$field}.",
            ], 422);
        }
    }
}

function now_ts(): string
{
    return date('Y-m-d H:i:s');
}

function now_ts_with_tz(): string
{
    return now_ts() . ' ' . date('T');
}

function clean_int(mixed $value, int $default = 0): int
{
    if (is_int($value)) {
        return $value;
    }

    if (is_numeric($value)) {
        return (int) $value;
    }

    return $default;
}

function clean_float(mixed $value, float $default = 0): float
{
    if (is_float($value) || is_int($value)) {
        return (float) $value;
    }

    if (is_numeric($value)) {
        return (float) $value;
    }

    return $default;
}

function money(float $value): string
{
    return '$' . number_format($value, 0, ',', '.');
}
