<?php
declare(strict_types=1);

function auth_user_public(array $user): array
{
    return [
        'id' => (int) $user['id'],
        'nombre' => (string) $user['nombre'],
        'usuario' => (string) $user['usuario'],
        'rol' => (string) $user['rol'],
    ];
}

function auth_home_for_role(string $rol): string
{
    if ($rol === 'mesero') {
        return 'mesero.html';
    }

    if ($rol === 'admin' || $rol === 'caja' || $rol === 'cajero' || $rol === 'cocina') {
        return 'servidor.html';
    }

    return 'servidor.html';
}

function auth_find_user_by_username(PDO $pdo, string $usuario): ?array
{
    $stmt = $pdo->prepare(
        'SELECT id, nombre, usuario, rol, activo, password_hash
         FROM usuarios
         WHERE usuario = :usuario
         LIMIT 1'
    );
    $stmt->execute([':usuario' => $usuario]);
    $row = $stmt->fetch();

    return $row ?: null;
}

function auth_find_user_by_id(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare(
        'SELECT id, nombre, usuario, rol, activo, password_hash
         FROM usuarios
         WHERE id = :id
         LIMIT 1'
    );
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();

    return $row ?: null;
}

function auth_set_user_session(array $user): void
{
    $_SESSION['app_user_id'] = (int) $user['id'];
    $_SESSION['app_user_rol'] = (string) $user['rol'];
}

function auth_clear_user_session(): void
{
    unset($_SESSION['app_user_id'], $_SESSION['app_user_rol']);
}

function auth_current_user(PDO $pdo): ?array
{
    $userId = isset($_SESSION['app_user_id']) ? (int) $_SESSION['app_user_id'] : 0;
    if ($userId <= 0) {
        return null;
    }

    $user = auth_find_user_by_id($pdo, $userId);
    if (!$user || (int) $user['activo'] !== 1) {
        auth_clear_user_session();
        return null;
    }

    $_SESSION['app_user_rol'] = (string) $user['rol'];
    return auth_user_public($user);
}

function auth_attempt_login(PDO $pdo, string $usuario, string $password): ?array
{
    $user = auth_find_user_by_username($pdo, $usuario);
    if (!$user) {
        return null;
    }

    if ((int) $user['activo'] !== 1) {
        return null;
    }

    $hash = (string) $user['password_hash'];
    if ($hash === '' || !password_verify($password, $hash)) {
        return null;
    }

    $public = auth_user_public($user);
    auth_set_user_session($public);
    return $public;
}

function auth_page_require_login(PDO $pdo, string $loginUrl = 'login.html'): array
{
    $user = auth_current_user($pdo);
    if (!$user) {
        header('Location: ' . $loginUrl);
        exit;
    }

    return $user;
}

function auth_page_require_roles(PDO $pdo, array $roles, string $loginUrl = 'login.html'): array
{
    $user = auth_page_require_login($pdo, $loginUrl);
    if (!in_array((string) $user['rol'], $roles, true)) {
        header('Location: ' . auth_home_for_role((string) $user['rol']));
        exit;
    }

    return $user;
}
