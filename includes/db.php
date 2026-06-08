<?php
declare(strict_types=1);

function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $config = db_config();
    $driver = strtolower((string) ($config['driver'] ?? 'mysql'));
    if ($driver !== 'mysql') {
        throw new RuntimeException('Solo se permite MySQL en esta version.');
    }

    $pdo = db_connect_mysql(is_array($config['mysql'] ?? null) ? $config['mysql'] : []);

    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    if (defined('PDO::ATTR_EMULATE_PREPARES')) {
        $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
    }

    init_db($pdo);

    return $pdo;
}

function db_config(): array
{
    static $config = null;

    if (is_array($config)) {
        return $config;
    }

    $defaults = [
        'driver' => 'mysql',
        'mysql' => [
            'host' => '127.0.0.1',
            'port' => 3306,
            'database' => 'comanda',
            'username' => 'root',
            'password' => '',
            'charset' => 'utf8mb4',
            'collation' => 'utf8mb4_unicode_ci',
        ],
    ];

    $customFile = __DIR__ . '/db_config.php';
    $custom = [];
    if (is_file($customFile)) {
        $loaded = require $customFile;
        if (is_array($loaded)) {
            $custom = $loaded;
        }
    }

    $config = array_replace_recursive($defaults, $custom);
    return $config;
}

function db_connect_mysql(array $config): PDO
{
    $host = (string) ($config['host'] ?? '127.0.0.1');
    $port = (int) ($config['port'] ?? 3306);
    $database = trim((string) ($config['database'] ?? 'comanda'));
    $username = (string) ($config['username'] ?? 'root');
    $password = (string) ($config['password'] ?? '');
    $charset = (string) ($config['charset'] ?? 'utf8mb4');
    $collation = (string) ($config['collation'] ?? 'utf8mb4_unicode_ci');

    if ($database === '' || preg_match('/^[A-Za-z0-9_]+$/', $database) !== 1) {
        throw new RuntimeException('Nombre de base de datos MySQL invalido.');
    }
    if (preg_match('/^[A-Za-z0-9_]+$/', $charset) !== 1) {
        throw new RuntimeException('Charset MySQL invalido.');
    }
    if (preg_match('/^[A-Za-z0-9_]+$/', $collation) !== 1) {
        throw new RuntimeException('Collation MySQL invalida.');
    }

    $serverDsn = sprintf('mysql:host=%s;port=%d;charset=%s', $host, $port, $charset);
    $serverPdo = new PDO($serverDsn, $username, $password);
    $quotedDb = '`' . str_replace('`', '``', $database) . '`';
    $serverPdo->exec("CREATE DATABASE IF NOT EXISTS {$quotedDb} CHARACTER SET {$charset} COLLATE {$collation}");

    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', $host, $port, $database, $charset);
    return new PDO($dsn, $username, $password);
}

function db_is_mysql(PDO $pdo): bool
{
    return db_driver($pdo) === 'mysql';
}

function db_driver(PDO $pdo): string
{
    $driver = strtolower((string) $pdo->getAttribute(PDO::ATTR_DRIVER_NAME));
    return $driver;
}

function init_db(PDO $pdo): void
{
    init_db_mysql($pdo);
    ensure_product_options_schema($pdo);

    seed_mesas($pdo, 20);
    seed_productos($pdo);
    seed_settings($pdo);
    seed_users($pdo);
}

function init_db_mysql(PDO $pdo): void
{
    $pdo->exec(
        <<<SQL
CREATE TABLE IF NOT EXISTS mesas (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    numero INT NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'libre',
    actualizada_en DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_mesas_numero (numero)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL
    );

    $pdo->exec(
        <<<SQL
CREATE TABLE IF NOT EXISTS productos (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(190) NOT NULL,
    categoria VARCHAR(50) NOT NULL,
    precio DECIMAL(12,2) NOT NULL,
    requiere_agregado TINYINT(1) NOT NULL DEFAULT 0,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL
    );

    $pdo->exec(
        <<<SQL
CREATE TABLE IF NOT EXISTS usuarios (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(120) NOT NULL,
    usuario VARCHAR(120) NOT NULL,
    rol VARCHAR(30) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    alertas_nuevas_comandas TINYINT(1) DEFAULT 1,
    creado_en DATETIME NOT NULL,
    actualizado_en DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_usuarios_usuario (usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL
    );

    $pdo->exec(
        <<<SQL
CREATE TABLE IF NOT EXISTS comandas (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    mesa_id INT UNSIGNED NOT NULL,
    mesero_id INT UNSIGNED DEFAULT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'abierta',
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    propina_monto DECIMAL(12,2) NOT NULL DEFAULT 0,
    propina_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 10,
    creada_en DATETIME NOT NULL,
    actualizada_en DATETIME NOT NULL,
    cerrada_en DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_comandas_mesa_estado (mesa_id, estado),
    KEY idx_comandas_mesero (mesero_id),
    CONSTRAINT fk_comandas_mesa FOREIGN KEY (mesa_id) REFERENCES mesas (id),
    CONSTRAINT fk_comandas_mesero FOREIGN KEY (mesero_id) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL
    );

    $pdo->exec(
        <<<SQL
CREATE TABLE IF NOT EXISTS comanda_items (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    comanda_id INT UNSIGNED NOT NULL,
    producto_id INT UNSIGNED DEFAULT NULL,
    descripcion VARCHAR(255) NOT NULL,
    cantidad INT NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    notas TEXT,
    creado_en DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY idx_comanda_items_comanda (comanda_id),
    KEY idx_comanda_items_producto (producto_id),
    CONSTRAINT fk_comanda_items_comanda FOREIGN KEY (comanda_id) REFERENCES comandas (id),
    CONSTRAINT fk_comanda_items_producto FOREIGN KEY (producto_id) REFERENCES productos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL
    );

    $pdo->exec(
        <<<SQL
CREATE TABLE IF NOT EXISTS pagos (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    comanda_id INT UNSIGNED NOT NULL,
    metodo VARCHAR(30) NOT NULL,
    monto DECIMAL(12,2) NOT NULL,
    creado_en DATETIME NOT NULL,
    usuario_id INT UNSIGNED DEFAULT NULL,
    caja_sesion_id INT UNSIGNED DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_pagos_comanda (comanda_id),
    CONSTRAINT fk_pagos_comanda FOREIGN KEY (comanda_id) REFERENCES comandas (id),
    CONSTRAINT fk_pagos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL
    );

    $pdo->exec(
        <<<SQL
CREATE TABLE IF NOT EXISTS impresiones (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    comanda_id INT UNSIGNED NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    estado VARCHAR(30) NOT NULL,
    detalle TEXT,
    creada_en DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY idx_impresiones_comanda (comanda_id),
    CONSTRAINT fk_impresiones_comanda FOREIGN KEY (comanda_id) REFERENCES comandas (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL
    );

    $pdo->exec(
        <<<SQL
CREATE TABLE IF NOT EXISTS configuraciones (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    clave VARCHAR(120) NOT NULL,
    valor TEXT NOT NULL,
    actualizada_en DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_configuraciones_clave (clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL
    );
}

function ensure_product_options_schema(PDO $pdo): void
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) AS total
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table
           AND COLUMN_NAME = :column'
    );
    $stmt->execute([
        ':table' => 'productos',
        ':column' => 'requiere_agregado',
    ]);

    if ((int) $stmt->fetchColumn() > 0) {
        return;
    }

    $pdo->exec('ALTER TABLE productos ADD COLUMN requiere_agregado TINYINT(1) NOT NULL DEFAULT 0');
}

function seed_mesas(PDO $pdo, int $cantidad): void
{
    $stmt = $pdo->query('SELECT COUNT(*) AS total FROM mesas');
    $total = (int) $stmt->fetchColumn();

    if ($total > 0) {
        return;
    }

    $insert = $pdo->prepare('INSERT INTO mesas (numero, estado, actualizada_en) VALUES (:numero, :estado, :actualizada)');
    $timestamp = date('Y-m-d H:i:s');

    for ($i = 1; $i <= $cantidad; $i++) {
        $insert->execute([
            ':numero' => $i,
            ':estado' => 'libre',
            ':actualizada' => $timestamp,
        ]);
    }
}

function seed_productos(PDO $pdo): void
{
    $stmt = $pdo->query('SELECT COUNT(*) AS total FROM productos');
    $total = (int) $stmt->fetchColumn();

    if ($total > 0) {
        return;
    }

    $productos = [
        ['nombre' => 'Cazuela de Vacuno', 'categoria' => 'Platos', 'precio' => 6500],
        ['nombre' => 'Pastel de Choclo', 'categoria' => 'Platos', 'precio' => 6200],
        ['nombre' => 'Porotos Granados', 'categoria' => 'Platos', 'precio' => 5900],
        ['nombre' => 'Carbonada', 'categoria' => 'Platos', 'precio' => 6100],
        ['nombre' => 'Empanada de Pino', 'categoria' => 'Platos', 'precio' => 2200],
        ['nombre' => 'Humita', 'categoria' => 'Platos', 'precio' => 2500],
        ['nombre' => 'Ensalada Chilena', 'categoria' => 'Platos', 'precio' => 2800],
        ['nombre' => 'Jugo Natural', 'categoria' => 'Bebestibles', 'precio' => 1800],
        ['nombre' => 'Bebida 350ml', 'categoria' => 'Bebestibles', 'precio' => 1500],
        ['nombre' => 'Agua Mineral', 'categoria' => 'Bebestibles', 'precio' => 1300],
        ['nombre' => 'Ensalada', 'categoria' => 'Agregados', 'precio' => 0],
        ['nombre' => 'Arroz', 'categoria' => 'Agregados', 'precio' => 0],
        ['nombre' => 'Papas Fritas', 'categoria' => 'Agregados', 'precio' => 0],
        ['nombre' => 'Extra Queso', 'categoria' => 'Extras', 'precio' => 500],
        ['nombre' => 'Extra Huevo', 'categoria' => 'Extras', 'precio' => 700],
    ];

    $insert = $pdo->prepare(
        'INSERT INTO productos (nombre, categoria, precio, activo) VALUES (:nombre, :categoria, :precio, 1)'
    );

    foreach ($productos as $producto) {
        $insert->execute([
            ':nombre' => $producto['nombre'],
            ':categoria' => $producto['categoria'],
            ':precio' => $producto['precio'],
        ]);
    }
}

function seed_settings(PDO $pdo): void
{
    $mesasTotal = (int) $pdo->query('SELECT COUNT(*) FROM mesas')->fetchColumn();
    $defaults = [
        'nombre_local' => 'Donde Abel',
        'moneda_simbolo' => '$',
        'imprimir_pedidos' => '1',
        'propina_habilitada' => '1',
        'propina_porcentaje' => '10',
        'impresora_modo' => 'una',
        'impresora_cocina' => '',
        'impresora_caja' => '',
        'ticket_papel_mm' => '58',
        'ticket_ancho_chars' => '32',
        'ticket_fuente_pt' => '9',
        'alerta_sonido_activo' => '1',
        'alerta_tono_comanda' => 'tono_1',
        'mesas_cantidad' => (string) max(1, $mesasTotal),
    ];

    $find = $pdo->prepare('SELECT id FROM configuraciones WHERE clave = :clave LIMIT 1');
    $insert = $pdo->prepare(
        'INSERT INTO configuraciones (clave, valor, actualizada_en)
         VALUES (:clave, :valor, :actualizada_en)'
    );

    foreach ($defaults as $clave => $valor) {
        $find->execute([':clave' => $clave]);
        $existing = $find->fetchColumn();
        if ($existing !== false) {
            continue;
        }

        $insert->execute([
            ':clave' => $clave,
            ':valor' => $valor,
            ':actualizada_en' => date('Y-m-d H:i:s'),
        ]);
    }
}

function seed_users(PDO $pdo): void
{
    $total = (int) $pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn();
    if ($total > 0) {
        return;
    }

    $stmt = $pdo->prepare(
        'INSERT INTO usuarios (nombre, usuario, rol, password_hash, activo, creado_en, actualizado_en)
         VALUES (:nombre, :usuario, :rol, :password_hash, :activo, :creado_en, :actualizado_en)'
    );

    $now = date('Y-m-d H:i:s');
    $stmt->execute([
        ':nombre' => 'Administrador',
        ':usuario' => 'admin',
        ':rol' => 'admin',
        ':password_hash' => password_hash('123456', PASSWORD_DEFAULT),
        ':activo' => 1,
        ':creado_en' => $now,
        ':actualizado_en' => $now,
    ]);
}
