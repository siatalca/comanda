<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/bootstrap.php';

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';

try {
    if ($method === 'GET') {
        handle_get($pdo, $action);
    }

    if ($method === 'POST') {
        handle_post($pdo, $action);
    }

    json_response([
        'ok' => false,
        'error' => 'Metodo no soportado.',
    ], 405);
} catch (Throwable $exception) {
    json_response([
        'ok' => false,
        'error' => 'Error interno del servidor.',
        'detalle' => $exception->getMessage(),
    ], 500);
}

function handle_get(PDO $pdo, string $action): void
{
    switch ($action) {
        case 'session':
            $user = auth_current_user($pdo);
            json_response([
                'ok' => true,
                'logged' => $user !== null,
                'user' => $user,
                'redirect_to' => $user ? auth_home_for_role((string) $user['rol']) : 'login.html',
            ]);
            break;
        case 'admin_session':
            json_response([
                'ok' => true,
                'logged' => is_admin_logged(),
                'user' => current_admin_user($pdo),
            ]);
            break;
        case 'admin_bootstrap':
            require_admin($pdo);
            json_response([
                'ok' => true,
                'data' => get_admin_bootstrap($pdo),
            ]);
            break;
        case 'menu':
            $user = require_operation_roles($pdo);
            json_response([
                'ok' => true,
                'menu' => get_menu($pdo, $user),
            ]);
            break;
        case 'menu_diario':
            $user = require_operation_roles($pdo);
            $role = strtolower(trim((string) ($user['rol'] ?? '')));
            if ($role === 'mesero') {
                $payload = get_effective_daily_menu_for_mesero($pdo);
            } else {
                $fecha = sanitize_date_key((string) ($_GET['fecha'] ?? ''), today_key());
                $payload = get_daily_menu_payload($pdo, $fecha);
            }
            json_response([
                'ok' => true,
                'data' => $payload,
            ]);
            break;
        case 'ventas_historial':
            require_sales_history_roles($pdo);
            $desde = trim((string) ($_GET['desde'] ?? today_key()));
            $hasta = trim((string) ($_GET['hasta'] ?? $desde));
            json_response([
                'ok' => true,
                'data' => get_sales_history_payload($pdo, $desde, $hasta),
            ]);
            break;
        case 'mesas':
            require_operation_roles($pdo);
            json_response([
                'ok' => true,
                'mesas' => get_mesas_state($pdo),
            ]);
            break;
        case 'cuentas_abiertas':
            require_cashier_roles($pdo);
            json_response([
                'ok' => true,
                'cuentas' => get_open_accounts_detail($pdo),
            ]);
            break;
        case 'caja_estado_actual':
            require_cashier_roles($pdo);
            json_response([
                'ok' => true,
                'data' => get_cash_status_payload($pdo),
            ]);
            break;
        case 'user_preferences':
            require_operation_roles($pdo);
            $user = auth_current_user($pdo);
            json_response([
                'ok' => true,
                'data' => get_user_preferences($pdo, $user ? clean_int($user['id'] ?? 0) : 0),
            ]);
            break;
        case 'comanda':
            require_operation_roles($pdo);
            $mesaNumero = clean_int($_GET['mesa'] ?? 0);
            if ($mesaNumero <= 0) {
                json_response([
                    'ok' => false,
                    'error' => 'Mesa invalida.',
                ], 422);
            }

            json_response([
                'ok' => true,
                'data' => get_comanda_snapshot($pdo, $mesaNumero),
            ]);
            break;
        case 'config_cobro':
            require_operation_roles($pdo);
            json_response([
                'ok' => true,
                'data' => get_charge_config_payload($pdo),
            ]);
            break;
        default:
            json_response([
                'ok' => false,
                'error' => 'Accion GET no encontrada.',
            ], 404);
    }
}

function handle_post(PDO $pdo, string $action): void
{
    $body = read_json_body();

    switch ($action) {
        case 'login':
            process_login($pdo, $body);
            break;
        case 'logout':
            process_logout();
            break;
        case 'admin_login':
            process_admin_login($pdo, $body);
            break;
        case 'admin_logout':
            process_admin_logout();
            break;
        case 'admin_save_settings':
            require_admin($pdo);
            process_admin_save_settings($pdo, $body);
            break;
        case 'admin_save_printers':
            require_admin($pdo);
            process_admin_save_printers($pdo, $body);
            break;
        case 'admin_set_tables':
            require_admin($pdo);
            process_admin_set_tables($pdo, $body);
            break;
        case 'admin_product_save':
            require_admin($pdo);
            process_admin_product_save($pdo, $body);
            break;
        case 'admin_product_toggle':
            require_admin($pdo);
            process_admin_product_toggle($pdo, $body);
            break;
        case 'admin_user_save':
            require_admin($pdo);
            process_admin_user_save($pdo, $body);
            break;
        case 'admin_user_toggle':
            require_admin($pdo);
            process_admin_user_toggle($pdo, $body);
            break;
        case 'caja_abrir':
            require_cashier_roles($pdo);
            process_open_cash_session($pdo, $body);
            break;
        case 'caja_cerrar':
            require_cashier_roles($pdo);
            process_close_cash_session($pdo, $body);
            break;
        case 'user_preferences_save':
            require_operation_roles($pdo);
            process_save_user_preferences($pdo, $body);
            break;
        case 'menu_diario_confirmar':
            require_cashier_roles($pdo);
            process_confirm_daily_menu($pdo, $body);
            break;
        case 'send_order':
            require_operation_roles($pdo);
            required_fields($body, ['mesa_numero', 'items']);
            process_send_order($pdo, $body);
            break;
        case 'charge_table':
            require_operation_roles($pdo);
            required_fields($body, ['mesa_numero']);
            process_charge_table($pdo, $body);
            break;
        case 'print_bill':
            require_operation_roles($pdo);
            required_fields($body, ['mesa_numero']);
            process_print_bill($pdo, $body);
            break;
        default:
            json_response([
                'ok' => false,
                'error' => 'Accion POST no encontrada.',
            ], 404);
    }
}

function process_login(PDO $pdo, array $body): void
{
    required_fields($body, ['usuario', 'password']);

    $usuario = trim((string) $body['usuario']);
    $password = (string) $body['password'];
    if ($usuario === '' || $password === '') {
        json_response([
            'ok' => false,
            'error' => 'Usuario y password son obligatorios.',
        ], 422);
    }

    $user = auth_attempt_login($pdo, $usuario, $password);
    if (!$user) {
        json_response([
            'ok' => false,
            'error' => 'Credenciales invalidas o usuario desactivado.',
        ], 401);
    }

    if ((string) $user['rol'] === 'admin') {
        $_SESSION['admin_user_id'] = (int) $user['id'];
    } else {
        unset($_SESSION['admin_user_id']);
    }

    json_response([
        'ok' => true,
        'mensaje' => 'Sesion iniciada.',
        'user' => $user,
        'redirect_to' => auth_home_for_role((string) $user['rol']),
    ]);
}

function process_logout(): void
{
    auth_clear_user_session();
    unset($_SESSION['admin_user_id']);
    json_response([
        'ok' => true,
        'mensaje' => 'Sesion cerrada.',
    ]);
}

function is_admin_logged(): bool
{
    if (isset($_SESSION['app_user_id'], $_SESSION['app_user_rol'])
        && clean_int($_SESSION['app_user_id']) > 0
        && (string) $_SESSION['app_user_rol'] === 'admin') {
        return true;
    }

    return isset($_SESSION['admin_user_id']) && clean_int($_SESSION['admin_user_id']) > 0;
}

function current_admin_user(PDO $pdo): ?array
{
    $appUser = auth_current_user($pdo);
    if ($appUser && (string) $appUser['rol'] === 'admin') {
        $_SESSION['admin_user_id'] = (int) $appUser['id'];
        return $appUser;
    }

    if (!isset($_SESSION['admin_user_id'])) {
        return null;
    }

    $legacyId = clean_int($_SESSION['admin_user_id']);
    if ($legacyId <= 0) {
        unset($_SESSION['admin_user_id']);
        return null;
    }

    $legacy = auth_find_user_by_id($pdo, $legacyId);
    if (!$legacy || clean_int($legacy['activo']) !== 1 || (string) $legacy['rol'] !== 'admin') {
        unset($_SESSION['admin_user_id']);
        return null;
    }

    $public = auth_user_public($legacy);
    auth_set_user_session($public);
    return $public;
}

function require_admin(PDO $pdo): void
{
    $user = current_admin_user($pdo);
    if (!$user || ($user['rol'] ?? '') !== 'admin') {
        json_response([
            'ok' => false,
            'error' => 'Sesion admin requerida.',
        ], 401);
    }
}

function require_operation_roles(PDO $pdo): array
{
    $user = auth_current_user($pdo);
    if (!$user) {
        json_response([
            'ok' => false,
            'error' => 'Debes iniciar sesion.',
        ], 401);
    }

    $allowed = ['mesero', 'caja', 'cajero', 'admin'];
    if (!in_array((string) $user['rol'], $allowed, true)) {
        json_response([
            'ok' => false,
            'error' => 'Tu rol no tiene permisos para esta accion.',
        ], 403);
    }

    return $user;
}

function require_cashier_roles(PDO $pdo): array
{
    $user = auth_current_user($pdo);
    if (!$user) {
        json_response([
            'ok' => false,
            'error' => 'Debes iniciar sesion.',
        ], 401);
    }

    $allowed = ['caja', 'cajero', 'admin'];
    if (!in_array((string) $user['rol'], $allowed, true)) {
        json_response([
            'ok' => false,
            'error' => 'Tu rol no tiene permisos para ver cuentas.',
        ], 403);
    }

    return $user;
}

function require_sales_history_roles(PDO $pdo): array
{
    $user = auth_current_user($pdo);
    if (!$user) {
        json_response([
            'ok' => false,
            'error' => 'Debes iniciar sesion.',
        ], 401);
    }

    $allowed = ['mesero', 'caja', 'cajero', 'admin'];
    if (!in_array((string) $user['rol'], $allowed, true)) {
        json_response([
            'ok' => false,
            'error' => 'Tu rol no tiene permisos para ver el desglose de ventas.',
        ], 403);
    }

    return $user;
}

function process_save_user_preferences(PDO $pdo, array $body): void
{
    $user = require_operation_roles($pdo);
    $userId = clean_int($user['id'] ?? 0);
    if ($userId <= 0) {
        json_response([
            'ok' => false,
            'error' => 'Usuario no valido.',
        ], 422);
    }

    $alertsEnabled = clean_int($body['alertas_nuevas_comandas'] ?? 1, 1) === 1 ? 1 : 0;
    ensure_user_preferences_schema($pdo);

    $update = $pdo->prepare(
        'UPDATE usuarios
         SET alertas_nuevas_comandas = :alertas,
             actualizado_en = :actualizado_en
         WHERE id = :id'
    );
    $update->execute([
        ':alertas' => $alertsEnabled,
        ':actualizado_en' => now_ts(),
        ':id' => $userId,
    ]);

    json_response([
        'ok' => true,
        'mensaje' => 'Preferencias de usuario actualizadas.',
        'data' => get_user_preferences($pdo, $userId),
    ]);
}

function process_confirm_daily_menu(PDO $pdo, array $body): void
{
    $user = require_cashier_roles($pdo);
    $fecha = sanitize_date_key((string) ($body['fecha'] ?? ''), today_key());
    $productosBody = isset($body['productos']) && is_array($body['productos']) ? $body['productos'] : null;

    if ($productosBody === null) {
        json_response([
            'ok' => false,
            'error' => 'Debes enviar el listado de productos para confirmar el menu diario.',
        ], 422);
    }

    ensure_daily_menu_schema($pdo);
    $activeProductIds = get_active_product_ids($pdo);
    if (count($activeProductIds) === 0) {
        json_response([
            'ok' => false,
            'error' => 'No hay productos activos para confirmar en el menu diario.',
        ], 422);
    }

    $enabledMap = [];
    foreach ($productosBody as $row) {
        if (!is_array($row)) {
            continue;
        }

        $productId = clean_int($row['id'] ?? 0);
        if ($productId <= 0 || !isset($activeProductIds[$productId])) {
            continue;
        }
        $enabledMap[$productId] = clean_int($row['habilitado'] ?? 0) === 1 ? 1 : 0;
    }

    foreach ($activeProductIds as $productId => $_) {
        if (!isset($enabledMap[$productId])) {
            $enabledMap[$productId] = 0;
        }
    }

    $enabledCount = 0;
    foreach ($enabledMap as $isEnabled) {
        if ($isEnabled === 1) {
            $enabledCount += 1;
        }
    }

    if ($enabledCount <= 0) {
        json_response([
            'ok' => false,
            'error' => 'Debes habilitar al menos un producto para el menu del dia.',
        ], 422);
    }

    $userId = clean_int($user['id'] ?? 0);

    $pdo->beginTransaction();
    try {
        if (db_is_mysql($pdo)) {
            $upsertItem = $pdo->prepare(
                'INSERT INTO menu_diario_items (fecha, producto_id, habilitado, confirmado_por, confirmado_en)
                 VALUES (:fecha, :producto_id, :habilitado, :confirmado_por, :confirmado_en)
                 ON DUPLICATE KEY UPDATE
                    habilitado = VALUES(habilitado),
                    confirmado_por = VALUES(confirmado_por),
                    confirmado_en = VALUES(confirmado_en)'
            );
        } else {
            $upsertItem = $pdo->prepare(
                'INSERT INTO menu_diario_items (fecha, producto_id, habilitado, confirmado_por, confirmado_en)
                 VALUES (:fecha, :producto_id, :habilitado, :confirmado_por, :confirmado_en)
                 ON CONFLICT(fecha, producto_id) DO UPDATE SET
                    habilitado = excluded.habilitado,
                    confirmado_por = excluded.confirmado_por,
                    confirmado_en = excluded.confirmado_en'
            );
        }

        foreach ($enabledMap as $productId => $enabled) {
            $upsertItem->execute([
                ':fecha' => $fecha,
                ':producto_id' => $productId,
                ':habilitado' => $enabled,
                ':confirmado_por' => $userId > 0 ? $userId : null,
                ':confirmado_en' => now_ts(),
            ]);
        }

        if (db_is_mysql($pdo)) {
            $upsertConfirmacion = $pdo->prepare(
                'INSERT INTO menu_diario_confirmaciones (fecha, confirmado_por, confirmado_en)
                 VALUES (:fecha, :confirmado_por, :confirmado_en)
                 ON DUPLICATE KEY UPDATE
                    confirmado_por = VALUES(confirmado_por),
                    confirmado_en = VALUES(confirmado_en)'
            );
        } else {
            $upsertConfirmacion = $pdo->prepare(
                'INSERT INTO menu_diario_confirmaciones (fecha, confirmado_por, confirmado_en)
                 VALUES (:fecha, :confirmado_por, :confirmado_en)
                 ON CONFLICT(fecha) DO UPDATE SET
                    confirmado_por = excluded.confirmado_por,
                    confirmado_en = excluded.confirmado_en'
            );
        }
        $upsertConfirmacion->execute([
            ':fecha' => $fecha,
            ':confirmado_por' => $userId > 0 ? $userId : null,
            ':confirmado_en' => now_ts(),
        ]);

        $pdo->commit();
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }

    json_response([
        'ok' => true,
        'mensaje' => 'Menu diario confirmado.',
        'data' => get_daily_menu_payload($pdo, $fecha),
    ]);
}

function process_open_cash_session(PDO $pdo, array $body): void
{
    $user = require_cashier_roles($pdo);
    $role = (string) ($user['rol'] ?? '');
    if (!in_array($role, ['caja', 'cajero', 'admin'], true)) {
        json_response([
            'ok' => false,
            'error' => 'Solo caja/admin puede abrir caja.',
        ], 403);
    }

    $montoInicial = clean_float($body['monto_inicial'] ?? 0);
    if ($montoInicial < 0) {
        json_response([
            'ok' => false,
            'error' => 'El monto inicial no puede ser negativo.',
        ], 422);
    }

    ensure_cash_schema($pdo);
    $open = get_open_cash_session($pdo);
    if ($open !== null) {
        json_response([
            'ok' => false,
            'error' => 'Ya existe una caja abierta. Debes cerrarla antes de abrir otra.',
            'data' => get_cash_status_payload($pdo),
        ], 422);
    }

    $insert = $pdo->prepare(
        'INSERT INTO caja_sesiones (usuario_id, abierta_en, cerrada_en, monto_inicial, monto_final_declarado, estado, notas)
         VALUES (:usuario_id, :abierta_en, NULL, :monto_inicial, NULL, :estado, :notas)'
    );
    $insert->execute([
        ':usuario_id' => clean_int($user['id']),
        ':abierta_en' => now_ts(),
        ':monto_inicial' => $montoInicial,
        ':estado' => 'abierta',
        ':notas' => '',
    ]);

    json_response([
        'ok' => true,
        'mensaje' => 'Caja abierta correctamente.',
        'data' => get_cash_status_payload($pdo),
    ]);
}

function process_close_cash_session(PDO $pdo, array $body): void
{
    $user = require_cashier_roles($pdo);
    ensure_cash_schema($pdo);
    $open = get_open_cash_session($pdo);

    if ($open === null) {
        json_response([
            'ok' => false,
            'error' => 'No hay una caja abierta para cerrar.',
        ], 422);
    }

    $userId = clean_int($user['id']);
    $role = (string) ($user['rol'] ?? '');
    $sessionUserId = clean_int($open['usuario_id'] ?? 0);
    if ($role !== 'admin' && $sessionUserId !== $userId) {
        json_response([
            'ok' => false,
            'error' => 'Solo la cajera que abrio la caja (o admin) puede cerrarla.',
        ], 403);
    }

    $montoFinal = clean_float($body['monto_final_declarado'] ?? -1);
    if ($montoFinal < 0) {
        json_response([
            'ok' => false,
            'error' => 'Debes indicar el monto final contado para cerrar caja.',
        ], 422);
    }

    $notas = trim((string) ($body['notas'] ?? ''));

    $update = $pdo->prepare(
        'UPDATE caja_sesiones
         SET cerrada_en = :cerrada_en,
             monto_final_declarado = :monto_final_declarado,
             estado = :estado,
             notas = :notas
         WHERE id = :id'
    );
    $update->execute([
        ':cerrada_en' => now_ts(),
        ':monto_final_declarado' => $montoFinal,
        ':estado' => 'cerrada',
        ':notas' => $notas,
        ':id' => clean_int($open['id']),
    ]);

    $closed = get_cash_session_by_id($pdo, clean_int($open['id']));
    $summary = $closed ? get_cash_session_summary($pdo, clean_int($closed['id'])) : default_cash_summary(0);
    $difference = $montoFinal - clean_float($summary['efectivo_esperado'] ?? 0);

    json_response([
        'ok' => true,
        'mensaje' => 'Caja cerrada correctamente.',
        'cierre' => [
            'sesion' => $closed,
            'resumen' => $summary,
            'diferencia' => $difference,
        ],
        'data' => get_cash_status_payload($pdo),
    ]);
}

function get_cash_status_payload(PDO $pdo): array
{
    ensure_cash_schema($pdo);
    $open = get_open_cash_session($pdo);
    if ($open === null) {
        return [
            'abierta' => false,
            'sesion' => null,
            'resumen' => default_cash_summary(0),
        ];
    }

    return [
        'abierta' => true,
        'sesion' => $open,
        'resumen' => get_cash_session_summary($pdo, clean_int($open['id'])),
    ];
}

function default_cash_summary(float $montoInicial): array
{
    return [
        'monto_inicial' => $montoInicial,
        'ventas_total' => 0.0,
        'ventas_cantidad' => 0,
        'efectivo_total' => 0.0,
        'efectivo_cantidad' => 0,
        'tarjeta_total' => 0.0,
        'tarjeta_cantidad' => 0,
        'transferencia_total' => 0.0,
        'transferencia_cantidad' => 0,
        'otros_total' => 0.0,
        'otros_cantidad' => 0,
        'efectivo_esperado' => $montoInicial,
    ];
}

function get_cash_session_summary(PDO $pdo, int $sessionId): array
{
    $session = get_cash_session_by_id($pdo, $sessionId);
    $montoInicial = $session ? clean_float($session['monto_inicial'] ?? 0) : 0.0;
    $summary = default_cash_summary($montoInicial);
    $salesKeys = [];
    $fallbackSaleIndex = 0;

    $stmt = $pdo->prepare(
        'SELECT comanda_id, metodo, monto
         FROM pagos
         WHERE caja_sesion_id = :session_id'
    );
    $stmt->execute([':session_id' => $sessionId]);

    foreach ($stmt->fetchAll() as $row) {
        $amount = clean_float($row['monto'] ?? 0);
        if ($amount <= 0) {
            continue;
        }

        $comandaId = clean_int($row['comanda_id'] ?? 0);
        if ($comandaId > 0) {
            $salesKeys['c_' . $comandaId] = true;
        } else {
            $fallbackSaleIndex += 1;
            $salesKeys['p_' . $fallbackSaleIndex] = true;
        }

        $method = normalize_payment_method((string) ($row['metodo'] ?? ''));
        $summary['ventas_total'] += $amount;

        if ($method === 'efectivo') {
            $summary['efectivo_total'] += $amount;
            $summary['efectivo_cantidad'] += 1;
            continue;
        }
        if ($method === 'tarjeta') {
            $summary['tarjeta_total'] += $amount;
            $summary['tarjeta_cantidad'] += 1;
            continue;
        }
        if ($method === 'transferencia') {
            $summary['transferencia_total'] += $amount;
            $summary['transferencia_cantidad'] += 1;
            continue;
        }

        $summary['otros_total'] += $amount;
        $summary['otros_cantidad'] += 1;
    }

    $summary['ventas_cantidad'] = count($salesKeys);
    $summary['efectivo_esperado'] = clean_float($summary['monto_inicial']) + clean_float($summary['efectivo_total']);
    return $summary;
}

function get_open_cash_session(PDO $pdo): ?array
{
    ensure_cash_schema($pdo);
    $stmt = $pdo->prepare(
        'SELECT cs.id, cs.usuario_id, cs.abierta_en, cs.cerrada_en, cs.monto_inicial, cs.monto_final_declarado, cs.estado, cs.notas,
                u.nombre AS usuario_nombre, u.usuario AS usuario_login
         FROM caja_sesiones cs
         LEFT JOIN usuarios u ON u.id = cs.usuario_id
         WHERE cs.estado = :estado
         ORDER BY cs.id DESC
         LIMIT 1'
    );
    $stmt->execute([':estado' => 'abierta']);
    $row = $stmt->fetch();

    if (!$row) {
        return null;
    }

    return [
        'id' => clean_int($row['id']),
        'usuario_id' => clean_int($row['usuario_id']),
        'usuario_nombre' => (string) ($row['usuario_nombre'] ?? ''),
        'usuario_login' => (string) ($row['usuario_login'] ?? ''),
        'abierta_en' => (string) ($row['abierta_en'] ?? ''),
        'cerrada_en' => (string) ($row['cerrada_en'] ?? ''),
        'monto_inicial' => clean_float($row['monto_inicial'] ?? 0),
        'monto_final_declarado' => clean_float($row['monto_final_declarado'] ?? 0),
        'estado' => (string) ($row['estado'] ?? ''),
        'notas' => (string) ($row['notas'] ?? ''),
    ];
}

function get_cash_session_by_id(PDO $pdo, int $sessionId): ?array
{
    ensure_cash_schema($pdo);
    $stmt = $pdo->prepare(
        'SELECT cs.id, cs.usuario_id, cs.abierta_en, cs.cerrada_en, cs.monto_inicial, cs.monto_final_declarado, cs.estado, cs.notas,
                u.nombre AS usuario_nombre, u.usuario AS usuario_login
         FROM caja_sesiones cs
         LEFT JOIN usuarios u ON u.id = cs.usuario_id
         WHERE cs.id = :id
         LIMIT 1'
    );
    $stmt->execute([':id' => $sessionId]);
    $row = $stmt->fetch();

    if (!$row) {
        return null;
    }

    return [
        'id' => clean_int($row['id']),
        'usuario_id' => clean_int($row['usuario_id']),
        'usuario_nombre' => (string) ($row['usuario_nombre'] ?? ''),
        'usuario_login' => (string) ($row['usuario_login'] ?? ''),
        'abierta_en' => (string) ($row['abierta_en'] ?? ''),
        'cerrada_en' => (string) ($row['cerrada_en'] ?? ''),
        'monto_inicial' => clean_float($row['monto_inicial'] ?? 0),
        'monto_final_declarado' => clean_float($row['monto_final_declarado'] ?? 0),
        'estado' => (string) ($row['estado'] ?? ''),
        'notas' => (string) ($row['notas'] ?? ''),
    ];
}

function normalize_payment_method(string $method): string
{
    $value = strtolower(trim($method));
    if ($value === '') {
        return 'otros';
    }
    if (strpos($value, 'efect') !== false || $value === 'cash') {
        return 'efectivo';
    }
    if (strpos($value, 'tarj') !== false || $value === 'card' || $value === 'credito' || $value === 'debito') {
        return 'tarjeta';
    }
    if (strpos($value, 'transf') !== false || strpos($value, 'transfer') !== false || $value === 'qr') {
        return 'transferencia';
    }
    return 'otros';
}

function sanitize_payment_breakdown(array $paymentsBody): array
{
    $clean = [];

    foreach ($paymentsBody as $rawPayment) {
        if (!is_array($rawPayment)) {
            continue;
        }

        $method = normalize_payment_method((string) ($rawPayment['metodo'] ?? ''));
        $amount = clean_float($rawPayment['monto'] ?? 0);
        if ($amount <= 0) {
            continue;
        }

        $clean[] = [
            'metodo' => $method,
            'monto' => $amount,
        ];
    }

    return $clean;
}

function payment_breakdown_total(array $payments): float
{
    $sum = 0.0;
    foreach ($payments as $payment) {
        $sum += clean_float($payment['monto'] ?? 0);
    }
    return clean_float($sum);
}

function payment_method_label(string $method): string
{
    $normalized = normalize_payment_method($method);
    if ($normalized === 'efectivo') {
        return 'Efectivo';
    }
    if ($normalized === 'tarjeta') {
        return 'Tarjeta';
    }
    if ($normalized === 'transferencia') {
        return 'Transferencia';
    }
    return 'Otros';
}

function ensure_cash_schema(PDO $pdo): void
{
    if (db_is_mysql($pdo)) {
        $pdo->exec(
            <<<SQL
CREATE TABLE IF NOT EXISTS caja_sesiones (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    usuario_id INT UNSIGNED NOT NULL,
    abierta_en DATETIME NOT NULL,
    cerrada_en DATETIME DEFAULT NULL,
    monto_inicial DECIMAL(12,2) NOT NULL DEFAULT 0,
    monto_final_declarado DECIMAL(12,2) DEFAULT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'abierta',
    notas TEXT,
    PRIMARY KEY (id),
    KEY idx_caja_usuario (usuario_id),
    CONSTRAINT fk_caja_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL
        );
    } else {
        $pdo->exec(
            <<<SQL
CREATE TABLE IF NOT EXISTS caja_sesiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    abierta_en TEXT NOT NULL,
    cerrada_en TEXT,
    monto_inicial REAL NOT NULL DEFAULT 0,
    monto_final_declarado REAL,
    estado TEXT NOT NULL DEFAULT 'abierta',
    notas TEXT,
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
);
SQL
        );
    }

    ensure_table_column($pdo, 'pagos', 'usuario_id', 'INTEGER');
    ensure_table_column($pdo, 'pagos', 'caja_sesion_id', 'INTEGER');
}

function ensure_user_preferences_schema(PDO $pdo): void
{
    ensure_table_column($pdo, 'usuarios', 'alertas_nuevas_comandas', 'INTEGER');
    $pdo->exec('UPDATE usuarios SET alertas_nuevas_comandas = 1 WHERE alertas_nuevas_comandas IS NULL');
}

function ensure_tip_schema(PDO $pdo): void
{
    if (db_is_mysql($pdo)) {
        ensure_table_column($pdo, 'comandas', 'propina_monto', 'DECIMAL(12,2) NOT NULL DEFAULT 0');
        ensure_table_column($pdo, 'comandas', 'propina_porcentaje', 'DECIMAL(5,2) NOT NULL DEFAULT 10');
        return;
    }

    ensure_table_column($pdo, 'comandas', 'propina_monto', 'REAL NOT NULL DEFAULT 0');
    ensure_table_column($pdo, 'comandas', 'propina_porcentaje', 'REAL NOT NULL DEFAULT 10');
}

function ensure_comanda_waiter_schema(PDO $pdo): void
{
    static $checked = false;
    if ($checked) {
        return;
    }

    if (db_is_mysql($pdo)) {
        ensure_table_column($pdo, 'comandas', 'mesero_id', 'INT UNSIGNED DEFAULT NULL');
        $checked = true;
        return;
    }

    ensure_table_column($pdo, 'comandas', 'mesero_id', 'INTEGER');
    $checked = true;
}

function ensure_daily_menu_schema(PDO $pdo): void
{
    if (db_is_mysql($pdo)) {
        $pdo->exec(
            <<<SQL
CREATE TABLE IF NOT EXISTS menu_diario_items (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    fecha DATE NOT NULL,
    producto_id INT UNSIGNED NOT NULL,
    habilitado TINYINT(1) NOT NULL DEFAULT 1,
    confirmado_por INT UNSIGNED DEFAULT NULL,
    confirmado_en DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_menu_diario_fecha_producto (fecha, producto_id),
    KEY idx_menu_diario_producto (producto_id),
    KEY idx_menu_diario_confirmado_por (confirmado_por),
    CONSTRAINT fk_menu_diario_producto FOREIGN KEY (producto_id) REFERENCES productos (id),
    CONSTRAINT fk_menu_diario_confirmado_por FOREIGN KEY (confirmado_por) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL
        );

        $pdo->exec(
            <<<SQL
CREATE TABLE IF NOT EXISTS menu_diario_confirmaciones (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    fecha DATE NOT NULL,
    confirmado_por INT UNSIGNED DEFAULT NULL,
    confirmado_en DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_menu_confirmacion_fecha (fecha),
    KEY idx_menu_confirmacion_usuario (confirmado_por),
    CONSTRAINT fk_menu_confirmacion_usuario FOREIGN KEY (confirmado_por) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL
        );
    } else {
        $pdo->exec(
            <<<SQL
CREATE TABLE IF NOT EXISTS menu_diario_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    producto_id INTEGER NOT NULL,
    habilitado INTEGER NOT NULL DEFAULT 1,
    confirmado_por INTEGER,
    confirmado_en TEXT,
    UNIQUE(fecha, producto_id),
    FOREIGN KEY (producto_id) REFERENCES productos (id),
    FOREIGN KEY (confirmado_por) REFERENCES usuarios (id)
);
SQL
        );

        $pdo->exec(
            <<<SQL
CREATE TABLE IF NOT EXISTS menu_diario_confirmaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL UNIQUE,
    confirmado_por INTEGER,
    confirmado_en TEXT,
    FOREIGN KEY (confirmado_por) REFERENCES usuarios (id)
);
SQL
        );
    }
}

function get_active_product_ids(PDO $pdo): array
{
    $stmt = $pdo->query('SELECT id FROM productos WHERE activo = 1');
    $ids = [];
    foreach ($stmt->fetchAll() as $row) {
        $id = clean_int($row['id'] ?? 0);
        if ($id > 0) {
            $ids[$id] = true;
        }
    }
    return $ids;
}

function today_key(): string
{
    return date('Y-m-d');
}

function sanitize_date_key(string $value, string $fallback): string
{
    $trimmed = trim($value);
    if ($trimmed !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $trimmed) === 1) {
        $date = DateTime::createFromFormat('Y-m-d', $trimmed);
        if ($date instanceof DateTime && $date->format('Y-m-d') === $trimmed) {
            return $trimmed;
        }
    }
    return $fallback;
}

function normalize_period_bounds(string $desdeRaw, string $hastaRaw): array
{
    $today = today_key();
    $desde = sanitize_date_key($desdeRaw, $today);
    $hasta = sanitize_date_key($hastaRaw, $desde);

    if ($desde > $hasta) {
        $tmp = $desde;
        $desde = $hasta;
        $hasta = $tmp;
    }

    return [
        'desde' => $desde,
        'hasta' => $hasta,
    ];
}

function get_user_preferences(PDO $pdo, int $userId): array
{
    ensure_user_preferences_schema($pdo);
    $tone = get_alert_tone_setting($pdo);
    $soundEnabled = get_setting($pdo, 'alerta_sonido_activo', '1') === '1';

    if ($userId <= 0) {
        return [
            'alertas_nuevas_comandas' => true,
            'alerta_sonido_activo' => $soundEnabled,
            'alerta_tono_comanda' => $tone,
        ];
    }

    $stmt = $pdo->prepare(
        'SELECT alertas_nuevas_comandas
         FROM usuarios
         WHERE id = :id
         LIMIT 1'
    );
    $stmt->execute([':id' => $userId]);
    $raw = $stmt->fetchColumn();
    $enabled = $raw === false || $raw === null ? 1 : clean_int($raw, 1);

    return [
        'alertas_nuevas_comandas' => $enabled === 1,
        'alerta_sonido_activo' => $soundEnabled,
        'alerta_tono_comanda' => $tone,
    ];
}

function ensure_table_column(PDO $pdo, string $table, string $column, string $typeSql): void
{
    if (preg_match('/^[A-Za-z0-9_]+$/', $table) !== 1 || preg_match('/^[A-Za-z0-9_]+$/', $column) !== 1) {
        throw new RuntimeException('Nombre de tabla o columna invalido para migracion.');
    }

    if (db_is_mysql($pdo)) {
        $stmt = $pdo->prepare(
            'SELECT COUNT(*) AS total
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = :table
               AND COLUMN_NAME = :column'
        );
        $stmt->execute([
            ':table' => $table,
            ':column' => $column,
        ]);
        $exists = clean_int($stmt->fetchColumn() ?: 0) > 0;
        if ($exists) {
            return;
        }
        $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$typeSql}");
        return;
    }

    $stmt = $pdo->query("PRAGMA table_info({$table})");
    $columns = $stmt ? $stmt->fetchAll() : [];

    foreach ($columns as $info) {
        if (isset($info['name']) && (string) $info['name'] === $column) {
            return;
        }
    }

    $pdo->exec("ALTER TABLE {$table} ADD COLUMN {$column} {$typeSql}");
}

function get_setting(PDO $pdo, string $clave, string $default = ''): string
{
    $stmt = $pdo->prepare('SELECT valor FROM configuraciones WHERE clave = :clave LIMIT 1');
    $stmt->execute([':clave' => $clave]);
    $value = $stmt->fetchColumn();

    if ($value === false || $value === null) {
        return $default;
    }

    return (string) $value;
}

function set_setting(PDO $pdo, string $clave, string $valor): void
{
    $find = $pdo->prepare('SELECT id FROM configuraciones WHERE clave = :clave LIMIT 1');
    $find->execute([':clave' => $clave]);
    $existing = $find->fetchColumn();

    if ($existing === false) {
        $insert = $pdo->prepare(
            'INSERT INTO configuraciones (clave, valor, actualizada_en)
             VALUES (:clave, :valor, :actualizada_en)'
        );
        $insert->execute([
            ':clave' => $clave,
            ':valor' => $valor,
            ':actualizada_en' => now_ts(),
        ]);
        return;
    }

    $update = $pdo->prepare(
        'UPDATE configuraciones
         SET valor = :valor, actualizada_en = :actualizada_en
         WHERE clave = :clave'
    );
    $update->execute([
        ':valor' => $valor,
        ':actualizada_en' => now_ts(),
        ':clave' => $clave,
    ]);
}

function get_all_settings(PDO $pdo): array
{
    $stmt = $pdo->query('SELECT clave, valor FROM configuraciones ORDER BY clave ASC');
    $settings = [];
    foreach ($stmt->fetchAll() as $row) {
        $settings[(string) $row['clave']] = (string) $row['valor'];
    }
    return $settings;
}

function alert_tone_options(): array
{
    return [
        'tono_1',
        'tono_2',
        'tono_3',
        'tono_4',
        'tono_5',
        'tono_6',
        'tono_7',
        'tono_8',
        'tono_9',
        'tono_10',
    ];
}

function normalize_alert_tone(string $tone): string
{
    $value = strtolower(trim($tone));
    if (in_array($value, alert_tone_options(), true)) {
        return $value;
    }
    return 'tono_1';
}

function get_alert_tone_setting(PDO $pdo): string
{
    return normalize_alert_tone(get_setting($pdo, 'alerta_tono_comanda', 'tono_1'));
}

function normalize_product_category_label(string $category): string
{
    $token = normalize_category_token($category);
    if ($token === '') {
        return 'Platos';
    }

    if (strpos($token, 'beb') !== false || in_array($token, ['jugo', 'jugos', 'refresco', 'refrescos', 'gaseosa', 'gaseosas', 'agua', 'aguamineral'], true)) {
        return 'Bebidas';
    }

    if (strpos($token, 'post') !== false || strpos($token, 'dulce') !== false || strpos($token, 'helad') !== false || strpos($token, 'torta') !== false) {
        return 'Postres';
    }

    return 'Platos';
}

function configured_table_count(PDO $pdo): int
{
    $configured = clean_int(get_setting($pdo, 'mesas_cantidad', '20'));
    if ($configured > 0) {
        return $configured;
    }

    $total = (int) $pdo->query('SELECT COUNT(*) FROM mesas')->fetchColumn();
    return max(1, $total);
}

function process_admin_login(PDO $pdo, array $body): void
{
    required_fields($body, ['usuario', 'password']);

    $usuario = trim((string) $body['usuario']);
    $password = (string) $body['password'];
    $user = auth_attempt_login($pdo, $usuario, $password);

    if (!$user) {
        json_response([
            'ok' => false,
            'error' => 'Credenciales invalidas.',
        ], 401);
    }

    if ((string) $user['rol'] !== 'admin') {
        auth_clear_user_session();
        json_response([
            'ok' => false,
            'error' => 'Este usuario no tiene permisos de administracion.',
        ], 403);
    }

    $_SESSION['admin_user_id'] = (int) $user['id'];
    json_response([
        'ok' => true,
        'mensaje' => 'Sesion iniciada.',
        'user' => $user,
    ]);
}

function process_admin_logout(): void
{
    auth_clear_user_session();
    unset($_SESSION['admin_user_id']);
    json_response([
        'ok' => true,
        'mensaje' => 'Sesion cerrada.',
    ]);
}

function process_admin_save_settings(PDO $pdo, array $body): void
{
    $nombreLocal = trim((string) ($body['nombre_local'] ?? get_setting($pdo, 'nombre_local', 'Donde Abel')));
    $moneda = trim((string) ($body['moneda_simbolo'] ?? get_setting($pdo, 'moneda_simbolo', '$')));
    $imprimirPedidos = clean_int($body['imprimir_pedidos'] ?? 1) === 1 ? '1' : '0';
    $alertaSonidoActivo = clean_int(
        $body['alerta_sonido_activo'] ?? get_setting($pdo, 'alerta_sonido_activo', '1'),
        1
    ) === 1 ? '1' : '0';
    $alertaTonoComanda = normalize_alert_tone(
        (string) ($body['alerta_tono_comanda'] ?? get_alert_tone_setting($pdo))
    );
    $propinaHabilitada = clean_int(
        $body['propina_habilitada'] ?? get_setting($pdo, 'propina_habilitada', '1'),
        1
    ) === 1 ? '1' : '0';

    if ($nombreLocal === '') {
        $nombreLocal = 'Donde Abel';
    }
    if ($moneda === '') {
        $moneda = '$';
    }

    set_setting($pdo, 'nombre_local', $nombreLocal);
    set_setting($pdo, 'moneda_simbolo', $moneda);
    set_setting($pdo, 'imprimir_pedidos', $imprimirPedidos);
    set_setting($pdo, 'alerta_sonido_activo', $alertaSonidoActivo);
    set_setting($pdo, 'alerta_tono_comanda', $alertaTonoComanda);
    set_setting($pdo, 'propina_habilitada', $propinaHabilitada);
    set_setting($pdo, 'propina_porcentaje', get_setting($pdo, 'propina_porcentaje', '10'));

    json_response([
        'ok' => true,
        'mensaje' => 'Configuracion general actualizada.',
        'settings' => get_admin_settings_payload($pdo),
    ]);
}

function process_admin_save_printers(PDO $pdo, array $body): void
{
    $modo = trim((string) ($body['impresora_modo'] ?? 'una'));
    if (!in_array($modo, ['una', 'dos'], true)) {
        $modo = 'una';
    }

    $impresoraCocina = trim((string) ($body['impresora_cocina'] ?? ''));
    $impresoraCaja = trim((string) ($body['impresora_caja'] ?? ''));
    $ticketPapelMm = clean_int($body['ticket_papel_mm'] ?? ticket_paper_width_mm($pdo));
    $ticketAnchoChars = clean_int($body['ticket_ancho_chars'] ?? ticket_chars_width($pdo));
    $ticketFuentePt = clean_float($body['ticket_fuente_pt'] ?? ticket_font_size_pt($pdo));

    if ($ticketPapelMm < 48 || $ticketPapelMm > 120) {
        $ticketPapelMm = 58;
    }
    if ($ticketAnchoChars < 20 || $ticketAnchoChars > 80) {
        $ticketAnchoChars = $ticketPapelMm <= 60 ? 32 : 42;
    }
    if ($ticketFuentePt < 6 || $ticketFuentePt > 16) {
        $ticketFuentePt = 9;
    }

    set_setting($pdo, 'impresora_modo', $modo);
    set_setting($pdo, 'impresora_cocina', $impresoraCocina);
    set_setting($pdo, 'impresora_caja', $impresoraCaja);
    set_setting($pdo, 'ticket_papel_mm', (string) $ticketPapelMm);
    set_setting($pdo, 'ticket_ancho_chars', (string) $ticketAnchoChars);
    set_setting($pdo, 'ticket_fuente_pt', rtrim(rtrim(number_format($ticketFuentePt, 2, '.', ''), '0'), '.'));

    json_response([
        'ok' => true,
        'mensaje' => 'Impresoras actualizadas.',
        'settings' => get_admin_settings_payload($pdo),
        'printers' => fetch_available_printers(),
    ]);
}

function process_admin_set_tables(PDO $pdo, array $body): void
{
    required_fields($body, ['cantidad']);
    $cantidad = clean_int($body['cantidad']);
    if ($cantidad < 1 || $cantidad > 200) {
        json_response([
            'ok' => false,
            'error' => 'La cantidad de mesas debe estar entre 1 y 200.',
        ], 422);
    }

    ensure_mesas_to_limit($pdo, $cantidad);
    set_setting($pdo, 'mesas_cantidad', (string) $cantidad);

    json_response([
        'ok' => true,
        'mensaje' => "Cantidad de mesas activa: {$cantidad}.",
        'mesas_cantidad' => $cantidad,
    ]);
}

function ensure_mesas_to_limit(PDO $pdo, int $cantidad): void
{
    $maxNumero = (int) $pdo->query('SELECT COALESCE(MAX(numero), 0) FROM mesas')->fetchColumn();
    $existingRows = $pdo->query('SELECT numero FROM mesas')->fetchAll();
    $existingMap = [];
    foreach ($existingRows as $row) {
        $existingMap[(int) $row['numero']] = true;
    }

    if ($cantidad < $maxNumero) {
        $stmt = $pdo->prepare(
            'SELECT
                m.numero,
                m.estado,
                (
                    SELECT COUNT(*)
                    FROM comandas c
                    WHERE c.mesa_id = m.id AND c.estado = :abierta
                ) AS abiertas
             FROM mesas m
             WHERE m.numero > :limite
             ORDER BY m.numero ASC'
        );
        $stmt->execute([
            ':abierta' => 'abierta',
            ':limite' => $cantidad,
        ]);

        foreach ($stmt->fetchAll() as $row) {
            if (clean_int($row['abiertas']) > 0 || (string) $row['estado'] === 'ocupada') {
                json_response([
                    'ok' => false,
                    'error' => 'No se puede reducir mesas porque hay comandas activas en mesas superiores al nuevo limite.',
                ], 422);
            }
        }
    }

    $insert = $pdo->prepare(
        'INSERT INTO mesas (numero, estado, actualizada_en)
         VALUES (:numero, :estado, :actualizada_en)'
    );
    for ($mesa = 1; $mesa <= $cantidad; $mesa++) {
        if (isset($existingMap[$mesa])) {
            continue;
        }
        $insert->execute([
            ':numero' => $mesa,
            ':estado' => 'libre',
            ':actualizada_en' => now_ts(),
        ]);
    }
}

function process_admin_product_save(PDO $pdo, array $body): void
{
    $id = clean_int($body['id'] ?? 0);
    $nombre = trim((string) ($body['nombre'] ?? ''));
    $categoria = normalize_product_category_label((string) ($body['categoria'] ?? 'Platos'));
    $precio = clean_float($body['precio'] ?? 0);
    $activo = clean_int($body['activo'] ?? 1) === 1 ? 1 : 0;

    if ($nombre === '') {
        json_response([
            'ok' => false,
            'error' => 'El nombre del producto es obligatorio.',
        ], 422);
    }
    if ($precio <= 0) {
        json_response([
            'ok' => false,
            'error' => 'El precio debe ser mayor a 0.',
        ], 422);
    }

    if ($id > 0) {
        $update = $pdo->prepare(
            'UPDATE productos
             SET nombre = :nombre, categoria = :categoria, precio = :precio, activo = :activo
             WHERE id = :id'
        );
        $update->execute([
            ':id' => $id,
            ':nombre' => $nombre,
            ':categoria' => $categoria,
            ':precio' => $precio,
            ':activo' => $activo,
        ]);
    } else {
        $insert = $pdo->prepare(
            'INSERT INTO productos (nombre, categoria, precio, activo)
             VALUES (:nombre, :categoria, :precio, :activo)'
        );
        $insert->execute([
            ':nombre' => $nombre,
            ':categoria' => $categoria,
            ':precio' => $precio,
            ':activo' => $activo,
        ]);
    }

    json_response([
        'ok' => true,
        'mensaje' => 'Producto guardado.',
        'productos' => get_products_admin($pdo),
    ]);
}

function process_admin_product_toggle(PDO $pdo, array $body): void
{
    required_fields($body, ['id', 'activo']);
    $id = clean_int($body['id']);
    $activo = clean_int($body['activo']) === 1 ? 1 : 0;

    if ($id <= 0) {
        json_response([
            'ok' => false,
            'error' => 'Producto invalido.',
        ], 422);
    }

    $update = $pdo->prepare('UPDATE productos SET activo = :activo WHERE id = :id');
    $update->execute([
        ':activo' => $activo,
        ':id' => $id,
    ]);

    json_response([
        'ok' => true,
        'mensaje' => 'Estado del producto actualizado.',
        'productos' => get_products_admin($pdo),
    ]);
}

function process_admin_user_save(PDO $pdo, array $body): void
{
    $id = clean_int($body['id'] ?? 0);
    $nombre = trim((string) ($body['nombre'] ?? ''));
    $usuario = trim((string) ($body['usuario'] ?? ''));
    $rol = trim((string) ($body['rol'] ?? 'mesero'));
    $password = (string) ($body['password'] ?? '');
    $activo = clean_int($body['activo'] ?? 1) === 1 ? 1 : 0;

    if ($nombre === '' || $usuario === '') {
        json_response([
            'ok' => false,
            'error' => 'Nombre y usuario son obligatorios.',
        ], 422);
    }

    $rolesValidos = ['admin', 'mesero', 'caja', 'cajero', 'cocina'];
    if (!in_array($rol, $rolesValidos, true)) {
        json_response([
            'ok' => false,
            'error' => 'Rol de usuario invalido.',
        ], 422);
    }

    if ($rol === 'cajero') {
        $rol = 'caja';
    }

    try {
        if ($id > 0) {
            $baseSql = 'UPDATE usuarios SET nombre = :nombre, usuario = :usuario, rol = :rol, activo = :activo, actualizado_en = :actualizado_en';
            $params = [
                ':id' => $id,
                ':nombre' => $nombre,
                ':usuario' => $usuario,
                ':rol' => $rol,
                ':activo' => $activo,
                ':actualizado_en' => now_ts(),
            ];

            if (trim($password) !== '') {
                if (strlen($password) < 4) {
                    json_response([
                        'ok' => false,
                        'error' => 'El password debe tener al menos 4 caracteres.',
                    ], 422);
                }
                $baseSql .= ', password_hash = :password_hash';
                $params[':password_hash'] = password_hash($password, PASSWORD_DEFAULT);
            }

            $baseSql .= ' WHERE id = :id';
            $update = $pdo->prepare($baseSql);
            $update->execute($params);
        } else {
            if (strlen($password) < 4) {
                json_response([
                    'ok' => false,
                    'error' => 'Para crear usuario debes indicar password de al menos 4 caracteres.',
                ], 422);
            }

            $insert = $pdo->prepare(
                'INSERT INTO usuarios
                 (nombre, usuario, rol, password_hash, activo, creado_en, actualizado_en)
                 VALUES (:nombre, :usuario, :rol, :password_hash, :activo, :creado_en, :actualizado_en)'
            );
            $insert->execute([
                ':nombre' => $nombre,
                ':usuario' => $usuario,
                ':rol' => $rol,
                ':password_hash' => password_hash($password, PASSWORD_DEFAULT),
                ':activo' => $activo,
                ':creado_en' => now_ts(),
                ':actualizado_en' => now_ts(),
            ]);
        }
    } catch (PDOException $exception) {
        json_response([
            'ok' => false,
            'error' => 'No se pudo guardar el usuario (revisa si el nombre de usuario ya existe).',
            'detalle' => $exception->getMessage(),
        ], 422);
    }

    json_response([
        'ok' => true,
        'mensaje' => 'Usuario guardado.',
        'usuarios' => get_users_admin($pdo),
    ]);
}

function process_admin_user_toggle(PDO $pdo, array $body): void
{
    required_fields($body, ['id', 'activo']);
    $id = clean_int($body['id']);
    $activo = clean_int($body['activo']) === 1 ? 1 : 0;

    if ($id <= 0) {
        json_response([
            'ok' => false,
            'error' => 'Usuario invalido.',
        ], 422);
    }

    $current = current_admin_user($pdo);
    if ($current && $current['id'] === $id && $activo === 0) {
        json_response([
            'ok' => false,
            'error' => 'No puedes desactivar tu propio usuario activo.',
        ], 422);
    }

    $update = $pdo->prepare('UPDATE usuarios SET activo = :activo, actualizado_en = :actualizado_en WHERE id = :id');
    $update->execute([
        ':activo' => $activo,
        ':actualizado_en' => now_ts(),
        ':id' => $id,
    ]);

    json_response([
        'ok' => true,
        'mensaje' => 'Estado del usuario actualizado.',
        'usuarios' => get_users_admin($pdo),
    ]);
}

function get_admin_bootstrap(PDO $pdo): array
{
    return [
        'user' => current_admin_user($pdo),
        'settings' => get_admin_settings_payload($pdo),
        'productos' => get_products_admin($pdo),
        'usuarios' => get_users_admin($pdo),
        'printers' => fetch_available_printers(),
        'mesas_estado' => get_mesas_state($pdo),
    ];
}

function get_admin_settings_payload(PDO $pdo): array
{
    return [
        'nombre_local' => get_setting($pdo, 'nombre_local', 'Donde Abel'),
        'moneda_simbolo' => get_setting($pdo, 'moneda_simbolo', '$'),
        'imprimir_pedidos' => get_setting($pdo, 'imprimir_pedidos', '1'),
        'alerta_sonido_activo' => get_setting($pdo, 'alerta_sonido_activo', '1'),
        'alerta_tono_comanda' => get_alert_tone_setting($pdo),
        'propina_habilitada' => get_setting($pdo, 'propina_habilitada', '1'),
        'propina_porcentaje' => tip_suggested_percent($pdo),
        'impresora_modo' => get_setting($pdo, 'impresora_modo', 'una'),
        'impresora_cocina' => get_setting($pdo, 'impresora_cocina', ''),
        'impresora_caja' => get_setting($pdo, 'impresora_caja', ''),
        'ticket_papel_mm' => ticket_paper_width_mm($pdo),
        'ticket_ancho_chars' => ticket_chars_width($pdo),
        'ticket_fuente_pt' => ticket_font_size_pt($pdo),
        'mesas_cantidad' => configured_table_count($pdo),
    ];
}

function get_charge_config_payload(PDO $pdo): array
{
    return [
        'propina_habilitada' => is_tip_enabled($pdo),
        'propina_porcentaje' => tip_suggested_percent($pdo),
    ];
}

function is_tip_enabled(PDO $pdo): bool
{
    return get_setting($pdo, 'propina_habilitada', '1') === '1';
}

function tip_suggested_percent(PDO $pdo): float
{
    $value = clean_float(get_setting($pdo, 'propina_porcentaje', '10'), 10);
    if ($value < 0) {
        return 0.0;
    }
    if ($value > 100) {
        return 100.0;
    }
    return round($value, 2);
}

function tip_amount_for_total(float $total, float $percent): float
{
    if ($total <= 0 || $percent <= 0) {
        return 0.0;
    }
    return round(($total * $percent) / 100, 2);
}

function get_products_admin(PDO $pdo): array
{
    $stmt = $pdo->query(
        'SELECT id, nombre, categoria, precio, activo
         FROM productos
         ORDER BY categoria ASC, nombre ASC'
    );

    $items = [];
    foreach ($stmt->fetchAll() as $row) {
        $items[] = [
            'id' => (int) $row['id'],
            'nombre' => (string) $row['nombre'],
            'categoria' => normalize_product_category_label((string) $row['categoria']),
            'precio' => (float) $row['precio'],
            'activo' => clean_int($row['activo']) === 1 ? 1 : 0,
        ];
    }
    return $items;
}

function get_users_admin(PDO $pdo): array
{
    $stmt = $pdo->query(
        'SELECT id, nombre, usuario, rol, activo, creado_en, actualizado_en
         FROM usuarios
         ORDER BY id ASC'
    );

    $items = [];
    foreach ($stmt->fetchAll() as $row) {
        $items[] = [
            'id' => (int) $row['id'],
            'nombre' => (string) $row['nombre'],
            'usuario' => (string) $row['usuario'],
            'rol' => (string) $row['rol'],
            'activo' => clean_int($row['activo']) === 1 ? 1 : 0,
            'creado_en' => (string) $row['creado_en'],
            'actualizado_en' => (string) $row['actualizado_en'],
        ];
    }
    return $items;
}

function fetch_available_printers(): array
{
    $baseUrl = getenv('PRINT_SERVICE_URL') ?: 'http://127.0.0.1:3003/print';
    $printersUrl = preg_replace('/\/print$/', '', $baseUrl) . '/printers';

    if (function_exists('curl_init')) {
        $curl = curl_init($printersUrl);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPGET => true,
            CURLOPT_TIMEOUT => 4,
            CURLOPT_CONNECTTIMEOUT => 2,
        ]);
        $raw = curl_exec($curl);
        $httpCode = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $error = curl_error($curl);
        curl_close($curl);

        if ($raw === false) {
            return [
                'ok' => false,
                'error' => 'No se pudo consultar impresoras: ' . $error,
                'printers' => [],
                'defaultPrinter' => '',
            ];
        }

        if ($httpCode < 200 || $httpCode >= 300) {
            return [
                'ok' => false,
                'error' => "Servicio de impresion respondio HTTP {$httpCode}.",
                'printers' => [],
                'defaultPrinter' => '',
            ];
        }

        $decoded = json_decode((string) $raw, true);
        if (!is_array($decoded)) {
            return [
                'ok' => false,
                'error' => 'Respuesta invalida del servicio de impresion.',
                'printers' => [],
                'defaultPrinter' => '',
            ];
        }

        return [
            'ok' => (bool) ($decoded['ok'] ?? false),
            'error' => (string) ($decoded['error'] ?? ''),
            'printers' => isset($decoded['printers']) && is_array($decoded['printers']) ? $decoded['printers'] : [],
            'defaultPrinter' => (string) ($decoded['defaultPrinter'] ?? ''),
        ];
    }

    return [
        'ok' => false,
        'error' => 'No hay cliente HTTP habilitado para consultar impresoras.',
        'printers' => [],
        'defaultPrinter' => '',
    ];
}

function resolve_printer_name_for_tipo(PDO $pdo, string $tipo): string
{
    $modo = get_setting($pdo, 'impresora_modo', 'una');
    $cocina = trim(get_setting($pdo, 'impresora_cocina', ''));
    $caja = trim(get_setting($pdo, 'impresora_caja', ''));
    $tiposCocina = ['pedido', 'pedido_cocina'];

    if ($modo === 'dos') {
        if (in_array($tipo, $tiposCocina, true)) {
            return $cocina !== '' ? $cocina : $caja;
        }
        return $caja !== '' ? $caja : $cocina;
    }

    if ($caja !== '') {
        return $caja;
    }

    return $cocina;
}

function ticket_paper_width_mm(PDO $pdo): int
{
    $mm = clean_int(get_setting($pdo, 'ticket_papel_mm', '58'));
    if ($mm < 48 || $mm > 120) {
        return 58;
    }
    return $mm;
}

function ticket_chars_width(PDO $pdo): int
{
    $chars = clean_int(get_setting($pdo, 'ticket_ancho_chars', '32'));
    if ($chars < 20 || $chars > 80) {
        return ticket_paper_width_mm($pdo) <= 60 ? 32 : 42;
    }
    return $chars;
}

function ticket_font_size_pt(PDO $pdo): float
{
    $size = clean_float(get_setting($pdo, 'ticket_fuente_pt', '9'));
    if ($size < 6 || $size > 16) {
        return 9.0;
    }
    return $size;
}

function process_send_order(PDO $pdo, array $body): void
{
    $mesaNumero = clean_int($body['mesa_numero']);
    $itemsBody = is_array($body['items']) ? $body['items'] : [];
    $origen = trim((string) ($body['origen'] ?? 'movil'));
    $currentUser = auth_current_user($pdo);
    $currentUserId = $currentUser ? clean_int($currentUser['id'] ?? 0) : 0;
    $currentRole = strtolower(trim((string) ($currentUser['rol'] ?? '')));
    $enforceDailyMenu = $currentRole === 'mesero';
    ensure_comanda_waiter_schema($pdo);

    if ($mesaNumero <= 0) {
        json_response([
            'ok' => false,
            'error' => 'Mesa invalida.',
        ], 422);
    }

    if (count($itemsBody) === 0) {
        json_response([
            'ok' => false,
            'error' => 'Debes incluir al menos un item.',
        ], 422);
    }

    $mesa = get_mesa_by_number($pdo, $mesaNumero);
    if (!$mesa) {
        json_response([
            'ok' => false,
            'error' => 'Mesa no encontrada.',
        ], 404);
    }

    $items = normalize_items($pdo, $itemsBody, $enforceDailyMenu);
    if (count($items) === 0) {
        if ($enforceDailyMenu) {
            $dailyMenu = get_effective_daily_menu_for_mesero($pdo);
            if (clean_int($dailyMenu['confirmado'] ?? 0) !== 1) {
                json_response([
                    'ok' => false,
                    'error' => 'No hay menu confirmado para hoy ni para el dia anterior.',
                ], 422);
            }

            $menuFecha = (string) ($dailyMenu['menu_origen_fecha'] ?? '');
            $menuLabel = $menuFecha !== '' ? " (menu vigente: {$menuFecha})" : '';
            json_response([
                'ok' => false,
                'error' => 'Los productos seleccionados no estan habilitados en el menu vigente.' . $menuLabel,
            ], 422);
        }

        json_response([
            'ok' => false,
            'error' => 'No hay items validos para agregar.',
        ], 422);
    }

    $comandaId = 0;
    $totalComanda = 0;

    $pdo->beginTransaction();

    try {
        $comanda = get_or_create_open_comanda($pdo, (int) $mesa['id'], $currentUserId);
        $comandaId = (int) $comanda['id'];

        $insertItemStmt = $pdo->prepare(
            'INSERT INTO comanda_items
            (comanda_id, producto_id, descripcion, cantidad, precio_unitario, subtotal, notas, creado_en)
            VALUES (:comanda_id, :producto_id, :descripcion, :cantidad, :precio_unitario, :subtotal, :notas, :creado_en)'
        );

        foreach ($items as $item) {
            $insertItemStmt->execute([
                ':comanda_id' => $comandaId,
                ':producto_id' => $item['producto_id'],
                ':descripcion' => $item['descripcion'],
                ':cantidad' => $item['cantidad'],
                ':precio_unitario' => $item['precio_unitario'],
                ':subtotal' => $item['subtotal'],
                ':notas' => $item['notas'],
                ':creado_en' => now_ts(),
            ]);
        }

        $totalComanda = recalc_total($pdo, $comandaId);

        $updateComanda = $pdo->prepare(
            'UPDATE comandas SET total = :total, actualizada_en = :actualizada WHERE id = :id'
        );
        $updateComanda->execute([
            ':total' => $totalComanda,
            ':actualizada' => now_ts(),
            ':id' => $comandaId,
        ]);

        $updateMesa = $pdo->prepare('UPDATE mesas SET estado = :estado, actualizada_en = :actualizada WHERE id = :id');
        $updateMesa->execute([
            ':estado' => 'ocupada',
            ':actualizada' => now_ts(),
            ':id' => (int) $mesa['id'],
        ]);

        $pdo->commit();
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }

    $localName = get_setting($pdo, 'nombre_local', 'Donde Abel');
    $ticketWidth = ticket_chars_width($pdo);
    $printGroups = split_order_items_for_print($items);
    $printResults = [];

    if (count($printGroups['cocina']) > 0) {
        $ticketCocina = build_order_ticket($localName, $ticketWidth, $mesaNumero, $comandaId, $printGroups['cocina'], $origen, 'COCINA');
        $printResults['cocina'] = register_print_attempt($pdo, $comandaId, 'pedido_cocina', $ticketCocina);
    }

    if (count($printGroups['caja']) > 0) {
        $ticketBebestibles = build_order_ticket($localName, $ticketWidth, $mesaNumero, $comandaId, $printGroups['caja'], $origen, 'BEBESTIBLES');
        $printResults['bebestibles'] = register_print_attempt($pdo, $comandaId, 'pedido_bebestibles', $ticketBebestibles);
    }

    $print = summarize_order_prints($printResults);

    json_response([
        'ok' => true,
        'mensaje' => 'Pedido enviado correctamente.',
        'impresion' => $print,
        'impresiones' => $printResults,
        'data' => get_comanda_snapshot($pdo, $mesaNumero),
    ]);
}

function process_charge_table(PDO $pdo, array $body): void
{
    ensure_cash_schema($pdo);
    ensure_tip_schema($pdo);
    ensure_comanda_waiter_schema($pdo);
    $currentUser = auth_current_user($pdo);
    $currentRole = $currentUser ? (string) ($currentUser['rol'] ?? '') : '';
    $currentUserId = $currentUser ? clean_int($currentUser['id'] ?? 0) : 0;
    $openCash = get_open_cash_session($pdo);

    if (in_array($currentRole, ['caja', 'cajero'], true) && $openCash === null) {
        json_response([
            'ok' => false,
            'error' => 'Debes abrir caja antes de cobrar mesas.',
        ], 422);
    }

    $mesaNumero = clean_int($body['mesa_numero']);
    $metodoInput = trim((string) ($body['metodo'] ?? 'efectivo'));
    if ($metodoInput === '') {
        $metodoInput = 'efectivo';
    }
    $metodoNormalizado = normalize_payment_method($metodoInput);
    $paymentsBody = isset($body['pagos']) && is_array($body['pagos']) ? $body['pagos'] : [];
    $metodoTicket = $metodoNormalizado;
    $tipEnabled = is_tip_enabled($pdo);
    $tipPercent = tip_suggested_percent($pdo);
    $tipAmount = clean_float($body['propina'] ?? 0);
    if (!$tipEnabled || $tipAmount < 0) {
        $tipAmount = 0;
    }
    $tipAmount = round($tipAmount, 2);

    if ($mesaNumero <= 0) {
        json_response([
            'ok' => false,
            'error' => 'Mesa invalida.',
        ], 422);
    }

    $mesa = get_mesa_by_number($pdo, $mesaNumero);
    if (!$mesa) {
        json_response([
            'ok' => false,
            'error' => 'Mesa no encontrada.',
        ], 404);
    }

    $comanda = get_open_comanda($pdo, (int) $mesa['id']);
    if (!$comanda) {
        json_response([
            'ok' => false,
            'error' => 'La mesa no tiene comanda abierta.',
        ], 422);
    }

    $comandaId = (int) $comanda['id'];
    $meseroId = clean_int($comanda['mesero_id'] ?? 0);
    if ($meseroId <= 0 && $currentUserId > 0 && in_array(strtolower($currentRole), ['mesero', 'admin'], true)) {
        $meseroId = $currentUserId;
    }
    $items = get_comanda_items($pdo, $comandaId);
    $total = recalc_total($pdo, $comandaId);

    if ($total <= 0) {
        json_response([
            'ok' => false,
            'error' => 'La comanda no tiene items para cobrar.',
        ], 422);
    }

    $isMixedRequest = count($paymentsBody) > 0 || in_array(strtolower($metodoInput), ['mixto', 'mixta'], true);
    if ($isMixedRequest) {
        $paymentRows = sanitize_payment_breakdown($paymentsBody);
        if (count($paymentRows) === 0) {
            json_response([
                'ok' => false,
                'error' => 'Debes ingresar al menos un monto en pago mixto.',
            ], 422);
        }

        $paidTotal = payment_breakdown_total($paymentRows);
        if (abs($paidTotal - $total) > 0.01) {
            json_response([
                'ok' => false,
                'error' => 'La suma de pagos no coincide con el total de la comanda.',
            ], 422);
        }

        $metodoTicket = 'mixto';
    } else {
        $paymentRows = [
            [
                'metodo' => $metodoNormalizado,
                'monto' => $total,
            ],
        ];
    }

    $pdo->beginTransaction();
    try {
        $insertPago = $pdo->prepare(
            'INSERT INTO pagos (comanda_id, metodo, monto, creado_en, usuario_id, caja_sesion_id)
            VALUES (:comanda_id, :metodo, :monto, :creado_en, :usuario_id, :caja_sesion_id)'
        );
        foreach ($paymentRows as $payment) {
            $insertPago->execute([
                ':comanda_id' => $comandaId,
                ':metodo' => $payment['metodo'],
                ':monto' => clean_float($payment['monto']),
                ':creado_en' => now_ts(),
                ':usuario_id' => $currentUserId > 0 ? $currentUserId : null,
                ':caja_sesion_id' => $openCash ? clean_int($openCash['id']) : null,
            ]);
        }

        $closeComanda = $pdo->prepare(
            'UPDATE comandas
             SET estado = :estado,
                 total = :total,
                 propina_monto = :propina_monto,
                 propina_porcentaje = :propina_porcentaje,
                 mesero_id = COALESCE(mesero_id, :mesero_id),
                 actualizada_en = :actualizada,
                 cerrada_en = :cerrada
             WHERE id = :id'
        );
        $closeComanda->execute([
            ':estado' => 'cerrada',
            ':total' => $total,
            ':propina_monto' => $tipAmount,
            ':propina_porcentaje' => $tipPercent,
            ':mesero_id' => $meseroId > 0 ? $meseroId : null,
            ':actualizada' => now_ts(),
            ':cerrada' => now_ts(),
            ':id' => $comandaId,
        ]);

        $freeMesa = $pdo->prepare('UPDATE mesas SET estado = :estado, actualizada_en = :actualizada WHERE id = :id');
        $freeMesa->execute([
            ':estado' => 'libre',
            ':actualizada' => now_ts(),
            ':id' => (int) $mesa['id'],
        ]);

        $pdo->commit();
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }

    $localName = get_setting($pdo, 'nombre_local', 'Donde Abel');
    $ticketWidth = ticket_chars_width($pdo);
    $ticket = build_final_ticket($localName, $ticketWidth, $mesaNumero, $comandaId, $items, $total, $metodoTicket, $paymentRows, $tipAmount);
    $print = register_print_attempt($pdo, $comandaId, 'ticket', $ticket);

    json_response([
        'ok' => true,
        'mensaje' => 'Mesa cobrada y cerrada.',
        'total' => $total,
        'propina' => $tipAmount,
        'metodo' => $metodoTicket,
        'pagos' => $paymentRows,
        'impresion' => $print,
    ]);
}

function process_print_bill(PDO $pdo, array $body): void
{
    $mesaNumero = clean_int($body['mesa_numero']);
    if ($mesaNumero <= 0) {
        json_response([
            'ok' => false,
            'error' => 'Mesa invalida.',
        ], 422);
    }

    $mesa = get_mesa_by_number($pdo, $mesaNumero);
    if (!$mesa) {
        json_response([
            'ok' => false,
            'error' => 'Mesa no encontrada.',
        ], 404);
    }

    $comanda = get_open_comanda($pdo, (int) $mesa['id']);
    if (!$comanda) {
        json_response([
            'ok' => false,
            'error' => 'No existe comanda abierta para esta mesa.',
        ], 422);
    }

    $comandaId = (int) $comanda['id'];
    $items = get_comanda_items($pdo, $comandaId);
    $total = recalc_total($pdo, $comandaId);

    $localName = get_setting($pdo, 'nombre_local', 'Donde Abel');
    $ticketWidth = ticket_chars_width($pdo);
    $tipEnabled = is_tip_enabled($pdo);
    $tipPercent = tip_suggested_percent($pdo);
    $precuenta = build_prebill_ticket($localName, $ticketWidth, $mesaNumero, $comandaId, $items, $total, $tipEnabled, $tipPercent);
    $print = register_print_attempt($pdo, $comandaId, 'precuenta', $precuenta);

    json_response([
        'ok' => true,
        'mensaje' => 'Precuenta enviada a impresion.',
        'impresion' => $print,
    ]);
}

function get_menu(PDO $pdo, array $user): array
{
    $role = strtolower(trim((string) ($user['rol'] ?? '')));
    if ($role === 'mesero') {
        $dailyMenu = get_effective_daily_menu_for_mesero($pdo);
        return is_array($dailyMenu['menu'] ?? null) ? $dailyMenu['menu'] : [];
    }

    $products = fetch_active_products($pdo);
    return group_products_for_menu($products);
}

function get_effective_daily_menu_for_mesero(PDO $pdo): array
{
    $today = today_key();
    $todayPayload = get_daily_menu_payload($pdo, $today);
    if (clean_int($todayPayload['confirmado'] ?? 0) === 1) {
        $todayPayload['menu_origen_fecha'] = $today;
        $todayPayload['menu_origen_tipo'] = 'hoy';
        return $todayPayload;
    }

    $yesterday = date('Y-m-d', strtotime($today . ' -1 day'));
    $yesterdayPayload = get_daily_menu_payload($pdo, $yesterday);
    if (clean_int($yesterdayPayload['confirmado'] ?? 0) === 1) {
        $yesterdayPayload['menu_origen_fecha'] = $yesterday;
        $yesterdayPayload['menu_origen_tipo'] = 'anterior';
        return $yesterdayPayload;
    }

    $todayPayload['menu_origen_fecha'] = $today;
    $todayPayload['menu_origen_tipo'] = 'sin_confirmar';
    return $todayPayload;
}

function fetch_active_products(PDO $pdo): array
{
    $stmt = $pdo->query(
        'SELECT id, nombre, categoria, precio
         FROM productos
         WHERE activo = 1
         ORDER BY categoria ASC, nombre ASC'
    );

    $products = [];
    foreach ($stmt->fetchAll() as $row) {
        $products[] = [
            'id' => clean_int($row['id'] ?? 0),
            'nombre' => (string) ($row['nombre'] ?? ''),
            'categoria' => normalize_product_category_label((string) ($row['categoria'] ?? 'Platos')),
            'precio' => clean_float($row['precio'] ?? 0),
        ];
    }

    return $products;
}

function group_products_for_menu(array $products): array
{
    $grouped = [];
    foreach ($products as $product) {
        $category = trim((string) ($product['categoria'] ?? 'General'));
        if ($category === '') {
            $category = 'General';
        }

        if (!isset($grouped[$category])) {
            $grouped[$category] = [];
        }

        $grouped[$category][] = [
            'id' => clean_int($product['id'] ?? 0),
            'nombre' => (string) ($product['nombre'] ?? ''),
            'precio' => clean_float($product['precio'] ?? 0),
            'categoria' => $category,
        ];
    }

    return $grouped;
}

function get_daily_menu_payload(PDO $pdo, ?string $fecha = null): array
{
    ensure_daily_menu_schema($pdo);
    $dateKey = sanitize_date_key((string) ($fecha ?? ''), today_key());
    $confirmation = get_daily_menu_confirmation($pdo, $dateKey);
    $enabledMap = get_daily_menu_enabled_map($pdo, $dateKey);
    $confirmed = clean_int($confirmation['confirmado'] ?? 0) === 1;
    $products = fetch_active_products($pdo);
    $list = [];
    $enabledOnly = [];

    foreach ($products as $product) {
        $productId = clean_int($product['id'] ?? 0);
        if ($productId <= 0) {
            continue;
        }

        if (array_key_exists($productId, $enabledMap)) {
            $enabled = clean_int($enabledMap[$productId], $confirmed ? 0 : 1) === 1;
        } else {
            $enabled = !$confirmed;
        }

        $item = [
            'id' => $productId,
            'nombre' => (string) ($product['nombre'] ?? ''),
            'categoria' => (string) ($product['categoria'] ?? 'General'),
            'precio' => clean_float($product['precio'] ?? 0),
            'habilitado' => $enabled ? 1 : 0,
        ];
        $list[] = $item;

        if ($enabled) {
            $enabledOnly[] = $item;
        }
    }

    return [
        'fecha' => $dateKey,
        'confirmado' => $confirmed ? 1 : 0,
        'confirmacion' => $confirmation,
        'productos' => $list,
        'menu' => group_products_for_menu($enabledOnly),
    ];
}

function get_daily_menu_confirmation(PDO $pdo, string $fecha): array
{
    ensure_daily_menu_schema($pdo);
    $stmt = $pdo->prepare(
        'SELECT c.fecha, c.confirmado_en, c.confirmado_por,
                u.nombre AS confirmado_por_nombre, u.usuario AS confirmado_por_usuario
         FROM menu_diario_confirmaciones c
         LEFT JOIN usuarios u ON u.id = c.confirmado_por
         WHERE c.fecha = :fecha
         LIMIT 1'
    );
    $stmt->execute([':fecha' => $fecha]);
    $row = $stmt->fetch();

    if (!$row) {
        return [
            'fecha' => $fecha,
            'confirmado' => 0,
            'confirmado_en' => '',
            'confirmado_por' => 0,
            'confirmado_por_nombre' => '',
            'confirmado_por_usuario' => '',
        ];
    }

    return [
        'fecha' => (string) ($row['fecha'] ?? $fecha),
        'confirmado' => 1,
        'confirmado_en' => (string) ($row['confirmado_en'] ?? ''),
        'confirmado_por' => clean_int($row['confirmado_por'] ?? 0),
        'confirmado_por_nombre' => (string) ($row['confirmado_por_nombre'] ?? ''),
        'confirmado_por_usuario' => (string) ($row['confirmado_por_usuario'] ?? ''),
    ];
}

function get_daily_menu_enabled_map(PDO $pdo, string $fecha): array
{
    ensure_daily_menu_schema($pdo);
    $stmt = $pdo->prepare(
        'SELECT producto_id, habilitado
         FROM menu_diario_items
         WHERE fecha = :fecha'
    );
    $stmt->execute([':fecha' => $fecha]);

    $map = [];
    foreach ($stmt->fetchAll() as $row) {
        $productId = clean_int($row['producto_id'] ?? 0);
        if ($productId <= 0) {
            continue;
        }
        $map[$productId] = clean_int($row['habilitado'] ?? 0) === 1 ? 1 : 0;
    }
    return $map;
}

function get_mesas_state(PDO $pdo): array
{
    $tableLimit = configured_table_count($pdo);
    $sql = <<<SQL
SELECT
    m.id,
    m.numero,
    m.estado,
    m.actualizada_en,
    c.id AS comanda_id,
    c.total AS comanda_total,
    c.actualizada_en AS comanda_actualizada_en,
    COALESCE(ci.total_items, 0) AS total_items
FROM mesas m
LEFT JOIN comandas c ON c.id = (
    SELECT c2.id
    FROM comandas c2
    WHERE c2.mesa_id = m.id AND c2.estado = 'abierta'
    ORDER BY c2.id DESC
    LIMIT 1
)
LEFT JOIN (
    SELECT comanda_id, SUM(cantidad) AS total_items
    FROM comanda_items
    GROUP BY comanda_id
) ci ON ci.comanda_id = c.id
WHERE m.numero <= :max_numero
ORDER BY m.numero ASC
SQL;

    $stmt = $pdo->prepare($sql);
    $stmt->execute([':max_numero' => $tableLimit]);
    $mesas = [];

    foreach ($stmt->fetchAll() as $row) {
        $mesas[] = [
            'id' => (int) $row['id'],
            'numero' => (int) $row['numero'],
            'estado' => (string) $row['estado'],
            'actualizada_en' => (string) $row['actualizada_en'],
            'comanda_id' => $row['comanda_id'] !== null ? (int) $row['comanda_id'] : null,
            'comanda_total' => $row['comanda_total'] !== null ? (float) $row['comanda_total'] : 0.0,
            'comanda_actualizada_en' => $row['comanda_actualizada_en'],
            'total_items' => (int) $row['total_items'],
        ];
    }

    return $mesas;
}

function get_open_accounts_detail(PDO $pdo): array
{
    $mesas = get_mesas_state($pdo);
    $accounts = [];
    $comandaIds = [];

    foreach ($mesas as $mesa) {
        $comandaId = $mesa['comanda_id'];
        if ($comandaId === null) {
            continue;
        }

        $id = clean_int($comandaId);
        if ($id <= 0) {
            continue;
        }

        $accounts[$id] = [
            'mesa_numero' => clean_int($mesa['numero']),
            'comanda_id' => $id,
            'total' => clean_float($mesa['comanda_total'] ?? 0),
            'total_items' => clean_int($mesa['total_items'] ?? 0),
            'actualizada_en' => (string) ($mesa['comanda_actualizada_en'] ?? ''),
            'items' => [],
        ];
        $comandaIds[] = $id;
    }

    if (count($comandaIds) === 0) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($comandaIds), '?'));
    $stmt = $pdo->prepare(
        "SELECT comanda_id, id, descripcion, cantidad, subtotal, notas
         FROM comanda_items
         WHERE comanda_id IN ({$placeholders})
         ORDER BY comanda_id ASC, id ASC"
    );
    $stmt->execute($comandaIds);

    foreach ($stmt->fetchAll() as $row) {
        $comandaId = clean_int($row['comanda_id']);
        if (!isset($accounts[$comandaId])) {
            continue;
        }
        $accounts[$comandaId]['items'][] = [
            'id' => clean_int($row['id']),
            'descripcion' => (string) $row['descripcion'],
            'cantidad' => clean_int($row['cantidad']),
            'subtotal' => clean_float($row['subtotal']),
            'notas' => (string) ($row['notas'] ?? ''),
        ];
    }

    $list = array_values($accounts);
    usort($list, static function (array $a, array $b): int {
        return clean_int($a['mesa_numero']) <=> clean_int($b['mesa_numero']);
    });

    return $list;
}

function get_sales_history_payload(PDO $pdo, string $desdeRaw, string $hastaRaw): array
{
    ensure_cash_schema($pdo);
    ensure_tip_schema($pdo);
    ensure_comanda_waiter_schema($pdo);
    $bounds = normalize_period_bounds($desdeRaw, $hastaRaw);
    $desde = $bounds['desde'];
    $hasta = $bounds['hasta'];

    $stmt = $pdo->prepare(
        'SELECT c.id, c.mesa_id, c.total, c.propina_monto, c.creada_en, c.cerrada_en,
                c.mesero_id, u.nombre AS mesero_nombre, u.usuario AS mesero_usuario,
                m.numero AS mesa_numero
         FROM comandas c
         LEFT JOIN mesas m ON m.id = c.mesa_id
         LEFT JOIN usuarios u ON u.id = c.mesero_id
         WHERE c.estado = :estado
           AND c.cerrada_en IS NOT NULL
           AND DATE(c.cerrada_en) BETWEEN :desde AND :hasta
         ORDER BY c.cerrada_en DESC, c.id DESC'
    );
    $stmt->execute([
        ':estado' => 'cerrada',
        ':desde' => $desde,
        ':hasta' => $hasta,
    ]);

    $sales = [];
    $salesIds = [];

    foreach ($stmt->fetchAll() as $row) {
        $saleId = clean_int($row['id'] ?? 0);
        if ($saleId <= 0) {
            continue;
        }

        $sales[$saleId] = [
            'comanda_id' => $saleId,
            'mesa_numero' => clean_int($row['mesa_numero'] ?? 0),
            'total' => clean_float($row['total'] ?? 0),
            'propina' => clean_float($row['propina_monto'] ?? 0),
            'mesero_id' => clean_int($row['mesero_id'] ?? 0),
            'mesero_nombre' => trim((string) ($row['mesero_nombre'] ?? '')),
            'mesero_usuario' => trim((string) ($row['mesero_usuario'] ?? '')),
            'creada_en' => (string) ($row['creada_en'] ?? ''),
            'cerrada_en' => (string) ($row['cerrada_en'] ?? ''),
            'pagos' => [],
            'total_pagado' => 0.0,
            'diferencia_pago' => 0.0,
            'metodos' => [],
        ];
        $salesIds[] = $saleId;
    }

    $summary = default_cash_summary(0);
    $summary['total_pagado'] = 0.0;
    $summary['diferencia_total'] = 0.0;
    $summary['propinas_total'] = 0.0;
    $summary['propinas_cantidad'] = 0;
    $summary['propinas_por_mesero'] = [];

    if (count($salesIds) === 0) {
        return [
            'periodo' => [
                'desde' => $desde,
                'hasta' => $hasta,
            ],
            'resumen' => $summary,
            'ventas' => [],
        ];
    }

    $placeholders = implode(',', array_fill(0, count($salesIds), '?'));
    $paymentStmt = $pdo->prepare(
        "SELECT id, comanda_id, metodo, monto, creado_en
         FROM pagos
         WHERE comanda_id IN ({$placeholders})
         ORDER BY comanda_id ASC, id ASC"
    );
    $paymentStmt->execute($salesIds);
    $tipsByWaiter = [];

    foreach ($paymentStmt->fetchAll() as $row) {
        $saleId = clean_int($row['comanda_id'] ?? 0);
        if (!isset($sales[$saleId])) {
            continue;
        }

        $amount = clean_float($row['monto'] ?? 0);
        if ($amount <= 0) {
            continue;
        }

        $methodKey = normalize_payment_method((string) ($row['metodo'] ?? ''));
        $methodLabel = payment_method_label($methodKey);

        $sales[$saleId]['pagos'][] = [
            'id' => clean_int($row['id'] ?? 0),
            'metodo' => $methodKey,
            'metodo_label' => $methodLabel,
            'monto' => $amount,
            'creado_en' => (string) ($row['creado_en'] ?? ''),
        ];
        $sales[$saleId]['total_pagado'] = clean_float($sales[$saleId]['total_pagado'] + $amount);

        if (!in_array($methodLabel, $sales[$saleId]['metodos'], true)) {
            $sales[$saleId]['metodos'][] = $methodLabel;
        }

        if ($methodKey === 'efectivo') {
            $summary['efectivo_total'] += $amount;
            $summary['efectivo_cantidad'] += 1;
        } elseif ($methodKey === 'tarjeta') {
            $summary['tarjeta_total'] += $amount;
            $summary['tarjeta_cantidad'] += 1;
        } elseif ($methodKey === 'transferencia') {
            $summary['transferencia_total'] += $amount;
            $summary['transferencia_cantidad'] += 1;
        } else {
            $summary['otros_total'] += $amount;
            $summary['otros_cantidad'] += 1;
        }
    }

    foreach ($sales as $saleId => $sale) {
        $summary['ventas_total'] += clean_float($sale['total'] ?? 0);
        $summary['ventas_cantidad'] += 1;
        $summary['total_pagado'] += clean_float($sale['total_pagado'] ?? 0);
        $tipAmount = clean_float($sale['propina'] ?? 0);
        $summary['propinas_total'] += $tipAmount;
        if ($tipAmount > 0) {
            $summary['propinas_cantidad'] += 1;
        }

        $meseroId = clean_int($sale['mesero_id'] ?? 0);
        $meseroNombre = trim((string) ($sale['mesero_nombre'] ?? ''));
        $meseroUsuario = trim((string) ($sale['mesero_usuario'] ?? ''));
        $meseroKey = $meseroId > 0 ? 'id:' . $meseroId : 'sin_mesero';

        if ($meseroNombre === '') {
            $meseroNombre = $meseroId > 0 ? 'Mesero #' . $meseroId : 'Sin mesero asignado';
        }

        if (!isset($tipsByWaiter[$meseroKey])) {
            $tipsByWaiter[$meseroKey] = [
                'mesero_id' => $meseroId,
                'mesero_nombre' => $meseroNombre,
                'mesero_usuario' => $meseroUsuario,
                'propina_total' => 0.0,
                'ventas_cantidad' => 0,
                'ventas_con_propina' => 0,
            ];
        }

        $tipsByWaiter[$meseroKey]['propina_total'] += $tipAmount;
        $tipsByWaiter[$meseroKey]['ventas_cantidad'] += 1;
        if ($tipAmount > 0) {
            $tipsByWaiter[$meseroKey]['ventas_con_propina'] += 1;
        }

        $difference = clean_float($sale['total_pagado'] ?? 0) - clean_float($sale['total'] ?? 0);
        $sales[$saleId]['diferencia_pago'] = clean_float($difference);

        if (count($sale['metodos']) === 0) {
            $sales[$saleId]['metodos'][] = 'Sin registro';
        }
    }

    $summary['ventas_total'] = clean_float($summary['ventas_total']);
    $summary['total_pagado'] = clean_float($summary['total_pagado']);
    $summary['diferencia_total'] = clean_float($summary['total_pagado'] - $summary['ventas_total']);
    $summary['efectivo_esperado'] = clean_float($summary['efectivo_total']);
    $summary['propinas_total'] = clean_float($summary['propinas_total']);

    $tipsByWaiterList = array_values($tipsByWaiter);
    usort($tipsByWaiterList, static function (array $a, array $b): int {
        $byTip = clean_float($b['propina_total'] ?? 0) <=> clean_float($a['propina_total'] ?? 0);
        if ($byTip !== 0) {
            return $byTip;
        }
        return strcmp(
            (string) ($a['mesero_nombre'] ?? ''),
            (string) ($b['mesero_nombre'] ?? '')
        );
    });

    foreach ($tipsByWaiterList as $index => $row) {
        $tipsByWaiterList[$index]['propina_total'] = clean_float($row['propina_total'] ?? 0);
        $tipsByWaiterList[$index]['ventas_cantidad'] = clean_int($row['ventas_cantidad'] ?? 0);
        $tipsByWaiterList[$index]['ventas_con_propina'] = clean_int($row['ventas_con_propina'] ?? 0);
    }
    $summary['propinas_por_mesero'] = $tipsByWaiterList;

    return [
        'periodo' => [
            'desde' => $desde,
            'hasta' => $hasta,
        ],
        'resumen' => $summary,
        'ventas' => array_values($sales),
    ];
}

function get_comanda_snapshot(PDO $pdo, int $mesaNumero): array
{
    $mesa = get_mesa_by_number($pdo, $mesaNumero);
    if (!$mesa) {
        json_response([
            'ok' => false,
            'error' => 'Mesa no encontrada.',
        ], 404);
    }

    $comanda = get_open_comanda($pdo, (int) $mesa['id']);
    if (!$comanda) {
        return [
            'mesa' => [
                'id' => (int) $mesa['id'],
                'numero' => (int) $mesa['numero'],
                'estado' => (string) $mesa['estado'],
            ],
            'comanda' => null,
            'items' => [],
        ];
    }

    $items = get_comanda_items($pdo, (int) $comanda['id']);
    $total = recalc_total($pdo, (int) $comanda['id']);

    return [
        'mesa' => [
            'id' => (int) $mesa['id'],
            'numero' => (int) $mesa['numero'],
            'estado' => (string) $mesa['estado'],
        ],
        'comanda' => [
            'id' => (int) $comanda['id'],
            'estado' => (string) $comanda['estado'],
            'total' => $total,
            'creada_en' => (string) $comanda['creada_en'],
            'actualizada_en' => (string) $comanda['actualizada_en'],
        ],
        'items' => $items,
    ];
}

function get_mesa_by_number(PDO $pdo, int $mesaNumero): ?array
{
    if ($mesaNumero <= 0 || $mesaNumero > configured_table_count($pdo)) {
        return null;
    }

    $stmt = $pdo->prepare('SELECT id, numero, estado, actualizada_en FROM mesas WHERE numero = :numero LIMIT 1');
    $stmt->execute([':numero' => $mesaNumero]);
    $mesa = $stmt->fetch();

    return $mesa ?: null;
}

function get_open_comanda(PDO $pdo, int $mesaId): ?array
{
    ensure_comanda_waiter_schema($pdo);
    $stmt = $pdo->prepare(
        'SELECT id, mesa_id, estado, total, mesero_id, creada_en, actualizada_en
         FROM comandas
         WHERE mesa_id = :mesa_id AND estado = :estado
         ORDER BY id DESC
         LIMIT 1'
    );
    $stmt->execute([
        ':mesa_id' => $mesaId,
        ':estado' => 'abierta',
    ]);

    $comanda = $stmt->fetch();
    return $comanda ?: null;
}

function get_or_create_open_comanda(PDO $pdo, int $mesaId, int $meseroId = 0): array
{
    $comanda = get_open_comanda($pdo, $mesaId);
    if ($comanda) {
        if ($meseroId > 0 && clean_int($comanda['mesero_id'] ?? 0) <= 0) {
            $assign = $pdo->prepare(
                'UPDATE comandas SET mesero_id = :mesero_id, actualizada_en = :actualizada_en WHERE id = :id'
            );
            $assign->execute([
                ':mesero_id' => $meseroId,
                ':actualizada_en' => now_ts(),
                ':id' => clean_int($comanda['id'] ?? 0),
            ]);
            $comanda['mesero_id'] = $meseroId;
            $comanda['actualizada_en'] = now_ts();
        }
        return $comanda;
    }

    $stmt = $pdo->prepare(
        'INSERT INTO comandas (mesa_id, estado, total, mesero_id, creada_en, actualizada_en)
         VALUES (:mesa_id, :estado, :total, :mesero_id, :creada_en, :actualizada_en)'
    );
    $stmt->execute([
        ':mesa_id' => $mesaId,
        ':estado' => 'abierta',
        ':total' => 0,
        ':mesero_id' => $meseroId > 0 ? $meseroId : null,
        ':creada_en' => now_ts(),
        ':actualizada_en' => now_ts(),
    ]);

    $newId = (int) $pdo->lastInsertId();
    $fresh = $pdo->prepare('SELECT id, mesa_id, estado, total, mesero_id, creada_en, actualizada_en FROM comandas WHERE id = :id LIMIT 1');
    $fresh->execute([':id' => $newId]);

    return (array) $fresh->fetch();
}

function normalize_items(PDO $pdo, array $itemsBody, bool $enforceDailyMenu = false): array
{
    $cleanItems = [];
    $dailyEnabledMap = [];

    if ($enforceDailyMenu) {
        $dailyPayload = get_effective_daily_menu_for_mesero($pdo);
        if (clean_int($dailyPayload['confirmado'] ?? 0) !== 1) {
            return [];
        }

        $products = isset($dailyPayload['productos']) && is_array($dailyPayload['productos'])
            ? $dailyPayload['productos']
            : [];
        foreach ($products as $product) {
            $productId = clean_int($product['id'] ?? 0);
            if ($productId <= 0) {
                continue;
            }
            $dailyEnabledMap[$productId] = clean_int($product['habilitado'] ?? 0) === 1 ? 1 : 0;
        }
    }

    foreach ($itemsBody as $rawItem) {
        if (!is_array($rawItem)) {
            continue;
        }

        $cantidad = clean_int($rawItem['cantidad'] ?? 0);
        if ($cantidad <= 0) {
            continue;
        }

        $productoId = clean_int($rawItem['producto_id'] ?? 0);
        $notas = trim((string) ($rawItem['notas'] ?? ''));

        if ($productoId > 0) {
            if ($enforceDailyMenu) {
                $isEnabled = isset($dailyEnabledMap[$productoId]) && $dailyEnabledMap[$productoId] === 1;
                if (!$isEnabled) {
                    continue;
                }
            }

            $producto = get_producto($pdo, $productoId);
            if (!$producto) {
                continue;
            }

            $precio = (float) $producto['precio'];
            $cleanItems[] = [
                'producto_id' => $productoId,
                'descripcion' => (string) $producto['nombre'],
                'cantidad' => $cantidad,
                'precio_unitario' => $precio,
                'subtotal' => $precio * $cantidad,
                'categoria' => normalize_product_category_label((string) ($producto['categoria'] ?? 'Platos')),
                'notas' => $notas,
            ];
            continue;
        }

        if ($enforceDailyMenu) {
            continue;
        }

        $descripcion = trim((string) ($rawItem['descripcion'] ?? ''));
        $precioManual = clean_float($rawItem['precio'] ?? 0);
        if ($descripcion === '' || $precioManual <= 0) {
            continue;
        }
        $categoriaManual = normalize_product_category_label((string) ($rawItem['categoria'] ?? 'Platos'));

        $cleanItems[] = [
            'producto_id' => null,
            'descripcion' => $descripcion,
            'cantidad' => $cantidad,
            'precio_unitario' => $precioManual,
            'subtotal' => $precioManual * $cantidad,
            'categoria' => $categoriaManual,
            'notas' => $notas,
        ];
    }

    return $cleanItems;
}

function split_order_items_for_print(array $items): array
{
    $groups = [
        'cocina' => [],
        'caja' => [],
    ];

    foreach ($items as $item) {
        $categoria = isset($item['categoria']) ? (string) $item['categoria'] : '';
        if (is_beverage_category($categoria)) {
            $groups['caja'][] = $item;
            continue;
        }
        $groups['cocina'][] = $item;
    }

    return $groups;
}

function is_beverage_category(string $categoria): bool
{
    $token = normalize_category_token($categoria);
    if ($token === '') {
        return false;
    }

    if (strpos($token, 'bebest') !== false || strpos($token, 'bebid') !== false) {
        return true;
    }

    $aliases = ['jugo', 'jugos', 'refresco', 'refrescos', 'gaseosa', 'gaseosas', 'trago', 'tragos'];
    return in_array($token, $aliases, true);
}

function normalize_category_token(string $value): string
{
    $text = strtolower(trim($value));
    $text = strtr($text, [
        'á' => 'a', 'à' => 'a', 'ä' => 'a', 'â' => 'a',
        'é' => 'e', 'è' => 'e', 'ë' => 'e', 'ê' => 'e',
        'í' => 'i', 'ì' => 'i', 'ï' => 'i', 'î' => 'i',
        'ó' => 'o', 'ò' => 'o', 'ö' => 'o', 'ô' => 'o',
        'ú' => 'u', 'ù' => 'u', 'ü' => 'u', 'û' => 'u',
        'ñ' => 'n',
    ]);
    $text = preg_replace('/[^a-z0-9]+/', '', $text) ?? '';
    return trim($text);
}

function summarize_order_prints(array $printResults): array
{
    if (count($printResults) === 0) {
        return [
            'ok' => true,
            'estado' => 'omitida',
            'detalle' => 'No hubo items nuevos para imprimir.',
            'warning' => '',
            'printer' => '',
            'impresion_id' => null,
            'impresion_ids' => [],
            'resultados' => [],
        ];
    }

    $ok = true;
    $detailParts = [];
    $warningParts = [];
    $printers = [];
    $ids = [];

    foreach ($printResults as $destino => $result) {
        $label = strtoupper((string) $destino);
        $isOk = (bool) ($result['ok'] ?? false);
        if (!$isOk) {
            $ok = false;
        }

        $detalle = trim((string) ($result['detalle'] ?? ''));
        if ($detalle !== '') {
            $detailParts[] = $label . ': ' . $detalle;
        }

        $warning = trim((string) ($result['warning'] ?? ''));
        if ($warning !== '') {
            $warningParts[] = $label . ': ' . $warning;
        }

        $printer = trim((string) ($result['printer'] ?? ''));
        if ($printer !== '') {
            $printers[] = $printer;
        }

        if (isset($result['impresion_id']) && $result['impresion_id'] !== null) {
            $id = clean_int($result['impresion_id']);
            if ($id > 0) {
                $ids[] = $id;
            }
        }
    }

    $ids = array_values(array_unique($ids));
    $printers = array_values(array_unique($printers));

    return [
        'ok' => $ok,
        'estado' => $ok ? 'enviada' : 'fallida',
        'detalle' => count($detailParts) > 0 ? implode(' | ', $detailParts) : ($ok ? 'Impresion enviada.' : 'Fallo de impresion.'),
        'warning' => count($warningParts) > 0 ? implode(' | ', $warningParts) : '',
        'printer' => count($printers) > 0 ? implode(', ', $printers) : '',
        'impresion_id' => count($ids) > 0 ? $ids[0] : null,
        'impresion_ids' => $ids,
        'resultados' => $printResults,
    ];
}

function get_producto(PDO $pdo, int $productoId): ?array
{
    $stmt = $pdo->prepare(
        'SELECT id, nombre, categoria, precio
         FROM productos
         WHERE id = :id AND activo = 1
         LIMIT 1'
    );
    $stmt->execute([':id' => $productoId]);
    $row = $stmt->fetch();

    return $row ?: null;
}

function get_comanda_items(PDO $pdo, int $comandaId): array
{
    $stmt = $pdo->prepare(
        'SELECT id, comanda_id, producto_id, descripcion, cantidad, precio_unitario, subtotal, notas, creado_en
         FROM comanda_items
         WHERE comanda_id = :comanda_id
         ORDER BY id ASC'
    );
    $stmt->execute([':comanda_id' => $comandaId]);

    $items = [];
    foreach ($stmt->fetchAll() as $row) {
        $items[] = [
            'id' => (int) $row['id'],
            'comanda_id' => (int) $row['comanda_id'],
            'producto_id' => $row['producto_id'] !== null ? (int) $row['producto_id'] : null,
            'descripcion' => (string) $row['descripcion'],
            'cantidad' => (int) $row['cantidad'],
            'precio_unitario' => (float) $row['precio_unitario'],
            'subtotal' => (float) $row['subtotal'],
            'notas' => (string) ($row['notas'] ?? ''),
            'creado_en' => (string) $row['creado_en'],
        ];
    }

    return $items;
}

function recalc_total(PDO $pdo, int $comandaId): float
{
    $stmt = $pdo->prepare('SELECT COALESCE(SUM(subtotal), 0) AS total FROM comanda_items WHERE comanda_id = :comanda_id');
    $stmt->execute([':comanda_id' => $comandaId]);
    $total = $stmt->fetchColumn();

    return clean_float($total, 0);
}

function register_print_attempt(PDO $pdo, int $comandaId, string $tipo, string $contenido): array
{
    $printOrders = get_setting($pdo, 'imprimir_pedidos', '1') === '1';
    if (in_array($tipo, ['pedido', 'pedido_cocina', 'pedido_bebestibles'], true) && !$printOrders) {
        return [
            'ok' => true,
            'estado' => 'omitida',
            'detalle' => 'Impresion de pedidos desactivada en configuracion.',
            'impresion_id' => null,
        ];
    }

    $insert = $pdo->prepare(
        'INSERT INTO impresiones (comanda_id, tipo, estado, detalle, creada_en)
         VALUES (:comanda_id, :tipo, :estado, :detalle, :creada_en)'
    );
    $insert->execute([
        ':comanda_id' => $comandaId,
        ':tipo' => $tipo,
        ':estado' => 'pendiente',
        ':detalle' => 'Pendiente de envio al servicio local.',
        ':creada_en' => now_ts(),
    ]);

    $impresionId = (int) $pdo->lastInsertId();
    $printerName = resolve_printer_name_for_tipo($pdo, $tipo);
    $paperWidthMm = ticket_paper_width_mm($pdo);
    $charsWidth = ticket_chars_width($pdo);
    $fontSizePt = ticket_font_size_pt($pdo);

    $response = send_print_job([
        'tipo' => $tipo,
        'comanda_id' => $comandaId,
        'impresion_id' => $impresionId,
        'printer_name' => $printerName,
        'paper_width_mm' => $paperWidthMm,
        'chars_per_line' => $charsWidth,
        'font_size_pt' => $fontSizePt,
        'texto' => $contenido,
    ]);

    $estado = $response['ok'] ? 'enviada' : 'fallida';
    $detalle = $response['detalle'];
    if (isset($response['warning']) && trim((string) $response['warning']) !== '') {
        $detalle .= ' | Aviso: ' . trim((string) $response['warning']);
    }
    if ($response['printer'] !== '') {
        $detalle .= ' | Impresora: ' . $response['printer'];
    }

    $update = $pdo->prepare('UPDATE impresiones SET estado = :estado, detalle = :detalle WHERE id = :id');
    $update->execute([
        ':estado' => $estado,
        ':detalle' => $detalle,
        ':id' => $impresionId,
    ]);

    return [
        'ok' => (bool) $response['ok'],
        'estado' => $estado,
        'detalle' => $detalle,
        'printer' => $response['printer'],
        'warning' => $response['warning'] ?? '',
        'impresion_id' => $impresionId,
    ];
}

function send_print_job(array $payload): array
{
    $serviceUrl = getenv('PRINT_SERVICE_URL') ?: 'http://127.0.0.1:3003/print';
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    if ($json === false) {
        return [
            'ok' => false,
            'detalle' => 'No se pudo serializar el trabajo de impresion.',
            'printer' => '',
        ];
    }

    if (function_exists('curl_init')) {
        $curl = curl_init($serviceUrl);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => $json,
            CURLOPT_TIMEOUT => 3,
            CURLOPT_CONNECTTIMEOUT => 2,
        ]);
        $raw = curl_exec($curl);
        $httpCode = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $error = curl_error($curl);
        curl_close($curl);

        if ($raw === false) {
            return [
                'ok' => false,
                'detalle' => 'No se pudo conectar al servicio de impresion: ' . $error,
                'printer' => '',
                'warning' => '',
            ];
        }

        $decoded = json_decode((string) $raw, true);
        $printer = '';
        $warning = '';
        if (is_array($decoded) && isset($decoded['printer'])) {
            $printer = (string) $decoded['printer'];
        }
        if (is_array($decoded) && isset($decoded['warning'])) {
            $warning = (string) $decoded['warning'];
        }

        if ($httpCode < 200 || $httpCode >= 300) {
            $msg = '';
            if (is_array($decoded) && isset($decoded['error'])) {
                $msg = ' ' . (string) $decoded['error'];
            }
            return [
                'ok' => false,
                'detalle' => "Servicio de impresion respondio HTTP {$httpCode}." . $msg,
                'printer' => $printer,
                'warning' => $warning,
            ];
        }

        if (!is_array($decoded) || !($decoded['ok'] ?? false)) {
            $errorText = is_array($decoded) && isset($decoded['error'])
                ? (string) $decoded['error']
                : 'Servicio de impresion rechazo el trabajo.';
            return [
                'ok' => false,
                'detalle' => $errorText,
                'printer' => $printer,
                'warning' => $warning,
            ];
        }

        return [
            'ok' => true,
            'detalle' => 'Ticket enviado a la impresora local.',
            'printer' => $printer,
            'warning' => $warning,
        ];
    }

    $ctx = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n",
            'content' => $json,
            'timeout' => 3,
        ],
    ]);

    $raw = @file_get_contents($serviceUrl, false, $ctx);
    if ($raw === false) {
        return [
            'ok' => false,
            'detalle' => 'No se pudo contactar al servicio de impresion local.',
            'printer' => '',
            'warning' => '',
        ];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded) || !($decoded['ok'] ?? false)) {
        $printer = is_array($decoded) && isset($decoded['printer']) ? (string) $decoded['printer'] : '';
        $errorText = is_array($decoded) && isset($decoded['error'])
            ? (string) $decoded['error']
            : 'Servicio de impresion no confirmo el ticket.';
        return [
            'ok' => false,
            'detalle' => $errorText,
            'printer' => $printer,
            'warning' => is_array($decoded) && isset($decoded['warning']) ? (string) $decoded['warning'] : '',
        ];
    }

    return [
        'ok' => true,
        'detalle' => 'Ticket enviado a la impresora local.',
        'printer' => isset($decoded['printer']) ? (string) $decoded['printer'] : '',
        'warning' => isset($decoded['warning']) ? (string) $decoded['warning'] : '',
    ];
}

function build_order_ticket(string $localName, int $lineWidth, int $mesaNumero, int $comandaId, array $newItems, string $origen, string $area): string
{
    $width = max(20, min(80, $lineWidth));
    $rule = ticket_rule($width);
    $lines = [];
    ticket_add_wrapped($lines, strtoupper($localName), $width);
    ticket_add_wrapped($lines, 'NUEVO PEDIDO', $width);
    ticket_add_wrapped($lines, strtoupper($area), $width);
    $lines[] = $rule;
    ticket_add_wrapped($lines, 'Mesa: ' . $mesaNumero, $width);
    ticket_add_wrapped($lines, 'Comanda: #' . $comandaId, $width);
    ticket_add_wrapped($lines, 'Origen: ' . strtoupper($origen), $width);
    ticket_add_wrapped($lines, 'Hora: ' . now_ts_with_tz(), $width);
    $lines[] = $rule;

    foreach ($newItems as $item) {
        $qty = (int) $item['cantidad'];
        $desc = trim((string) $item['descripcion']);
        ticket_add_wrapped($lines, "{$qty} x {$desc}", $width);

        $notas = trim((string) $item['notas']);
        if ($notas !== '') {
            ticket_add_wrapped($lines, 'Nota: ' . $notas, $width);
        }
    }

    $lines[] = $rule;
    ticket_add_wrapped($lines, 'SOLO PREPARACION - SIN PRECIOS', $width);

    return implode(PHP_EOL, $lines) . PHP_EOL;
}

function build_prebill_ticket(
    string $localName,
    int $lineWidth,
    int $mesaNumero,
    int $comandaId,
    array $items,
    float $total,
    bool $tipEnabled = true,
    float $tipPercent = 10.0
): string
{
    $width = max(20, min(80, $lineWidth));
    $rule = ticket_rule($width);
    $lines = [];
    ticket_add_wrapped($lines, strtoupper($localName), $width);
    ticket_add_wrapped($lines, 'PRECUENTA', $width);
    $lines[] = $rule;
    ticket_add_wrapped($lines, 'Mesa: ' . $mesaNumero, $width);
    ticket_add_wrapped($lines, 'Comanda: #' . $comandaId, $width);
    ticket_add_wrapped($lines, 'Hora: ' . now_ts_with_tz(), $width);
    $lines[] = $rule;

    foreach ($items as $item) {
        $qty = (int) $item['cantidad'];
        $desc = (string) $item['descripcion'];
        $subtotal = money((float) $item['subtotal']);
        ticket_add_wrapped($lines, "{$qty} x {$desc}", $width);
        $lines[] = ticket_align_right($subtotal, $width);
    }

    $lines[] = $rule;
    ticket_add_wrapped($lines, 'TOTAL A PAGAR: ' . money($total), $width);
    if ($tipEnabled) {
        $suggestedTip = tip_amount_for_total($total, $tipPercent);
        $totalWithTip = $total + $suggestedTip;
        ticket_add_wrapped($lines, "PROPINA SUGERIDA ({$tipPercent}%): " . money($suggestedTip), $width);
        ticket_add_wrapped($lines, 'TOTAL + PROPINA: ' . money($totalWithTip), $width);
    }
    $lines[] = $rule;

    return implode(PHP_EOL, $lines) . PHP_EOL;
}

function build_final_ticket(
    string $localName,
    int $lineWidth,
    int $mesaNumero,
    int $comandaId,
    array $items,
    float $total,
    string $metodo,
    array $payments = [],
    float $tipAmount = 0
): string
{
    $width = max(20, min(80, $lineWidth));
    $rule = ticket_rule($width);
    $lines = [];
    ticket_add_wrapped($lines, strtoupper($localName), $width);
    ticket_add_wrapped($lines, 'TICKET DE PAGO', $width);
    $lines[] = $rule;
    ticket_add_wrapped($lines, 'Mesa: ' . $mesaNumero, $width);
    ticket_add_wrapped($lines, 'Comanda: #' . $comandaId, $width);
    ticket_add_wrapped($lines, 'Hora: ' . now_ts_with_tz(), $width);
    $lines[] = $rule;

    foreach ($items as $item) {
        $qty = (int) $item['cantidad'];
        $desc = (string) $item['descripcion'];
        $subtotal = money((float) $item['subtotal']);
        ticket_add_wrapped($lines, "{$qty} x {$desc}", $width);
        $lines[] = ticket_align_right($subtotal, $width);
    }

    $lines[] = $rule;
    ticket_add_wrapped($lines, 'TOTAL: ' . money($total), $width);
    if ($tipAmount > 0) {
        ticket_add_wrapped($lines, 'PROPINA: ' . money($tipAmount), $width);
        ticket_add_wrapped($lines, 'TOTAL COBRADO: ' . money($total + $tipAmount), $width);
    }
    ticket_add_wrapped($lines, 'Metodo: ' . strtoupper($metodo), $width);
    if (count($payments) > 1 || strtolower(trim($metodo)) === 'mixto') {
        ticket_add_wrapped($lines, 'Detalle pagos:', $width);
        foreach ($payments as $payment) {
            $label = payment_method_label((string) ($payment['metodo'] ?? ''));
            $amount = money(clean_float($payment['monto'] ?? 0));
            ticket_add_wrapped($lines, "{$label}: {$amount}", $width);
        }
    }
    $lines[] = $rule;
    ticket_add_wrapped($lines, 'Pago registrado', $width);

    return implode(PHP_EOL, $lines) . PHP_EOL;
}

function ticket_rule(int $width): string
{
    return str_repeat('-', max(10, $width));
}

function ticket_align_right(string $text, int $width): string
{
    $clean = trim($text);
    $len = strlen($clean);
    if ($len >= $width) {
        return $clean;
    }
    return str_repeat(' ', $width - $len) . $clean;
}

function ticket_add_wrapped(array &$lines, string $text, int $width): void
{
    $pieces = ticket_wrap_text($text, $width);
    foreach ($pieces as $piece) {
        $lines[] = $piece;
    }
}

function ticket_wrap_text(string $text, int $width): array
{
    $clean = trim(preg_replace('/\s+/', ' ', $text) ?? '');
    if ($clean === '') {
        return [''];
    }

    $wrapped = wordwrap($clean, max(1, $width), PHP_EOL, true);
    $parts = explode(PHP_EOL, $wrapped);
    $out = [];
    foreach ($parts as $part) {
        $out[] = trim($part);
    }

    return $out;
}
