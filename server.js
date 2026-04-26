const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const APP_PORT = clampInt(process.env.APP_PORT || process.env.PORT, 3003, 1, 65535);
const APP_HOST = String(process.env.APP_HOST || "0.0.0.0");
const PRINT_PORT = clampInt(process.env.PRINT_PORT, 7003, 7001, 65535);
const PRINT_HOST = String(process.env.PRINT_HOST || "0.0.0.0");
const APP_TIMEZONE = resolveTimezone(process.env.APP_TIMEZONE || "America/Santiago");
const JOBS_DIR = path.join(__dirname, "print_jobs");
const PRINT_SERVICE_URL = String(
    process.env.PRINT_SERVICE_URL || `http://127.0.0.1:${PRINT_PORT}/print`
).trim();

const DB_CONFIG = {
    host: String(process.env.COMANDA_DB_HOST || "127.0.0.1"),
    port: clampInt(process.env.COMANDA_DB_PORT, 3306, 1, 65535),
    user: String(process.env.COMANDA_DB_USER || "root"),
    password: String(process.env.COMANDA_DB_PASS || ""),
    database: String(process.env.COMANDA_DB_NAME || "comanda").trim(),
    charset: String(process.env.COMANDA_DB_CHARSET || "utf8mb4").trim(),
    collation: String(process.env.COMANDA_DB_COLLATION || "utf8mb4_unicode_ci").trim()
};

const SESSION_COOKIE_NAME = String(process.env.SESSION_COOKIE_NAME || "comanda_sid");
const SESSION_TTL_SECONDS = clampInt(process.env.SESSION_TTL_SECONDS, 60 * 60 * 24 * 7, 60, 60 * 60 * 24 * 30);
const sessions = new Map();

ensureDir(JOBS_DIR);

let pool = null;

bootstrap().catch((error) => {
    console.error("[BOOT] Error fatal:", error);
    process.exit(1);
});

async function bootstrap() {
    validateConfig();
    await initDatabase();
    const apiApp = createApiServer();
    const printApp = createPrintServer();

    apiApp.listen(APP_PORT, APP_HOST, () => {
        console.log(`[API] Servidor Node activo en http://${APP_HOST}:${APP_PORT}`);
        console.log(`[API] Conectado a MySQL ${DB_CONFIG.host}:${DB_CONFIG.port} / db=${DB_CONFIG.database}`);
        console.log(`[API] Timezone: ${APP_TIMEZONE}`);
    });

    printApp.listen(PRINT_PORT, PRINT_HOST, () => {
        console.log(`[PRINT] Servicio de impresion activo en http://${PRINT_HOST}:${PRINT_PORT}`);
    });
}

function validateConfig() {
    if (!/^[A-Za-z0-9_]+$/.test(DB_CONFIG.database)) {
        throw new Error("Nombre de base de datos invalido.");
    }
    if (!/^[A-Za-z0-9_]+$/.test(DB_CONFIG.charset)) {
        throw new Error("Charset MySQL invalido.");
    }
    if (!/^[A-Za-z0-9_]+$/.test(DB_CONFIG.collation)) {
        throw new Error("Collation MySQL invalida.");
    }
}

async function initDatabase() {
    const rootConn = await mysql.createConnection({
        host: DB_CONFIG.host,
        port: DB_CONFIG.port,
        user: DB_CONFIG.user,
        password: DB_CONFIG.password,
        charset: DB_CONFIG.charset
    });

    const quotedDb = `\`${DB_CONFIG.database.replace(/`/g, "``")}\``;
    await rootConn.query(
        `CREATE DATABASE IF NOT EXISTS ${quotedDb} CHARACTER SET ${DB_CONFIG.charset} COLLATE ${DB_CONFIG.collation}`
    );
    await rootConn.end();

    pool = mysql.createPool({
        host: DB_CONFIG.host,
        port: DB_CONFIG.port,
        user: DB_CONFIG.user,
        password: DB_CONFIG.password,
        database: DB_CONFIG.database,
        charset: DB_CONFIG.charset,
        connectionLimit: 10
    });

    await initDbSchema();
    await seedBaseData();
}

async function initDbSchema() {
    await run(
        `CREATE TABLE IF NOT EXISTS mesas (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            numero INT NOT NULL,
            estado VARCHAR(20) NOT NULL DEFAULT 'libre',
            actualizada_en DATETIME NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_mesas_numero (numero)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    await run(
        `CREATE TABLE IF NOT EXISTS productos (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            nombre VARCHAR(190) NOT NULL,
            categoria VARCHAR(50) NOT NULL,
            precio DECIMAL(12,2) NOT NULL,
            activo TINYINT(1) NOT NULL DEFAULT 1,
            PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    await run(
        `CREATE TABLE IF NOT EXISTS usuarios (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    await run(
        `CREATE TABLE IF NOT EXISTS comandas (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    await run(
        `CREATE TABLE IF NOT EXISTS comanda_items (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    await run(
        `CREATE TABLE IF NOT EXISTS pagos (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            comanda_id INT UNSIGNED NOT NULL,
            metodo VARCHAR(30) NOT NULL,
            monto DECIMAL(12,2) NOT NULL,
            creado_en DATETIME NOT NULL,
            usuario_id INT UNSIGNED DEFAULT NULL,
            caja_sesion_id INT UNSIGNED DEFAULT NULL,
            PRIMARY KEY (id),
            KEY idx_pagos_comanda (comanda_id),
            KEY idx_pagos_usuario (usuario_id),
            CONSTRAINT fk_pagos_comanda FOREIGN KEY (comanda_id) REFERENCES comandas (id),
            CONSTRAINT fk_pagos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    await run(
        `CREATE TABLE IF NOT EXISTS impresiones (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            comanda_id INT UNSIGNED NOT NULL,
            tipo VARCHAR(50) NOT NULL,
            estado VARCHAR(30) NOT NULL,
            detalle TEXT,
            creada_en DATETIME NOT NULL,
            PRIMARY KEY (id),
            KEY idx_impresiones_comanda (comanda_id),
            CONSTRAINT fk_impresiones_comanda FOREIGN KEY (comanda_id) REFERENCES comandas (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    await run(
        `CREATE TABLE IF NOT EXISTS configuraciones (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            clave VARCHAR(120) NOT NULL,
            valor TEXT NOT NULL,
            actualizada_en DATETIME NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_configuraciones_clave (clave)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    await run(
        `CREATE TABLE IF NOT EXISTS caja_sesiones (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    await run(
        `CREATE TABLE IF NOT EXISTS menu_diario_items (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    await run(
        `CREATE TABLE IF NOT EXISTS menu_diario_confirmaciones (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            fecha DATE NOT NULL,
            confirmado_por INT UNSIGNED DEFAULT NULL,
            confirmado_en DATETIME DEFAULT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_menu_confirmacion_fecha (fecha),
            KEY idx_menu_confirmacion_usuario (confirmado_por),
            CONSTRAINT fk_menu_confirmacion_usuario FOREIGN KEY (confirmado_por) REFERENCES usuarios (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    await ensureTableColumn("usuarios", "alertas_nuevas_comandas", "TINYINT(1) DEFAULT 1");
    await ensureTableColumn("comandas", "propina_monto", "DECIMAL(12,2) NOT NULL DEFAULT 0");
    await ensureTableColumn("comandas", "propina_porcentaje", "DECIMAL(5,2) NOT NULL DEFAULT 10");
    await ensureTableColumn("comandas", "mesero_id", "INT UNSIGNED DEFAULT NULL");
    await ensureTableColumn("pagos", "usuario_id", "INT UNSIGNED DEFAULT NULL");
    await ensureTableColumn("pagos", "caja_sesion_id", "INT UNSIGNED DEFAULT NULL");
    await run("UPDATE usuarios SET alertas_nuevas_comandas = 1 WHERE alertas_nuevas_comandas IS NULL");
}

async function ensureTableColumn(table, column, typeSql) {
    const row = await one(
        `SELECT COUNT(*) AS total
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?`,
        [table, column]
    );
    if (cleanInt(row ? row.total : 0) > 0) {
        return;
    }
    await run(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${typeSql}`);
}

async function seedBaseData() {
    await seedMesas(20);
    await seedProductos();
    await seedSettings();
    await seedUsers();
}

async function seedMesas(cantidad) {
    const row = await one("SELECT COUNT(*) AS total FROM mesas");
    if (cleanInt(row ? row.total : 0) > 0) {
        return;
    }
    const now = nowTs();
    for (let i = 1; i <= cantidad; i += 1) {
        await run("INSERT INTO mesas (numero, estado, actualizada_en) VALUES (?, ?, ?)", [i, "libre", now]);
    }
}

async function seedProductos() {
    const row = await one("SELECT COUNT(*) AS total FROM productos");
    if (cleanInt(row ? row.total : 0) > 0) {
        return;
    }

    const productos = [
        ["Cazuela de Vacuno", "Platos", 6500],
        ["Pastel de Choclo", "Platos", 6200],
        ["Porotos Granados", "Platos", 5900],
        ["Carbonada", "Platos", 6100],
        ["Empanada de Pino", "Entradas", 2200],
        ["Humita", "Entradas", 2500],
        ["Ensalada Chilena", "Entradas", 2800],
        ["Jugo Natural", "Bebidas", 1800],
        ["Bebida 350ml", "Bebidas", 1500],
        ["Agua Mineral", "Bebidas", 1300],
        ["Leche Asada", "Postres", 2600],
        ["Mote con Huesillos", "Postres", 2900]
    ];

    for (const item of productos) {
        await run("INSERT INTO productos (nombre, categoria, precio, activo) VALUES (?, ?, ?, 1)", item);
    }
}

async function seedSettings() {
    const mesasTotalRow = await one("SELECT COUNT(*) AS total FROM mesas");
    const mesasTotal = Math.max(1, cleanInt(mesasTotalRow ? mesasTotalRow.total : 20, 20));
    const defaults = {
        nombre_local: "Donde Abel",
        moneda_simbolo: "$",
        imprimir_pedidos: "1",
        propina_habilitada: "1",
        propina_porcentaje: "10",
        impresora_modo: "una",
        impresora_cocina: "",
        impresora_caja: "",
        ticket_papel_mm: "58",
        ticket_ancho_chars: "32",
        ticket_fuente_pt: "9",
        alerta_sonido_activo: "1",
        alerta_tono_comanda: "tono_1",
        mesas_cantidad: String(mesasTotal)
    };

    for (const [clave, valor] of Object.entries(defaults)) {
        const row = await one("SELECT id FROM configuraciones WHERE clave = ? LIMIT 1", [clave]);
        if (row) {
            continue;
        }
        await run(
            "INSERT INTO configuraciones (clave, valor, actualizada_en) VALUES (?, ?, ?)",
            [clave, valor, nowTs()]
        );
    }
}

async function seedUsers() {
    const row = await one("SELECT COUNT(*) AS total FROM usuarios");
    if (cleanInt(row ? row.total : 0) > 0) {
        return;
    }
    const hash = await bcrypt.hash("123456", 10);
    const now = nowTs();
    await run(
        `INSERT INTO usuarios (nombre, usuario, rol, password_hash, activo, creado_en, actualizado_en)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
        ["Administrador", "admin", "admin", hash, now, now]
    );
}

function createApiServer() {
    const app = express();
    app.use(express.json({ limit: "1mb" }));
    app.use(apiCorsMiddleware);

    app.all(["/api", "/api.php"], async (req, res) => {
        const action = String((req.query && req.query.action) || "").trim();
        try {
            if (req.method === "GET") {
                await handleApiGet(req, res, action);
                return;
            }
            if (req.method === "POST") {
                await handleApiPost(req, res, action);
                return;
            }
            jsonResponse(res, 405, { ok: false, error: "Metodo no soportado." });
        } catch (error) {
            handleApiError(res, error);
        }
    });

    app.get("/health", async (req, res) => {
        try {
            await run("SELECT 1");
            jsonResponse(res, 200, {
                ok: true,
                status: "up",
                service: "comanda-api",
                timestamp: new Date().toISOString(),
                timestamp_local: formatLocalTimestamp(new Date()),
                timezone: APP_TIMEZONE,
                db: {
                    host: DB_CONFIG.host,
                    port: DB_CONFIG.port,
                    database: DB_CONFIG.database
                },
                print_service_url: PRINT_SERVICE_URL
            });
        } catch (error) {
            jsonResponse(res, 500, {
                ok: false,
                error: error.message || "DB no disponible."
            });
        }
    });

    app.use(express.static(__dirname, { index: false }));
    app.get("/", (req, res) => {
        res.sendFile(path.join(__dirname, "login.html"));
    });

    app.use((req, res) => {
        jsonResponse(res, 404, { ok: false, error: "Ruta no encontrada." });
    });

    return app;
}

function createPrintServer() {
    const app = express();
    app.use(express.json({ limit: "1mb" }));
    app.use(printCorsMiddleware);

    app.get("/health", (req, res) => {
        jsonResponse(res, 200, {
            ok: true,
            status: "up",
            service: "local-print-service",
            timestamp: new Date().toISOString(),
            timestamp_local: formatLocalTimestamp(new Date()),
            timezone: APP_TIMEZONE
        });
    });

    app.get("/printers", async (req, res) => {
        const list = await listPrinters();
        if (!list.ok) {
            jsonResponse(res, 500, list);
            return;
        }
        jsonResponse(res, 200, list);
    });

    app.post("/print", async (req, res) => {
        try {
            const body = isObject(req.body) ? req.body : {};
            const tipo = String(body.tipo || "ticket");
            const comandaId = cleanInt(body.comanda_id);
            const impresionId = cleanInt(body.impresion_id);
            const printerName = String(body.printer_name || "").trim();
            const paperWidthMm = clampInt(body.paper_width_mm, 58, 48, 120);
            const charsPerLine = clampInt(body.chars_per_line, 32, 20, 80);
            const fontSizePt = clampFloat(body.font_size_pt, 9, 6, 16);
            const text = String(body.texto || "").trim();

            if (!text) {
                jsonResponse(res, 422, { ok: false, error: "Texto de impresion vacio." });
                return;
            }

            const filename = buildFilename(tipo, comandaId, impresionId);
            const filePath = path.join(JOBS_DIR, filename);
            fs.writeFileSync(filePath, `${text}\n`, "utf8");

            const printStatus = await printTextFile(filePath, printerName, {
                paperWidthMm,
                charsPerLine,
                fontSizePt
            });

            if (!printStatus.ok) {
                jsonResponse(res, 500, {
                    ok: false,
                    error: printStatus.error,
                    printer: printStatus.printer || "",
                    paperWidthMm,
                    charsPerLine,
                    fontSizePt,
                    file: filename
                });
                return;
            }

            jsonResponse(res, 200, {
                ok: true,
                message: "Ticket enviado a impresora local.",
                printer: printStatus.printer || "",
                paperWidthMm,
                charsPerLine,
                fontSizePt,
                mode: printStatus.mode || "custom",
                warning: printStatus.warning || "",
                file: filename
            });
        } catch (error) {
            jsonResponse(res, 500, {
                ok: false,
                error: error.message || "Fallo inesperado en impresion."
            });
        }
    });

    app.use((req, res) => {
        jsonResponse(res, 404, { ok: false, error: "Ruta no encontrada." });
    });

    return app;
}

async function handleApiGet(req, res, action) {
    switch (action) {
    case "session": {
        const user = await authCurrentUser(req, res);
        jsonResponse(res, 200, {
            ok: true,
            logged: user !== null,
            user,
            redirect_to: user ? authHomeForRole(String(user.rol || "")) : "login.html"
        });
        return;
    }
    case "admin_session": {
        const user = await authCurrentUser(req, res);
        const isAdmin = !!(user && String(user.rol) === "admin");
        jsonResponse(res, 200, {
            ok: true,
            logged: isAdmin,
            user: isAdmin ? user : null
        });
        return;
    }
    case "admin_bootstrap": {
        const user = await requireAdmin(req, res);
        const data = await getAdminBootstrap(user);
        jsonResponse(res, 200, { ok: true, data });
        return;
    }
    case "menu": {
        const user = await requireOperationRoles(req, res);
        const menu = await getMenu(user);
        jsonResponse(res, 200, { ok: true, menu });
        return;
    }
    case "menu_diario": {
        const user = await requireOperationRoles(req, res);
        const role = String(user.rol || "").toLowerCase().trim();
        let data;
        if (role === "mesero") {
            data = await getEffectiveDailyMenuForMesero();
        } else {
            const fecha = sanitizeDateKey(String((req.query && req.query.fecha) || ""), todayKey());
            data = await getDailyMenuPayload(fecha);
        }
        jsonResponse(res, 200, { ok: true, data });
        return;
    }
    case "ventas_historial": {
        await requireSalesHistoryRoles(req, res);
        const desde = String((req.query && req.query.desde) || todayKey()).trim();
        const hasta = String((req.query && req.query.hasta) || desde).trim();
        const data = await getSalesHistoryPayload(desde, hasta);
        jsonResponse(res, 200, { ok: true, data });
        return;
    }
    case "mesas": {
        await requireOperationRoles(req, res);
        const mesas = await getMesasState();
        jsonResponse(res, 200, { ok: true, mesas });
        return;
    }
    case "cuentas_abiertas": {
        await requireCashierRoles(req, res);
        const cuentas = await getOpenAccountsDetail();
        jsonResponse(res, 200, { ok: true, cuentas });
        return;
    }
    case "caja_estado_actual": {
        await requireCashierRoles(req, res);
        const data = await getCashStatusPayload();
        jsonResponse(res, 200, { ok: true, data });
        return;
    }
    case "user_preferences": {
        const user = await requireOperationRoles(req, res);
        const data = await getUserPreferences(cleanInt(user.id));
        jsonResponse(res, 200, { ok: true, data });
        return;
    }
    case "comanda": {
        await requireOperationRoles(req, res);
        const mesaNumero = cleanInt((req.query && req.query.mesa) || 0);
        if (mesaNumero <= 0) {
            throwHttp(422, "Mesa invalida.");
        }
        const data = await getComandaSnapshot(mesaNumero);
        jsonResponse(res, 200, { ok: true, data });
        return;
    }
    case "config_cobro": {
        await requireOperationRoles(req, res);
        const data = await getChargeConfigPayload();
        jsonResponse(res, 200, { ok: true, data });
        return;
    }
    default:
        throwHttp(404, "Accion GET no encontrada.");
    }
}

async function handleApiPost(req, res, action) {
    const body = isObject(req.body) ? req.body : {};

    switch (action) {
    case "login":
        await processLogin(req, res, body);
        return;
    case "logout":
        await processLogout(req, res);
        return;
    case "admin_login":
        await processAdminLogin(req, res, body);
        return;
    case "admin_logout":
        await processLogout(req, res);
        return;
    case "admin_save_settings":
        await requireAdmin(req, res);
        await processAdminSaveSettings(body);
        jsonResponse(res, 200, {
            ok: true,
            mensaje: "Configuracion general actualizada.",
            settings: await getAdminSettingsPayload()
        });
        return;
    case "admin_save_printers":
        await requireAdmin(req, res);
        await processAdminSavePrinters(body);
        jsonResponse(res, 200, {
            ok: true,
            mensaje: "Impresoras actualizadas.",
            settings: await getAdminSettingsPayload(),
            printers: await fetchAvailablePrinters()
        });
        return;
    case "admin_set_tables":
        await requireAdmin(req, res);
        await processAdminSetTables(body);
        jsonResponse(res, 200, {
            ok: true,
            mensaje: `Cantidad de mesas activa: ${cleanInt(body.cantidad)}.`,
            mesas_cantidad: cleanInt(body.cantidad)
        });
        return;
    case "admin_product_save":
        await requireAdmin(req, res);
        await processAdminProductSave(body);
        jsonResponse(res, 200, {
            ok: true,
            mensaje: "Producto guardado.",
            productos: await getProductsAdmin()
        });
        return;
    case "admin_product_toggle":
        await requireAdmin(req, res);
        await processAdminProductToggle(body);
        jsonResponse(res, 200, {
            ok: true,
            mensaje: "Estado del producto actualizado.",
            productos: await getProductsAdmin()
        });
        return;
    case "admin_user_save":
        await requireAdmin(req, res);
        await processAdminUserSave(body);
        jsonResponse(res, 200, {
            ok: true,
            mensaje: "Usuario guardado.",
            usuarios: await getUsersAdmin()
        });
        return;
    case "admin_user_toggle":
        await requireAdmin(req, res);
        await processAdminUserToggle(req, res, body);
        return;
    case "caja_abrir":
        await requireCashierRoles(req, res);
        await processOpenCashSession(req, res, body);
        return;
    case "caja_cerrar":
        await requireCashierRoles(req, res);
        await processCloseCashSession(req, res, body);
        return;
    case "user_preferences_save":
        await requireOperationRoles(req, res);
        await processSaveUserPreferences(req, res, body);
        return;
    case "menu_diario_confirmar":
        await requireCashierRoles(req, res);
        await processConfirmDailyMenu(req, res, body);
        return;
    case "send_order":
        await requireOperationRoles(req, res);
        requiredFields(body, ["mesa_numero", "items"]);
        await processSendOrder(req, res, body);
        return;
    case "charge_table":
        await requireOperationRoles(req, res);
        requiredFields(body, ["mesa_numero"]);
        await processChargeTable(req, res, body);
        return;
    case "print_bill":
        await requireOperationRoles(req, res);
        requiredFields(body, ["mesa_numero"]);
        await processPrintBill(req, res, body);
        return;
    default:
        throwHttp(404, "Accion POST no encontrada.");
    }
}

function handleApiError(res, error) {
    if (error instanceof HttpError) {
        jsonResponse(res, error.status, error.payload);
        return;
    }
    jsonResponse(res, 500, {
        ok: false,
        error: "Error interno del servidor.",
        detalle: error && error.message ? error.message : "Error desconocido."
    });
}

async function processLogin(req, res, body) {
    requiredFields(body, ["usuario", "password"]);
    const usuario = String(body.usuario || "").trim();
    const password = String(body.password || "");
    if (!usuario || !password) {
        throwHttp(422, "Usuario y password son obligatorios.");
    }

    const user = await authAttemptLogin(usuario, password);
    if (!user) {
        throwHttp(401, "Credenciales invalidas o usuario desactivado.");
    }

    setUserSession(res, cleanInt(user.id));
    jsonResponse(res, 200, {
        ok: true,
        mensaje: "Sesion iniciada.",
        user,
        redirect_to: authHomeForRole(String(user.rol || ""))
    });
}

async function processAdminLogin(req, res, body) {
    requiredFields(body, ["usuario", "password"]);
    const usuario = String(body.usuario || "").trim();
    const password = String(body.password || "");
    const user = await authAttemptLogin(usuario, password);

    if (!user) {
        throwHttp(401, "Credenciales invalidas.");
    }
    if (String(user.rol) !== "admin") {
        throwHttp(403, "Este usuario no tiene permisos de administracion.");
    }

    setUserSession(res, cleanInt(user.id));
    jsonResponse(res, 200, {
        ok: true,
        mensaje: "Sesion iniciada.",
        user
    });
}

async function processLogout(req, res) {
    clearUserSession(req, res);
    jsonResponse(res, 200, { ok: true, mensaje: "Sesion cerrada." });
}

async function processAdminSaveSettings(body) {
    const nombreLocal = String(body.nombre_local || (await getSetting("nombre_local", "Donde Abel"))).trim() || "Donde Abel";
    const moneda = String(body.moneda_simbolo || (await getSetting("moneda_simbolo", "$"))).trim() || "$";
    const imprimirPedidos = cleanInt(body.imprimir_pedidos, 1) === 1 ? "1" : "0";
    const alertaSonidoActivo = cleanInt(body.alerta_sonido_activo, cleanInt(await getSetting("alerta_sonido_activo", "1"), 1)) === 1 ? "1" : "0";
    const alertaTonoComanda = normalizeAlertTone(String(body.alerta_tono_comanda || await getAlertToneSetting()));
    const propinaHabilitada = cleanInt(body.propina_habilitada, cleanInt(await getSetting("propina_habilitada", "1"), 1)) === 1 ? "1" : "0";

    await setSetting("nombre_local", nombreLocal);
    await setSetting("moneda_simbolo", moneda);
    await setSetting("imprimir_pedidos", imprimirPedidos);
    await setSetting("alerta_sonido_activo", alertaSonidoActivo);
    await setSetting("alerta_tono_comanda", alertaTonoComanda);
    await setSetting("propina_habilitada", propinaHabilitada);
    await setSetting("propina_porcentaje", await getSetting("propina_porcentaje", "10"));
}

async function processAdminSavePrinters(body) {
    let modo = String(body.impresora_modo || "una").trim();
    if (!["una", "dos"].includes(modo)) {
        modo = "una";
    }

    let ticketPapelMm = cleanInt(body.ticket_papel_mm, await ticketPaperWidthMm());
    let ticketAnchoChars = cleanInt(body.ticket_ancho_chars, await ticketCharsWidth());
    let ticketFuentePt = cleanFloat(body.ticket_fuente_pt, await ticketFontSizePt());

    if (ticketPapelMm < 48 || ticketPapelMm > 120) {
        ticketPapelMm = 58;
    }
    if (ticketAnchoChars < 20 || ticketAnchoChars > 80) {
        ticketAnchoChars = ticketPapelMm <= 60 ? 32 : 42;
    }
    if (ticketFuentePt < 6 || ticketFuentePt > 16) {
        ticketFuentePt = 9;
    }

    await setSetting("impresora_modo", modo);
    await setSetting("impresora_cocina", String(body.impresora_cocina || "").trim());
    await setSetting("impresora_caja", String(body.impresora_caja || "").trim());
    await setSetting("ticket_papel_mm", String(ticketPapelMm));
    await setSetting("ticket_ancho_chars", String(ticketAnchoChars));
    await setSetting("ticket_fuente_pt", trimNumberString(ticketFuentePt, 2));
}

async function processAdminSetTables(body) {
    requiredFields(body, ["cantidad"]);
    const cantidad = cleanInt(body.cantidad);
    if (cantidad < 1 || cantidad > 200) {
        throwHttp(422, "La cantidad de mesas debe estar entre 1 y 200.");
    }
    await ensureMesasToLimit(cantidad);
    await setSetting("mesas_cantidad", String(cantidad));
}

async function ensureMesasToLimit(cantidad) {
    const maxRow = await one("SELECT COALESCE(MAX(numero), 0) AS max_numero FROM mesas");
    const maxNumero = cleanInt(maxRow ? maxRow.max_numero : 0);
    const rows = await all("SELECT numero FROM mesas");
    const existing = new Set(rows.map((row) => cleanInt(row.numero)));

    if (cantidad < maxNumero) {
        const lockRows = await all(
            `SELECT
                m.numero,
                m.estado,
                (
                    SELECT COUNT(*)
                    FROM comandas c
                    WHERE c.mesa_id = m.id AND c.estado = ?
                ) AS abiertas
             FROM mesas m
             WHERE m.numero > ?
             ORDER BY m.numero ASC`,
            ["abierta", cantidad]
        );

        for (const row of lockRows) {
            if (cleanInt(row.abiertas) > 0 || String(row.estado || "") === "ocupada") {
                throwHttp(422, "No se puede reducir mesas porque hay comandas activas en mesas superiores al nuevo limite.");
            }
        }
    }

    for (let mesa = 1; mesa <= cantidad; mesa += 1) {
        if (existing.has(mesa)) {
            continue;
        }
        await run("INSERT INTO mesas (numero, estado, actualizada_en) VALUES (?, ?, ?)", [mesa, "libre", nowTs()]);
    }
}

async function processAdminProductSave(body) {
    const id = cleanInt(body.id);
    const nombre = String(body.nombre || "").trim();
    const categoria = normalizeProductCategoryLabel(String(body.categoria || "Platos"));
    const precio = cleanFloat(body.precio);
    const activo = cleanInt(body.activo, 1) === 1 ? 1 : 0;

    if (!nombre) {
        throwHttp(422, "El nombre del producto es obligatorio.");
    }
    if (precio <= 0) {
        throwHttp(422, "El precio debe ser mayor a 0.");
    }

    if (id > 0) {
        await run(
            "UPDATE productos SET nombre = ?, categoria = ?, precio = ?, activo = ? WHERE id = ?",
            [nombre, categoria, precio, activo, id]
        );
    } else {
        await run(
            "INSERT INTO productos (nombre, categoria, precio, activo) VALUES (?, ?, ?, ?)",
            [nombre, categoria, precio, activo]
        );
    }

}

async function processAdminProductToggle(body) {
    requiredFields(body, ["id", "activo"]);
    const id = cleanInt(body.id);
    const activo = cleanInt(body.activo) === 1 ? 1 : 0;
    if (id <= 0) {
        throwHttp(422, "Producto invalido.");
    }
    await run("UPDATE productos SET activo = ? WHERE id = ?", [activo, id]);
}

async function processAdminUserSave(body) {
    const id = cleanInt(body.id);
    const nombre = String(body.nombre || "").trim();
    const usuario = String(body.usuario || "").trim();
    let rol = normalizeRole(String(body.rol || "mesero").trim());
    const password = String(body.password || "");
    const activo = cleanInt(body.activo, 1) === 1 ? 1 : 0;

    if (!nombre || !usuario) {
        throwHttp(422, "Nombre y usuario son obligatorios.");
    }
    if (!["admin", "mesero", "caja", "cocina"].includes(rol)) {
        throwHttp(422, "Rol de usuario invalido.");
    }

    try {
        if (id > 0) {
            const params = [nombre, usuario, rol, activo, nowTs(), id];
            let sql = "UPDATE usuarios SET nombre = ?, usuario = ?, rol = ?, activo = ?, actualizado_en = ?";
            if (password.trim()) {
                if (password.length < 4) {
                    throwHttp(422, "El password debe tener al menos 4 caracteres.");
                }
                const hash = await bcrypt.hash(password, 10);
                sql += ", password_hash = ?";
                params.splice(5, 0, hash);
            }
            sql += " WHERE id = ?";
            await run(sql, params);
        } else {
            if (password.length < 4) {
                throwHttp(422, "Para crear usuario debes indicar password de al menos 4 caracteres.");
            }
            const hash = await bcrypt.hash(password, 10);
            const now = nowTs();
            await run(
                `INSERT INTO usuarios (nombre, usuario, rol, password_hash, activo, creado_en, actualizado_en)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [nombre, usuario, rol, hash, activo, now, now]
            );
        }
    } catch (error) {
        if (error instanceof HttpError) {
            throw error;
        }
        throwHttp(422, "No se pudo guardar el usuario (revisa si el nombre de usuario ya existe).", {
            detalle: error && error.message ? error.message : ""
        });
    }
}

async function processAdminUserToggle(req, res, body) {
    requiredFields(body, ["id", "activo"]);
    const id = cleanInt(body.id);
    const activo = cleanInt(body.activo) === 1 ? 1 : 0;
    if (id <= 0) {
        throwHttp(422, "Usuario invalido.");
    }
    const current = await authCurrentUser(req, res);
    if (current && cleanInt(current.id) === id && activo === 0) {
        throwHttp(422, "No puedes desactivar tu propio usuario activo.");
    }
    await run("UPDATE usuarios SET activo = ?, actualizado_en = ? WHERE id = ?", [activo, nowTs(), id]);
    jsonResponse(res, 200, {
        ok: true,
        mensaje: "Estado del usuario actualizado.",
        usuarios: await getUsersAdmin()
    });
}

async function processSaveUserPreferences(req, res, body) {
    const user = await requireOperationRoles(req, res);
    const userId = cleanInt(user.id);
    if (userId <= 0) {
        throwHttp(422, "Usuario no valido.");
    }
    const alertsEnabled = cleanInt(body.alertas_nuevas_comandas, 1) === 1 ? 1 : 0;
    await run(
        `UPDATE usuarios
         SET alertas_nuevas_comandas = ?, actualizado_en = ?
         WHERE id = ?`,
        [alertsEnabled, nowTs(), userId]
    );
    jsonResponse(res, 200, {
        ok: true,
        mensaje: "Preferencias de usuario actualizadas.",
        data: await getUserPreferences(userId)
    });
}

async function processConfirmDailyMenu(req, res, body) {
    const user = await requireCashierRoles(req, res);
    const fecha = sanitizeDateKey(String(body.fecha || ""), todayKey());
    const productosBody = Array.isArray(body.productos) ? body.productos : null;
    if (!productosBody) {
        throwHttp(422, "Debes enviar el listado de productos para confirmar el menu diario.");
    }

    const activeProductIds = await getActiveProductIds();
    if (activeProductIds.size === 0) {
        throwHttp(422, "No hay productos activos para confirmar en el menu diario.");
    }

    const enabledMap = new Map();
    for (const row of productosBody) {
        if (!isObject(row)) {
            continue;
        }
        const productId = cleanInt(row.id);
        if (productId <= 0 || !activeProductIds.has(productId)) {
            continue;
        }
        enabledMap.set(productId, cleanInt(row.habilitado) === 1 ? 1 : 0);
    }

    for (const productId of activeProductIds) {
        if (!enabledMap.has(productId)) {
            enabledMap.set(productId, 0);
        }
    }

    let enabledCount = 0;
    for (const enabled of enabledMap.values()) {
        if (enabled === 1) {
            enabledCount += 1;
        }
    }
    if (enabledCount <= 0) {
        throwHttp(422, "Debes habilitar al menos un producto para el menu del dia.");
    }

    const userId = cleanInt(user.id);
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        for (const [productId, enabled] of enabledMap.entries()) {
            await conn.execute(
                `INSERT INTO menu_diario_items (fecha, producto_id, habilitado, confirmado_por, confirmado_en)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    habilitado = VALUES(habilitado),
                    confirmado_por = VALUES(confirmado_por),
                    confirmado_en = VALUES(confirmado_en)`,
                [fecha, productId, enabled, userId > 0 ? userId : null, nowTs()]
            );
        }

        await conn.execute(
            `INSERT INTO menu_diario_confirmaciones (fecha, confirmado_por, confirmado_en)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE
                confirmado_por = VALUES(confirmado_por),
                confirmado_en = VALUES(confirmado_en)`,
            [fecha, userId > 0 ? userId : null, nowTs()]
        );

        await conn.commit();
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }

    jsonResponse(res, 200, {
        ok: true,
        mensaje: "Menu diario confirmado.",
        data: await getDailyMenuPayload(fecha)
    });
}

async function processOpenCashSession(req, res, body) {
    const user = await requireCashierRoles(req, res);
    const role = String(user.rol || "");
    if (!["caja", "cajero", "admin"].includes(role)) {
        throwHttp(403, "Solo caja/admin puede abrir caja.");
    }

    const montoInicial = cleanFloat(body.monto_inicial);
    if (montoInicial < 0) {
        throwHttp(422, "El monto inicial no puede ser negativo.");
    }

    const open = await getOpenCashSession();
    if (open) {
        throwHttp(422, "Ya existe una caja abierta. Debes cerrarla antes de abrir otra.", {
            data: await getCashStatusPayload()
        });
    }

    await run(
        `INSERT INTO caja_sesiones (usuario_id, abierta_en, cerrada_en, monto_inicial, monto_final_declarado, estado, notas)
         VALUES (?, ?, NULL, ?, NULL, ?, ?)`,
        [cleanInt(user.id), nowTs(), montoInicial, "abierta", ""]
    );

    jsonResponse(res, 200, {
        ok: true,
        mensaje: "Caja abierta correctamente.",
        data: await getCashStatusPayload()
    });
}

async function processCloseCashSession(req, res, body) {
    const user = await requireCashierRoles(req, res);
    const open = await getOpenCashSession();
    if (!open) {
        throwHttp(422, "No hay una caja abierta para cerrar.");
    }

    const userId = cleanInt(user.id);
    const role = String(user.rol || "");
    const sessionUserId = cleanInt(open.usuario_id);
    if (role !== "admin" && sessionUserId !== userId) {
        throwHttp(403, "Solo la cajera que abrio la caja (o admin) puede cerrarla.");
    }

    const montoFinal = cleanFloat(body.monto_final_declarado, -1);
    if (montoFinal < 0) {
        throwHttp(422, "Debes indicar el monto final contado para cerrar caja.");
    }

    await run(
        `UPDATE caja_sesiones
         SET cerrada_en = ?, monto_final_declarado = ?, estado = ?, notas = ?
         WHERE id = ?`,
        [nowTs(), montoFinal, "cerrada", String(body.notas || "").trim(), cleanInt(open.id)]
    );

    const closed = await getCashSessionById(cleanInt(open.id));
    const summary = closed ? await getCashSessionSummary(cleanInt(closed.id)) : defaultCashSummary(0);
    const difference = montoFinal - cleanFloat(summary.efectivo_esperado);

    jsonResponse(res, 200, {
        ok: true,
        mensaje: "Caja cerrada correctamente.",
        cierre: {
            sesion: closed,
            resumen: summary,
            diferencia: difference
        },
        data: await getCashStatusPayload()
    });
}

async function processSendOrder(req, res, body) {
    const mesaNumero = cleanInt(body.mesa_numero);
    const itemsBody = Array.isArray(body.items) ? body.items : [];
    const origen = String(body.origen || "movil").trim();
    const currentUser = await authCurrentUser(req, res);
    const currentUserId = currentUser ? cleanInt(currentUser.id) : 0;
    const currentRole = currentUser ? String(currentUser.rol || "").toLowerCase().trim() : "";
    const enforceDailyMenu = currentRole === "mesero";

    if (mesaNumero <= 0) {
        throwHttp(422, "Mesa invalida.");
    }
    if (itemsBody.length === 0) {
        throwHttp(422, "Debes incluir al menos un item.");
    }

    const mesa = await getMesaByNumber(mesaNumero);
    if (!mesa) {
        throwHttp(404, "Mesa no encontrada.");
    }

    const items = await normalizeItems(itemsBody, enforceDailyMenu);
    if (items.length === 0) {
        if (enforceDailyMenu) {
            const dailyMenu = await getEffectiveDailyMenuForMesero();
            if (cleanInt(dailyMenu.confirmado) !== 1) {
                throwHttp(422, "No hay menu confirmado para hoy ni para el dia anterior.");
            }
            const menuFecha = String(dailyMenu.menu_origen_fecha || "");
            const menuLabel = menuFecha ? ` (menu vigente: ${menuFecha})` : "";
            throwHttp(422, `Los productos seleccionados no estan habilitados en el menu vigente.${menuLabel}`);
        }
        throwHttp(422, "No hay items validos para agregar.");
    }

    let comandaId = 0;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const comanda = await getOrCreateOpenComandaDb(conn, cleanInt(mesa.id), currentUserId);
        comandaId = cleanInt(comanda.id);

        for (const item of items) {
            await conn.execute(
                `INSERT INTO comanda_items
                 (comanda_id, producto_id, descripcion, cantidad, precio_unitario, subtotal, notas, creado_en)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    comandaId,
                    item.producto_id,
                    item.descripcion,
                    item.cantidad,
                    item.precio_unitario,
                    item.subtotal,
                    item.notas,
                    nowTs()
                ]
            );
        }

        const totalComanda = await recalcTotalDb(conn, comandaId);
        await conn.execute(
            "UPDATE comandas SET total = ?, actualizada_en = ? WHERE id = ?",
            [totalComanda, nowTs(), comandaId]
        );
        await conn.execute(
            "UPDATE mesas SET estado = ?, actualizada_en = ? WHERE id = ?",
            ["ocupada", nowTs(), cleanInt(mesa.id)]
        );

        await conn.commit();
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }

    const localName = await getSetting("nombre_local", "Donde Abel");
    const ticketWidth = await ticketCharsWidth();
    const printGroups = splitOrderItemsForPrint(items);
    const printResults = {};

    if (printGroups.cocina.length > 0) {
        const ticketCocina = buildOrderTicket(localName, ticketWidth, mesaNumero, comandaId, printGroups.cocina, origen, "COCINA");
        printResults.cocina = await registerPrintAttempt(comandaId, "pedido_cocina", ticketCocina);
    }
    if (printGroups.caja.length > 0) {
        const ticketBebestibles = buildOrderTicket(localName, ticketWidth, mesaNumero, comandaId, printGroups.caja, origen, "BEBESTIBLES");
        printResults.bebestibles = await registerPrintAttempt(comandaId, "pedido_bebestibles", ticketBebestibles);
    }

    const print = summarizeOrderPrints(printResults);
    jsonResponse(res, 200, {
        ok: true,
        mensaje: "Pedido enviado correctamente.",
        impresion: print,
        impresiones: printResults,
        data: await getComandaSnapshot(mesaNumero)
    });
}

async function processChargeTable(req, res, body) {
    const currentUser = await authCurrentUser(req, res);
    const currentRole = currentUser ? String(currentUser.rol || "") : "";
    const currentUserId = currentUser ? cleanInt(currentUser.id) : 0;
    const openCash = await getOpenCashSession();
    if (["caja", "cajero"].includes(currentRole) && !openCash) {
        throwHttp(422, "Debes abrir caja antes de cobrar mesas.");
    }

    const mesaNumero = cleanInt(body.mesa_numero);
    let metodoInput = String(body.metodo || "efectivo").trim();
    if (!metodoInput) {
        metodoInput = "efectivo";
    }
    const metodoNormalizado = normalizePaymentMethod(metodoInput);
    const paymentsBody = Array.isArray(body.pagos) ? body.pagos : [];
    let metodoTicket = metodoNormalizado;
    const tipEnabled = await isTipEnabled();
    const tipPercent = await tipSuggestedPercent();
    let tipAmount = cleanFloat(body.propina);
    if (!tipEnabled || tipAmount < 0) {
        tipAmount = 0;
    }
    tipAmount = round2(tipAmount);

    if (mesaNumero <= 0) {
        throwHttp(422, "Mesa invalida.");
    }
    const mesa = await getMesaByNumber(mesaNumero);
    if (!mesa) {
        throwHttp(404, "Mesa no encontrada.");
    }

    const comanda = await getOpenComanda(cleanInt(mesa.id));
    if (!comanda) {
        throwHttp(422, "La mesa no tiene comanda abierta.");
    }

    const comandaId = cleanInt(comanda.id);
    let meseroId = cleanInt(comanda.mesero_id);
    if (meseroId <= 0 && currentUserId > 0 && ["mesero", "admin"].includes(String(currentRole).toLowerCase())) {
        meseroId = currentUserId;
    }

    const items = await getComandaItems(comandaId);
    const total = await recalcTotal(comandaId);
    if (total <= 0) {
        throwHttp(422, "La comanda no tiene items para cobrar.");
    }

    const isMixedRequest = paymentsBody.length > 0 || ["mixto", "mixta"].includes(String(metodoInput).toLowerCase());
    let paymentRows;
    if (isMixedRequest) {
        paymentRows = sanitizePaymentBreakdown(paymentsBody);
        if (paymentRows.length === 0) {
            throwHttp(422, "Debes ingresar al menos un monto en pago mixto.");
        }
        const paidTotal = paymentBreakdownTotal(paymentRows);
        if (Math.abs(paidTotal - total) > 0.01) {
            throwHttp(422, "La suma de pagos no coincide con el total de la comanda.");
        }
        metodoTicket = "mixto";
    } else {
        paymentRows = [{ metodo: metodoNormalizado, monto: total }];
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        for (const payment of paymentRows) {
            await conn.execute(
                `INSERT INTO pagos (comanda_id, metodo, monto, creado_en, usuario_id, caja_sesion_id)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    comandaId,
                    payment.metodo,
                    cleanFloat(payment.monto),
                    nowTs(),
                    currentUserId > 0 ? currentUserId : null,
                    openCash ? cleanInt(openCash.id) : null
                ]
            );
        }

        await conn.execute(
            `UPDATE comandas
             SET estado = ?,
                 total = ?,
                 propina_monto = ?,
                 propina_porcentaje = ?,
                 mesero_id = COALESCE(mesero_id, ?),
                 actualizada_en = ?,
                 cerrada_en = ?
             WHERE id = ?`,
            [
                "cerrada",
                total,
                tipAmount,
                tipPercent,
                meseroId > 0 ? meseroId : null,
                nowTs(),
                nowTs(),
                comandaId
            ]
        );

        await conn.execute(
            "UPDATE mesas SET estado = ?, actualizada_en = ? WHERE id = ?",
            ["libre", nowTs(), cleanInt(mesa.id)]
        );

        await conn.commit();
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }

    const localName = await getSetting("nombre_local", "Donde Abel");
    const ticketWidth = await ticketCharsWidth();
    const ticket = buildFinalTicket(localName, ticketWidth, mesaNumero, comandaId, items, total, metodoTicket, paymentRows, tipAmount);
    const print = await registerPrintAttempt(comandaId, "ticket", ticket);

    jsonResponse(res, 200, {
        ok: true,
        mensaje: "Mesa cobrada y cerrada.",
        total,
        propina: tipAmount,
        metodo: metodoTicket,
        pagos: paymentRows,
        impresion: print
    });
}

async function processPrintBill(req, res, body) {
    const mesaNumero = cleanInt(body.mesa_numero);
    if (mesaNumero <= 0) {
        throwHttp(422, "Mesa invalida.");
    }
    const mesa = await getMesaByNumber(mesaNumero);
    if (!mesa) {
        throwHttp(404, "Mesa no encontrada.");
    }
    const comanda = await getOpenComanda(cleanInt(mesa.id));
    if (!comanda) {
        throwHttp(422, "No existe comanda abierta para esta mesa.");
    }

    const comandaId = cleanInt(comanda.id);
    const items = await getComandaItems(comandaId);
    const total = await recalcTotal(comandaId);
    const localName = await getSetting("nombre_local", "Donde Abel");
    const ticketWidth = await ticketCharsWidth();
    const tipEnabled = await isTipEnabled();
    const tipPercent = await tipSuggestedPercent();
    const precuenta = buildPrebillTicket(localName, ticketWidth, mesaNumero, comandaId, items, total, tipEnabled, tipPercent);
    const print = await registerPrintAttempt(comandaId, "precuenta", precuenta);

    jsonResponse(res, 200, {
        ok: true,
        mensaje: "Precuenta enviada a impresion.",
        impresion: print
    });
}

async function requireAdmin(req, res) {
    const user = await authCurrentUser(req, res);
    if (!user || String(user.rol || "") !== "admin") {
        throwHttp(401, "Sesion admin requerida.");
    }
    return user;
}

async function requireOperationRoles(req, res) {
    const user = await authCurrentUser(req, res);
    if (!user) {
        throwHttp(401, "Debes iniciar sesion.");
    }
    const allowed = ["mesero", "caja", "cajero", "admin"];
    if (!allowed.includes(String(user.rol || ""))) {
        throwHttp(403, "Tu rol no tiene permisos para esta accion.");
    }
    return user;
}

async function requireCashierRoles(req, res) {
    const user = await authCurrentUser(req, res);
    if (!user) {
        throwHttp(401, "Debes iniciar sesion.");
    }
    const allowed = ["caja", "cajero", "admin"];
    if (!allowed.includes(String(user.rol || ""))) {
        throwHttp(403, "Tu rol no tiene permisos para ver cuentas.");
    }
    return user;
}

async function requireSalesHistoryRoles(req, res) {
    const user = await authCurrentUser(req, res);
    if (!user) {
        throwHttp(401, "Debes iniciar sesion.");
    }
    const allowed = ["mesero", "caja", "cajero", "admin"];
    if (!allowed.includes(String(user.rol || ""))) {
        throwHttp(403, "Tu rol no tiene permisos para ver el desglose de ventas.");
    }
    return user;
}

async function authFindUserByUsername(usuario) {
    return one(
        `SELECT id, nombre, usuario, rol, activo, password_hash
         FROM usuarios
         WHERE usuario = ?
         LIMIT 1`,
        [usuario]
    );
}

async function authFindUserById(id) {
    return one(
        `SELECT id, nombre, usuario, rol, activo, password_hash
         FROM usuarios
         WHERE id = ?
         LIMIT 1`,
        [id]
    );
}

function authUserPublic(user) {
    return {
        id: cleanInt(user.id),
        nombre: String(user.nombre || ""),
        usuario: String(user.usuario || ""),
        rol: normalizeRole(String(user.rol || ""))
    };
}

function authHomeForRole(rol) {
    const normalized = normalizeRole(rol);
    if (normalized === "mesero") {
        return "mesero.html";
    }
    if (["admin", "caja", "cocina"].includes(normalized)) {
        return "servidor.html";
    }
    return "servidor.html";
}

async function authAttemptLogin(usuario, password) {
    const user = await authFindUserByUsername(usuario);
    if (!user || cleanInt(user.activo) !== 1) {
        return null;
    }
    const hash = String(user.password_hash || "");
    if (!hash) {
        return null;
    }
    const ok = await bcrypt.compare(password, hash);
    if (!ok) {
        return null;
    }
    return authUserPublic(user);
}

async function authCurrentUser(req, res) {
    if (req._authResolved) {
        return req._authUser;
    }

    const session = getSessionFromRequest(req);
    if (!session) {
        req._authResolved = true;
        req._authUser = null;
        return null;
    }

    const user = await authFindUserById(cleanInt(session.userId));
    if (!user || cleanInt(user.activo) !== 1) {
        sessions.delete(session.sid);
        clearSessionCookie(res);
        req._authResolved = true;
        req._authUser = null;
        return null;
    }

    touchSession(session.sid);
    req._authResolved = true;
    req._authUser = authUserPublic(user);
    return req._authUser;
}

function setUserSession(res, userId) {
    const sid = createSession(userId);
    setSessionCookie(res, sid);
}

function clearUserSession(req, res) {
    const sid = getSessionIdFromRequest(req);
    if (sid) {
        sessions.delete(sid);
    }
    clearSessionCookie(res);
}

function createSession(userId) {
    cleanupExpiredSessions();
    const sid = crypto.randomBytes(24).toString("hex");
    sessions.set(sid, {
        userId: cleanInt(userId),
        expiresAt: Date.now() + (SESSION_TTL_SECONDS * 1000)
    });
    return sid;
}

function touchSession(sid) {
    const session = sessions.get(sid);
    if (!session) {
        return;
    }
    session.expiresAt = Date.now() + (SESSION_TTL_SECONDS * 1000);
}

function cleanupExpiredSessions() {
    const now = Date.now();
    for (const [sid, session] of sessions.entries()) {
        if (!session || cleanInt(session.expiresAt) <= now) {
            sessions.delete(sid);
        }
    }
}

function getSessionFromRequest(req) {
    const sid = getSessionIdFromRequest(req);
    if (!sid) {
        return null;
    }
    const session = sessions.get(sid);
    if (!session) {
        return null;
    }
    if (cleanInt(session.expiresAt) <= Date.now()) {
        sessions.delete(sid);
        return null;
    }
    return { sid, userId: session.userId };
}

function getSessionIdFromRequest(req) {
    const cookies = parseCookieHeader(req.headers ? req.headers.cookie : "");
    return String(cookies[SESSION_COOKIE_NAME] || "");
}

function setSessionCookie(res, sid) {
    appendSetCookie(
        res,
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`
    );
}

function clearSessionCookie(res) {
    appendSetCookie(
        res,
        `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    );
}

function appendSetCookie(res, value) {
    if (!res || !value) {
        return;
    }
    const current = res.getHeader("Set-Cookie");
    if (!current) {
        res.setHeader("Set-Cookie", value);
        return;
    }
    if (Array.isArray(current)) {
        res.setHeader("Set-Cookie", [...current, value]);
        return;
    }
    res.setHeader("Set-Cookie", [current, value]);
}

function parseCookieHeader(headerValue) {
    const result = {};
    const raw = String(headerValue || "");
    if (!raw) {
        return result;
    }
    const parts = raw.split(";");
    for (const part of parts) {
        const [key, ...rest] = part.split("=");
        if (!key || rest.length === 0) {
            continue;
        }
        const name = key.trim();
        const value = rest.join("=").trim();
        if (!name) {
            continue;
        }
        result[name] = decodeURIComponentSafe(value);
    }
    return result;
}

async function getAdminBootstrap(user = null) {
    return {
        user,
        settings: await getAdminSettingsPayload(),
        productos: await getProductsAdmin(),
        usuarios: await getUsersAdmin(),
        printers: await fetchAvailablePrinters(),
        mesas_estado: await getMesasState()
    };
}

async function getAdminSettingsPayload() {
    return {
        nombre_local: await getSetting("nombre_local", "Donde Abel"),
        moneda_simbolo: await getSetting("moneda_simbolo", "$"),
        imprimir_pedidos: await getSetting("imprimir_pedidos", "1"),
        alerta_sonido_activo: await getSetting("alerta_sonido_activo", "1"),
        alerta_tono_comanda: await getAlertToneSetting(),
        propina_habilitada: await getSetting("propina_habilitada", "1"),
        propina_porcentaje: await tipSuggestedPercent(),
        impresora_modo: await getSetting("impresora_modo", "una"),
        impresora_cocina: await getSetting("impresora_cocina", ""),
        impresora_caja: await getSetting("impresora_caja", ""),
        ticket_papel_mm: await ticketPaperWidthMm(),
        ticket_ancho_chars: await ticketCharsWidth(),
        ticket_fuente_pt: await ticketFontSizePt(),
        mesas_cantidad: await configuredTableCount()
    };
}

async function getProductsAdmin() {
    const rows = await all(
        `SELECT id, nombre, categoria, precio, activo
         FROM productos
         ORDER BY categoria ASC, nombre ASC`
    );
    return rows.map((row) => ({
        id: cleanInt(row.id),
        nombre: String(row.nombre || ""),
        categoria: normalizeProductCategoryLabel(String(row.categoria || "")),
        precio: cleanFloat(row.precio),
        activo: cleanInt(row.activo) === 1 ? 1 : 0
    }));
}

async function getUsersAdmin() {
    const rows = await all(
        `SELECT id, nombre, usuario, rol, activo, creado_en, actualizado_en
         FROM usuarios
         ORDER BY id ASC`
    );
    return rows.map((row) => ({
        id: cleanInt(row.id),
        nombre: String(row.nombre || ""),
        usuario: String(row.usuario || ""),
        rol: normalizeRole(String(row.rol || "")),
        activo: cleanInt(row.activo) === 1 ? 1 : 0,
        creado_en: String(row.creado_en || ""),
        actualizado_en: String(row.actualizado_en || "")
    }));
}

async function getMenu(user) {
    const role = String((user && user.rol) || "").toLowerCase().trim();
    if (role === "mesero") {
        const dailyMenu = await getEffectiveDailyMenuForMesero();
        return isObject(dailyMenu.menu) ? dailyMenu.menu : {};
    }
    const products = await fetchActiveProducts();
    return groupProductsForMenu(products);
}

async function fetchActiveProducts() {
    const rows = await all(
        `SELECT id, nombre, categoria, precio
         FROM productos
         WHERE activo = 1
         ORDER BY categoria ASC, nombre ASC`
    );
    return rows.map((row) => ({
        id: cleanInt(row.id),
        nombre: String(row.nombre || ""),
        categoria: normalizeProductCategoryLabel(String(row.categoria || "Platos")),
        precio: cleanFloat(row.precio)
    }));
}

function groupProductsForMenu(products) {
    const grouped = {};
    for (const product of products) {
        let category = String(product.categoria || "General").trim();
        if (!category) {
            category = "General";
        }
        if (!grouped[category]) {
            grouped[category] = [];
        }
        grouped[category].push({
            id: cleanInt(product.id),
            nombre: String(product.nombre || ""),
            precio: cleanFloat(product.precio),
            categoria: category
        });
    }
    return grouped;
}

async function getDailyMenuPayload(fechaInput) {
    const dateKey = sanitizeDateKey(String(fechaInput || ""), todayKey());
    const confirmation = await getDailyMenuConfirmation(dateKey);
    const enabledMap = await getDailyMenuEnabledMap(dateKey);
    const confirmed = cleanInt(confirmation.confirmado) === 1;
    const products = await fetchActiveProducts();
    const list = [];
    const enabledOnly = [];

    for (const product of products) {
        const productId = cleanInt(product.id);
        if (productId <= 0) {
            continue;
        }
        let enabled;
        if (enabledMap.has(productId)) {
            enabled = cleanInt(enabledMap.get(productId), confirmed ? 0 : 1) === 1;
        } else {
            enabled = !confirmed;
        }
        const item = {
            id: productId,
            nombre: String(product.nombre || ""),
            categoria: String(product.categoria || "General"),
            precio: cleanFloat(product.precio),
            habilitado: enabled ? 1 : 0
        };
        list.push(item);
        if (enabled) {
            enabledOnly.push(item);
        }
    }

    return {
        fecha: dateKey,
        confirmado: confirmed ? 1 : 0,
        confirmacion: confirmation,
        productos: list,
        menu: groupProductsForMenu(enabledOnly)
    };
}

async function getDailyMenuConfirmation(fecha) {
    const row = await one(
        `SELECT c.fecha, c.confirmado_en, c.confirmado_por,
                u.nombre AS confirmado_por_nombre, u.usuario AS confirmado_por_usuario
         FROM menu_diario_confirmaciones c
         LEFT JOIN usuarios u ON u.id = c.confirmado_por
         WHERE c.fecha = ?
         LIMIT 1`,
        [fecha]
    );
    if (!row) {
        return {
            fecha,
            confirmado: 0,
            confirmado_en: "",
            confirmado_por: 0,
            confirmado_por_nombre: "",
            confirmado_por_usuario: ""
        };
    }
    return {
        fecha: String(row.fecha || fecha),
        confirmado: 1,
        confirmado_en: String(row.confirmado_en || ""),
        confirmado_por: cleanInt(row.confirmado_por),
        confirmado_por_nombre: String(row.confirmado_por_nombre || ""),
        confirmado_por_usuario: String(row.confirmado_por_usuario || "")
    };
}

async function getDailyMenuEnabledMap(fecha) {
    const rows = await all(
        `SELECT producto_id, habilitado
         FROM menu_diario_items
         WHERE fecha = ?`,
        [fecha]
    );
    const map = new Map();
    for (const row of rows) {
        const productId = cleanInt(row.producto_id);
        if (productId <= 0) {
            continue;
        }
        map.set(productId, cleanInt(row.habilitado) === 1 ? 1 : 0);
    }
    return map;
}

async function getEffectiveDailyMenuForMesero() {
    const today = todayKey();
    const todayPayload = await getDailyMenuPayload(today);
    if (cleanInt(todayPayload.confirmado) === 1) {
        todayPayload.menu_origen_fecha = today;
        todayPayload.menu_origen_tipo = "hoy";
        return todayPayload;
    }
    const yesterday = dateKeyOffset(today, -1);
    const yesterdayPayload = await getDailyMenuPayload(yesterday);
    if (cleanInt(yesterdayPayload.confirmado) === 1) {
        yesterdayPayload.menu_origen_fecha = yesterday;
        yesterdayPayload.menu_origen_tipo = "anterior";
        return yesterdayPayload;
    }
    todayPayload.menu_origen_fecha = today;
    todayPayload.menu_origen_tipo = "sin_confirmar";
    return todayPayload;
}

async function getActiveProductIds() {
    const rows = await all("SELECT id FROM productos WHERE activo = 1");
    const ids = new Set();
    for (const row of rows) {
        const id = cleanInt(row.id);
        if (id > 0) {
            ids.add(id);
        }
    }
    return ids;
}

async function getMesasState() {
    const tableLimit = await configuredTableCount();
    const rows = await all(
        `SELECT
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
         WHERE m.numero <= ?
         ORDER BY m.numero ASC`,
        [tableLimit]
    );

    return rows.map((row) => ({
        id: cleanInt(row.id),
        numero: cleanInt(row.numero),
        estado: String(row.estado || ""),
        actualizada_en: String(row.actualizada_en || ""),
        comanda_id: row.comanda_id === null ? null : cleanInt(row.comanda_id),
        comanda_total: row.comanda_total === null ? 0 : cleanFloat(row.comanda_total),
        comanda_actualizada_en: row.comanda_actualizada_en,
        total_items: cleanInt(row.total_items)
    }));
}

async function getOpenAccountsDetail() {
    const mesas = await getMesasState();
    const accounts = {};
    const comandaIds = [];

    for (const mesa of mesas) {
        const comandaId = mesa.comanda_id;
        if (comandaId === null) {
            continue;
        }
        const id = cleanInt(comandaId);
        if (id <= 0) {
            continue;
        }
        accounts[id] = {
            mesa_numero: cleanInt(mesa.numero),
            comanda_id: id,
            total: cleanFloat(mesa.comanda_total),
            total_items: cleanInt(mesa.total_items),
            actualizada_en: String(mesa.comanda_actualizada_en || ""),
            items: []
        };
        comandaIds.push(id);
    }

    if (comandaIds.length === 0) {
        return [];
    }

    const placeholders = comandaIds.map(() => "?").join(",");
    const rows = await all(
        `SELECT comanda_id, id, descripcion, cantidad, subtotal, notas
         FROM comanda_items
         WHERE comanda_id IN (${placeholders})
         ORDER BY comanda_id ASC, id ASC`,
        comandaIds
    );

    for (const row of rows) {
        const comandaId = cleanInt(row.comanda_id);
        if (!accounts[comandaId]) {
            continue;
        }
        accounts[comandaId].items.push({
            id: cleanInt(row.id),
            descripcion: String(row.descripcion || ""),
            cantidad: cleanInt(row.cantidad),
            subtotal: cleanFloat(row.subtotal),
            notas: String(row.notas || "")
        });
    }

    const list = Object.values(accounts);
    list.sort((a, b) => cleanInt(a.mesa_numero) - cleanInt(b.mesa_numero));
    return list;
}

async function getSalesHistoryPayload(desdeRaw, hastaRaw) {
    const bounds = normalizePeriodBounds(desdeRaw, hastaRaw);
    const desde = bounds.desde;
    const hasta = bounds.hasta;

    const rows = await all(
        `SELECT c.id, c.mesa_id, c.total, c.propina_monto, c.creada_en, c.cerrada_en,
                c.mesero_id, u.nombre AS mesero_nombre, u.usuario AS mesero_usuario,
                m.numero AS mesa_numero
         FROM comandas c
         LEFT JOIN mesas m ON m.id = c.mesa_id
         LEFT JOIN usuarios u ON u.id = c.mesero_id
         WHERE c.estado = ?
           AND c.cerrada_en IS NOT NULL
           AND DATE(c.cerrada_en) BETWEEN ? AND ?
         ORDER BY c.cerrada_en DESC, c.id DESC`,
        ["cerrada", desde, hasta]
    );

    const sales = {};
    const salesIds = [];

    for (const row of rows) {
        const saleId = cleanInt(row.id);
        if (saleId <= 0) {
            continue;
        }
        sales[saleId] = {
            comanda_id: saleId,
            mesa_numero: cleanInt(row.mesa_numero),
            total: cleanFloat(row.total),
            propina: cleanFloat(row.propina_monto),
            mesero_id: cleanInt(row.mesero_id),
            mesero_nombre: String(row.mesero_nombre || "").trim(),
            mesero_usuario: String(row.mesero_usuario || "").trim(),
            creada_en: String(row.creada_en || ""),
            cerrada_en: String(row.cerrada_en || ""),
            pagos: [],
            total_pagado: 0,
            diferencia_pago: 0,
            metodos: []
        };
        salesIds.push(saleId);
    }

    const summary = defaultCashSummary(0);
    summary.total_pagado = 0;
    summary.diferencia_total = 0;
    summary.propinas_total = 0;
    summary.propinas_cantidad = 0;
    summary.propinas_por_mesero = [];

    if (salesIds.length === 0) {
        return {
            periodo: { desde, hasta },
            resumen: summary,
            ventas: []
        };
    }

    const placeholders = salesIds.map(() => "?").join(",");
    const paymentRows = await all(
        `SELECT id, comanda_id, metodo, monto, creado_en
         FROM pagos
         WHERE comanda_id IN (${placeholders})
         ORDER BY comanda_id ASC, id ASC`,
        salesIds
    );

    const tipsByWaiter = {};
    for (const row of paymentRows) {
        const saleId = cleanInt(row.comanda_id);
        if (!sales[saleId]) {
            continue;
        }
        const amount = cleanFloat(row.monto);
        if (amount <= 0) {
            continue;
        }
        const methodKey = normalizePaymentMethod(String(row.metodo || ""));
        const methodLabel = paymentMethodLabel(methodKey);
        sales[saleId].pagos.push({
            id: cleanInt(row.id),
            metodo: methodKey,
            metodo_label: methodLabel,
            monto: amount,
            creado_en: String(row.creado_en || "")
        });
        sales[saleId].total_pagado = cleanFloat(sales[saleId].total_pagado + amount);
        if (!sales[saleId].metodos.includes(methodLabel)) {
            sales[saleId].metodos.push(methodLabel);
        }

        if (methodKey === "efectivo") {
            summary.efectivo_total += amount;
            summary.efectivo_cantidad += 1;
        } else if (methodKey === "tarjeta") {
            summary.tarjeta_total += amount;
            summary.tarjeta_cantidad += 1;
        } else if (methodKey === "transferencia") {
            summary.transferencia_total += amount;
            summary.transferencia_cantidad += 1;
        } else {
            summary.otros_total += amount;
            summary.otros_cantidad += 1;
        }
    }

    for (const sale of Object.values(sales)) {
        summary.ventas_total += cleanFloat(sale.total);
        summary.ventas_cantidad += 1;
        summary.total_pagado += cleanFloat(sale.total_pagado);
        const tipAmount = cleanFloat(sale.propina);
        summary.propinas_total += tipAmount;
        if (tipAmount > 0) {
            summary.propinas_cantidad += 1;
        }

        const meseroId = cleanInt(sale.mesero_id);
        let meseroNombre = String(sale.mesero_nombre || "").trim();
        const meseroUsuario = String(sale.mesero_usuario || "").trim();
        const meseroKey = meseroId > 0 ? `id:${meseroId}` : "sin_mesero";
        if (!meseroNombre) {
            meseroNombre = meseroId > 0 ? `Mesero #${meseroId}` : "Sin mesero asignado";
        }
        if (!tipsByWaiter[meseroKey]) {
            tipsByWaiter[meseroKey] = {
                mesero_id: meseroId,
                mesero_nombre: meseroNombre,
                mesero_usuario: meseroUsuario,
                propina_total: 0,
                ventas_cantidad: 0,
                ventas_con_propina: 0
            };
        }
        tipsByWaiter[meseroKey].propina_total += tipAmount;
        tipsByWaiter[meseroKey].ventas_cantidad += 1;
        if (tipAmount > 0) {
            tipsByWaiter[meseroKey].ventas_con_propina += 1;
        }

        sale.diferencia_pago = cleanFloat(cleanFloat(sale.total_pagado) - cleanFloat(sale.total));
        if (sale.metodos.length === 0) {
            sale.metodos.push("Sin registro");
        }
    }

    summary.ventas_total = cleanFloat(summary.ventas_total);
    summary.total_pagado = cleanFloat(summary.total_pagado);
    summary.diferencia_total = cleanFloat(summary.total_pagado - summary.ventas_total);
    summary.efectivo_esperado = cleanFloat(summary.efectivo_total);
    summary.propinas_total = cleanFloat(summary.propinas_total);

    const tipsByWaiterList = Object.values(tipsByWaiter);
    tipsByWaiterList.sort((a, b) => {
        const byTip = cleanFloat(b.propina_total) - cleanFloat(a.propina_total);
        if (byTip !== 0) {
            return byTip;
        }
        return String(a.mesero_nombre || "").localeCompare(String(b.mesero_nombre || ""));
    });
    summary.propinas_por_mesero = tipsByWaiterList.map((row) => ({
        mesero_id: cleanInt(row.mesero_id),
        mesero_nombre: String(row.mesero_nombre || ""),
        mesero_usuario: String(row.mesero_usuario || ""),
        propina_total: cleanFloat(row.propina_total),
        ventas_cantidad: cleanInt(row.ventas_cantidad),
        ventas_con_propina: cleanInt(row.ventas_con_propina)
    }));

    return {
        periodo: { desde, hasta },
        resumen: summary,
        ventas: Object.values(sales)
    };
}

async function getComandaSnapshot(mesaNumero) {
    const mesa = await getMesaByNumber(mesaNumero);
    if (!mesa) {
        throwHttp(404, "Mesa no encontrada.");
    }
    const comanda = await getOpenComanda(cleanInt(mesa.id));
    if (!comanda) {
        return {
            mesa: {
                id: cleanInt(mesa.id),
                numero: cleanInt(mesa.numero),
                estado: String(mesa.estado || "")
            },
            comanda: null,
            items: []
        };
    }

    const items = await getComandaItems(cleanInt(comanda.id));
    const total = await recalcTotal(cleanInt(comanda.id));
    return {
        mesa: {
            id: cleanInt(mesa.id),
            numero: cleanInt(mesa.numero),
            estado: String(mesa.estado || "")
        },
        comanda: {
            id: cleanInt(comanda.id),
            estado: String(comanda.estado || ""),
            total,
            creada_en: String(comanda.creada_en || ""),
            actualizada_en: String(comanda.actualizada_en || "")
        },
        items
    };
}

async function getMesaByNumber(mesaNumero) {
    if (mesaNumero <= 0 || mesaNumero > (await configuredTableCount())) {
        return null;
    }
    return one(
        "SELECT id, numero, estado, actualizada_en FROM mesas WHERE numero = ? LIMIT 1",
        [mesaNumero]
    );
}

async function getOpenComanda(mesaId) {
    return one(
        `SELECT id, mesa_id, estado, total, mesero_id, creada_en, actualizada_en
         FROM comandas
         WHERE mesa_id = ? AND estado = ?
         ORDER BY id DESC
         LIMIT 1`,
        [mesaId, "abierta"]
    );
}

async function getOrCreateOpenComandaDb(db, mesaId, meseroId = 0) {
    let comanda = await oneDb(
        db,
        `SELECT id, mesa_id, estado, total, mesero_id, creada_en, actualizada_en
         FROM comandas
         WHERE mesa_id = ? AND estado = ?
         ORDER BY id DESC
         LIMIT 1`,
        [mesaId, "abierta"]
    );
    if (comanda) {
        if (meseroId > 0 && cleanInt(comanda.mesero_id) <= 0) {
            await runDb(
                db,
                "UPDATE comandas SET mesero_id = ?, actualizada_en = ? WHERE id = ?",
                [meseroId, nowTs(), cleanInt(comanda.id)]
            );
            comanda.mesero_id = meseroId;
            comanda.actualizada_en = nowTs();
        }
        return comanda;
    }

    const result = await runDb(
        db,
        `INSERT INTO comandas (mesa_id, estado, total, mesero_id, creada_en, actualizada_en)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [mesaId, "abierta", 0, meseroId > 0 ? meseroId : null, nowTs(), nowTs()]
    );
    const newId = cleanInt(result.insertId);
    comanda = await oneDb(
        db,
        `SELECT id, mesa_id, estado, total, mesero_id, creada_en, actualizada_en
         FROM comandas
         WHERE id = ?
         LIMIT 1`,
        [newId]
    );
    return comanda;
}

async function normalizeItems(itemsBody, enforceDailyMenu = false) {
    const cleanItems = [];
    const dailyEnabledMap = new Map();

    if (enforceDailyMenu) {
        const dailyPayload = await getEffectiveDailyMenuForMesero();
        if (cleanInt(dailyPayload.confirmado) !== 1) {
            return [];
        }
        const products = Array.isArray(dailyPayload.productos) ? dailyPayload.productos : [];
        for (const product of products) {
            const productId = cleanInt(product.id);
            if (productId <= 0) {
                continue;
            }
            dailyEnabledMap.set(productId, cleanInt(product.habilitado) === 1 ? 1 : 0);
        }
    }

    for (const rawItem of itemsBody) {
        if (!isObject(rawItem)) {
            continue;
        }
        const cantidad = cleanInt(rawItem.cantidad);
        if (cantidad <= 0) {
            continue;
        }
        const productoId = cleanInt(rawItem.producto_id);
        const notas = String(rawItem.notas || "").trim();

        if (productoId > 0) {
            if (enforceDailyMenu) {
                const isEnabled = dailyEnabledMap.has(productoId) && dailyEnabledMap.get(productoId) === 1;
                if (!isEnabled) {
                    continue;
                }
            }
            const producto = await getProducto(productoId);
            if (!producto) {
                continue;
            }
            const precio = cleanFloat(producto.precio);
            cleanItems.push({
                producto_id: productoId,
                descripcion: String(producto.nombre || ""),
                cantidad,
                precio_unitario: precio,
                subtotal: round2(precio * cantidad),
                categoria: normalizeProductCategoryLabel(String(producto.categoria || "Platos")),
                notas
            });
            continue;
        }

        if (enforceDailyMenu) {
            continue;
        }

        const descripcion = String(rawItem.descripcion || "").trim();
        const precioManual = cleanFloat(rawItem.precio);
        if (!descripcion || precioManual <= 0) {
            continue;
        }
        const categoriaManual = normalizeProductCategoryLabel(String(rawItem.categoria || "Platos"));
        cleanItems.push({
            producto_id: null,
            descripcion,
            cantidad,
            precio_unitario: precioManual,
            subtotal: round2(precioManual * cantidad),
            categoria: categoriaManual,
            notas
        });
    }

    return cleanItems;
}

function splitOrderItemsForPrint(items) {
    const groups = { cocina: [], caja: [] };
    for (const item of items) {
        const categoria = String(item.categoria || "");
        if (isBeverageCategory(categoria)) {
            groups.caja.push(item);
            continue;
        }
        groups.cocina.push(item);
    }
    return groups;
}

function isBeverageCategory(categoria) {
    const token = normalizeCategoryToken(categoria);
    if (!token) {
        return false;
    }
    if (token.includes("bebest") || token.includes("bebid")) {
        return true;
    }
    const aliases = ["jugo", "jugos", "refresco", "refrescos", "gaseosa", "gaseosas", "trago", "tragos"];
    return aliases.includes(token);
}

async function getProducto(productoId) {
    return one(
        `SELECT id, nombre, categoria, precio
         FROM productos
         WHERE id = ? AND activo = 1
         LIMIT 1`,
        [productoId]
    );
}

async function getComandaItems(comandaId) {
    const rows = await all(
        `SELECT id, comanda_id, producto_id, descripcion, cantidad, precio_unitario, subtotal, notas, creado_en
         FROM comanda_items
         WHERE comanda_id = ?
         ORDER BY id ASC`,
        [comandaId]
    );
    return rows.map((row) => ({
        id: cleanInt(row.id),
        comanda_id: cleanInt(row.comanda_id),
        producto_id: row.producto_id === null ? null : cleanInt(row.producto_id),
        descripcion: String(row.descripcion || ""),
        cantidad: cleanInt(row.cantidad),
        precio_unitario: cleanFloat(row.precio_unitario),
        subtotal: cleanFloat(row.subtotal),
        notas: String(row.notas || ""),
        creado_en: String(row.creado_en || "")
    }));
}

async function recalcTotal(comandaId) {
    return recalcTotalDb(pool, comandaId);
}

async function recalcTotalDb(db, comandaId) {
    const row = await oneDb(
        db,
        "SELECT COALESCE(SUM(subtotal), 0) AS total FROM comanda_items WHERE comanda_id = ?",
        [comandaId]
    );
    return cleanFloat(row ? row.total : 0);
}

async function registerPrintAttempt(comandaId, tipo, contenido) {
    const printOrders = (await getSetting("imprimir_pedidos", "1")) === "1";
    if (["pedido", "pedido_cocina", "pedido_bebestibles"].includes(tipo) && !printOrders) {
        return {
            ok: true,
            estado: "omitida",
            detalle: "Impresion de pedidos desactivada en configuracion.",
            impresion_id: null
        };
    }

    const insert = await run(
        `INSERT INTO impresiones (comanda_id, tipo, estado, detalle, creada_en)
         VALUES (?, ?, ?, ?, ?)`,
        [comandaId, tipo, "pendiente", "Pendiente de envio al servicio local.", nowTs()]
    );
    const impresionId = cleanInt(insert.insertId);
    const printerName = await resolvePrinterNameForTipo(tipo);
    const paperWidthMm = await ticketPaperWidthMm();
    const charsWidth = await ticketCharsWidth();
    const fontSizePt = await ticketFontSizePt();

    const response = await sendPrintJob({
        tipo,
        comanda_id: comandaId,
        impresion_id: impresionId,
        printer_name: printerName,
        paper_width_mm: paperWidthMm,
        chars_per_line: charsWidth,
        font_size_pt: fontSizePt,
        texto: contenido
    });

    const estado = response.ok ? "enviada" : "fallida";
    let detalle = String(response.detalle || "");
    if (response.warning) {
        detalle += ` | Aviso: ${String(response.warning).trim()}`;
    }
    if (response.printer) {
        detalle += ` | Impresora: ${response.printer}`;
    }

    await run("UPDATE impresiones SET estado = ?, detalle = ? WHERE id = ?", [estado, detalle, impresionId]);

    return {
        ok: !!response.ok,
        estado,
        detalle,
        printer: response.printer || "",
        warning: response.warning || "",
        impresion_id: impresionId
    };
}

async function sendPrintJob(payload) {
    if (typeof fetch !== "function") {
        return {
            ok: false,
            detalle: "Runtime sin soporte fetch para imprimir.",
            printer: "",
            warning: ""
        };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
        const response = await fetch(PRINT_SERVICE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        const decoded = await response.json().catch(() => ({}));
        const printer = isObject(decoded) ? String(decoded.printer || "") : "";
        const warning = isObject(decoded) ? String(decoded.warning || "") : "";

        if (!response.ok) {
            const errorText = isObject(decoded) ? String(decoded.error || "") : "";
            return {
                ok: false,
                detalle: errorText || `Servicio de impresion respondio HTTP ${response.status}.`,
                printer,
                warning
            };
        }
        if (!isObject(decoded) || !decoded.ok) {
            return {
                ok: false,
                detalle: isObject(decoded) ? String(decoded.error || "Servicio de impresion rechazo el trabajo.") : "Respuesta invalida del servicio de impresion.",
                printer,
                warning
            };
        }
        return {
            ok: true,
            detalle: "Ticket enviado a la impresora local.",
            printer,
            warning
        };
    } catch (error) {
        return {
            ok: false,
            detalle: `No se pudo conectar al servicio de impresion: ${error.message || "timeout"}`,
            printer: "",
            warning: ""
        };
    } finally {
        clearTimeout(timeout);
    }
}

async function fetchAvailablePrinters() {
    const printersUrl = PRINT_SERVICE_URL.replace(/\/print$/, "") + "/printers";
    if (typeof fetch !== "function") {
        return {
            ok: false,
            error: "No hay cliente HTTP habilitado para consultar impresoras.",
            printers: [],
            defaultPrinter: ""
        };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
        const response = await fetch(printersUrl, {
            method: "GET",
            signal: controller.signal
        });
        const decoded = await response.json().catch(() => ({}));

        if (!response.ok) {
            return {
                ok: false,
                error: isObject(decoded) ? String(decoded.error || `Servicio de impresion respondio HTTP ${response.status}.`) : `Servicio de impresion respondio HTTP ${response.status}.`,
                printers: [],
                defaultPrinter: ""
            };
        }

        return {
            ok: !!(isObject(decoded) && decoded.ok),
            error: isObject(decoded) ? String(decoded.error || "") : "",
            printers: isObject(decoded) && Array.isArray(decoded.printers) ? decoded.printers : [],
            defaultPrinter: isObject(decoded) ? String(decoded.defaultPrinter || "") : ""
        };
    } catch (error) {
        return {
            ok: false,
            error: `No se pudo consultar impresoras: ${error.message || "error de red"}`,
            printers: [],
            defaultPrinter: ""
        };
    } finally {
        clearTimeout(timeout);
    }
}

function summarizeOrderPrints(printResults) {
    const keys = Object.keys(printResults || {});
    if (keys.length === 0) {
        return {
            ok: true,
            estado: "omitida",
            detalle: "No hubo items nuevos para imprimir.",
            warning: "",
            printer: "",
            impresion_id: null,
            impresion_ids: [],
            resultados: {}
        };
    }

    let ok = true;
    const detailParts = [];
    const warningParts = [];
    const printers = [];
    const ids = [];

    for (const key of keys) {
        const result = printResults[key] || {};
        const label = String(key).toUpperCase();
        const isOk = !!result.ok;
        if (!isOk) {
            ok = false;
        }
        const detalle = String(result.detalle || "").trim();
        if (detalle) {
            detailParts.push(`${label}: ${detalle}`);
        }
        const warning = String(result.warning || "").trim();
        if (warning) {
            warningParts.push(`${label}: ${warning}`);
        }
        const printer = String(result.printer || "").trim();
        if (printer) {
            printers.push(printer);
        }
        if (result.impresion_id !== null && result.impresion_id !== undefined) {
            const id = cleanInt(result.impresion_id);
            if (id > 0) {
                ids.push(id);
            }
        }
    }

    const uniqueIds = unique(ids);
    const uniquePrinters = unique(printers);
    return {
        ok,
        estado: ok ? "enviada" : "fallida",
        detalle: detailParts.length > 0 ? detailParts.join(" | ") : (ok ? "Impresion enviada." : "Fallo de impresion."),
        warning: warningParts.length > 0 ? warningParts.join(" | ") : "",
        printer: uniquePrinters.join(", "),
        impresion_id: uniqueIds.length > 0 ? uniqueIds[0] : null,
        impresion_ids: uniqueIds,
        resultados: printResults
    };
}

async function resolvePrinterNameForTipo(tipo) {
    const modo = await getSetting("impresora_modo", "una");
    const cocina = String(await getSetting("impresora_cocina", "")).trim();
    const caja = String(await getSetting("impresora_caja", "")).trim();
    const tiposCocina = ["pedido", "pedido_cocina"];
    if (modo === "dos") {
        if (tiposCocina.includes(tipo)) {
            return cocina || caja;
        }
        return caja || cocina;
    }
    if (caja) {
        return caja;
    }
    return cocina;
}

function buildOrderTicket(localName, charsWidth, mesaNumero, comandaId, items, origen, area) {
    const lines = [];
    lines.push(centerText(localName || "Donde Abel", charsWidth));
    lines.push(centerText(`PEDIDO ${area}`, charsWidth));
    lines.push(repeat("-", charsWidth));
    lines.push(`Mesa: ${mesaNumero}`);
    lines.push(`Comanda: ${comandaId}`);
    lines.push(`Origen: ${String(origen || "movil").toUpperCase()}`);
    lines.push(`Hora: ${nowTsWithTz()}`);
    lines.push(repeat("-", charsWidth));
    for (const item of items) {
        const qty = cleanInt(item.cantidad);
        const desc = String(item.descripcion || "");
        const subtotal = cleanFloat(item.subtotal);
        lines.push(`${qty}x ${desc}`);
        lines.push(`   Subtotal: ${moneyText(subtotal)}`);
        const notas = String(item.notas || "").trim();
        if (notas) {
            lines.push(`   Nota: ${notas}`);
        }
    }
    lines.push(repeat("-", charsWidth));
    lines.push(centerText("FIN PEDIDO", charsWidth));
    return lines.join("\n");
}

function buildPrebillTicket(localName, charsWidth, mesaNumero, comandaId, items, total, tipEnabled, tipPercent) {
    const lines = [];
    lines.push(centerText(localName || "Donde Abel", charsWidth));
    lines.push(centerText("PRECUENTA", charsWidth));
    lines.push(repeat("-", charsWidth));
    lines.push(`Mesa: ${mesaNumero}`);
    lines.push(`Comanda: ${comandaId}`);
    lines.push(`Hora: ${nowTsWithTz()}`);
    lines.push(repeat("-", charsWidth));
    for (const item of items) {
        const qty = cleanInt(item.cantidad);
        const desc = String(item.descripcion || "");
        const subtotal = cleanFloat(item.subtotal);
        lines.push(`${qty}x ${desc}`);
        lines.push(`   ${moneyText(subtotal)}`);
    }
    lines.push(repeat("-", charsWidth));
    lines.push(`TOTAL: ${moneyText(total)}`);
    if (tipEnabled) {
        const sugerida = tipAmountForTotal(total, tipPercent);
        lines.push(`Propina sugerida (${tipPercent}%): ${moneyText(sugerida)}`);
    }
    lines.push(repeat("-", charsWidth));
    lines.push(centerText("GRACIAS", charsWidth));
    return lines.join("\n");
}

function buildFinalTicket(localName, charsWidth, mesaNumero, comandaId, items, total, metodoTicket, paymentRows, tipAmount) {
    const lines = [];
    lines.push(centerText(localName || "Donde Abel", charsWidth));
    lines.push(centerText("BOLETA / TICKET", charsWidth));
    lines.push(repeat("-", charsWidth));
    lines.push(`Mesa: ${mesaNumero}`);
    lines.push(`Comanda: ${comandaId}`);
    lines.push(`Hora: ${nowTsWithTz()}`);
    lines.push(repeat("-", charsWidth));
    for (const item of items) {
        const qty = cleanInt(item.cantidad);
        const desc = String(item.descripcion || "");
        const subtotal = cleanFloat(item.subtotal);
        lines.push(`${qty}x ${desc}`);
        lines.push(`   ${moneyText(subtotal)}`);
    }
    lines.push(repeat("-", charsWidth));
    lines.push(`Subtotal: ${moneyText(total)}`);
    if (tipAmount > 0) {
        lines.push(`Propina: ${moneyText(tipAmount)}`);
        lines.push(`Total c/propina: ${moneyText(total + tipAmount)}`);
    } else {
        lines.push(`Total: ${moneyText(total)}`);
    }
    lines.push(`Metodo: ${paymentMethodLabel(metodoTicket)}`);
    if (Array.isArray(paymentRows) && paymentRows.length > 1) {
        lines.push("Desglose pagos:");
        for (const pay of paymentRows) {
            lines.push(` - ${paymentMethodLabel(String(pay.metodo || ""))}: ${moneyText(cleanFloat(pay.monto))}`);
        }
    }
    lines.push(repeat("-", charsWidth));
    lines.push(centerText("GRACIAS POR SU VISITA", charsWidth));
    return lines.join("\n");
}

async function getChargeConfigPayload() {
    return {
        propina_habilitada: await isTipEnabled(),
        propina_porcentaje: await tipSuggestedPercent()
    };
}

async function isTipEnabled() {
    return (await getSetting("propina_habilitada", "1")) === "1";
}

async function tipSuggestedPercent() {
    let value = cleanFloat(await getSetting("propina_porcentaje", "10"), 10);
    if (value < 0) {
        value = 0;
    }
    if (value > 100) {
        value = 100;
    }
    return round2(value);
}

function tipAmountForTotal(total, percent) {
    if (total <= 0 || percent <= 0) {
        return 0;
    }
    return round2((total * percent) / 100);
}

async function getCashStatusPayload() {
    const open = await getOpenCashSession();
    if (!open) {
        return {
            abierta: false,
            sesion: null,
            resumen: defaultCashSummary(0)
        };
    }
    return {
        abierta: true,
        sesion: open,
        resumen: await getCashSessionSummary(cleanInt(open.id))
    };
}

function defaultCashSummary(montoInicial) {
    return {
        monto_inicial: cleanFloat(montoInicial),
        ventas_total: 0,
        ventas_cantidad: 0,
        efectivo_total: 0,
        efectivo_cantidad: 0,
        tarjeta_total: 0,
        tarjeta_cantidad: 0,
        transferencia_total: 0,
        transferencia_cantidad: 0,
        otros_total: 0,
        otros_cantidad: 0,
        efectivo_esperado: cleanFloat(montoInicial)
    };
}

async function getCashSessionSummary(sessionId) {
    const session = await getCashSessionById(sessionId);
    const montoInicial = session ? cleanFloat(session.monto_inicial) : 0;
    const summary = defaultCashSummary(montoInicial);
    const rows = await all(
        `SELECT comanda_id, metodo, monto
         FROM pagos
         WHERE caja_sesion_id = ?`,
        [sessionId]
    );

    const salesKeys = new Set();
    let fallbackSaleIndex = 0;
    for (const row of rows) {
        const amount = cleanFloat(row.monto);
        if (amount <= 0) {
            continue;
        }
        const comandaId = cleanInt(row.comanda_id);
        if (comandaId > 0) {
            salesKeys.add(`c_${comandaId}`);
        } else {
            fallbackSaleIndex += 1;
            salesKeys.add(`p_${fallbackSaleIndex}`);
        }
        const method = normalizePaymentMethod(String(row.metodo || ""));
        summary.ventas_total += amount;
        if (method === "efectivo") {
            summary.efectivo_total += amount;
            summary.efectivo_cantidad += 1;
        } else if (method === "tarjeta") {
            summary.tarjeta_total += amount;
            summary.tarjeta_cantidad += 1;
        } else if (method === "transferencia") {
            summary.transferencia_total += amount;
            summary.transferencia_cantidad += 1;
        } else {
            summary.otros_total += amount;
            summary.otros_cantidad += 1;
        }
    }

    summary.ventas_total = cleanFloat(summary.ventas_total);
    summary.ventas_cantidad = salesKeys.size;
    summary.efectivo_total = cleanFloat(summary.efectivo_total);
    summary.tarjeta_total = cleanFloat(summary.tarjeta_total);
    summary.transferencia_total = cleanFloat(summary.transferencia_total);
    summary.otros_total = cleanFloat(summary.otros_total);
    summary.efectivo_esperado = cleanFloat(summary.monto_inicial + summary.efectivo_total);
    return summary;
}

async function getOpenCashSession() {
    const row = await one(
        `SELECT cs.id, cs.usuario_id, cs.abierta_en, cs.cerrada_en, cs.monto_inicial, cs.monto_final_declarado, cs.estado, cs.notas,
                u.nombre AS usuario_nombre, u.usuario AS usuario_login
         FROM caja_sesiones cs
         LEFT JOIN usuarios u ON u.id = cs.usuario_id
         WHERE cs.estado = ?
         ORDER BY cs.id DESC
         LIMIT 1`,
        ["abierta"]
    );
    if (!row) {
        return null;
    }
    return mapCashSessionRow(row);
}

async function getCashSessionById(sessionId) {
    const row = await one(
        `SELECT cs.id, cs.usuario_id, cs.abierta_en, cs.cerrada_en, cs.monto_inicial, cs.monto_final_declarado, cs.estado, cs.notas,
                u.nombre AS usuario_nombre, u.usuario AS usuario_login
         FROM caja_sesiones cs
         LEFT JOIN usuarios u ON u.id = cs.usuario_id
         WHERE cs.id = ?
         LIMIT 1`,
        [sessionId]
    );
    if (!row) {
        return null;
    }
    return mapCashSessionRow(row);
}

function mapCashSessionRow(row) {
    return {
        id: cleanInt(row.id),
        usuario_id: cleanInt(row.usuario_id),
        usuario_nombre: String(row.usuario_nombre || ""),
        usuario_login: String(row.usuario_login || ""),
        abierta_en: String(row.abierta_en || ""),
        cerrada_en: String(row.cerrada_en || ""),
        monto_inicial: cleanFloat(row.monto_inicial),
        monto_final_declarado: cleanFloat(row.monto_final_declarado),
        estado: String(row.estado || ""),
        notas: String(row.notas || "")
    };
}

async function getSetting(clave, defaultValue = "") {
    const row = await one("SELECT valor FROM configuraciones WHERE clave = ? LIMIT 1", [clave]);
    if (!row || row.valor === null || row.valor === undefined) {
        return String(defaultValue);
    }
    return String(row.valor);
}

async function setSetting(clave, valor) {
    const row = await one("SELECT id FROM configuraciones WHERE clave = ? LIMIT 1", [clave]);
    if (!row) {
        await run(
            "INSERT INTO configuraciones (clave, valor, actualizada_en) VALUES (?, ?, ?)",
            [clave, String(valor), nowTs()]
        );
        return;
    }
    await run(
        "UPDATE configuraciones SET valor = ?, actualizada_en = ? WHERE clave = ?",
        [String(valor), nowTs(), clave]
    );
}

async function configuredTableCount() {
    const configured = cleanInt(await getSetting("mesas_cantidad", "20"));
    if (configured > 0) {
        return configured;
    }
    const row = await one("SELECT COUNT(*) AS total FROM mesas");
    return Math.max(1, cleanInt(row ? row.total : 1, 1));
}

async function getUserPreferences(userId) {
    const tone = await getAlertToneSetting();
    const soundEnabled = (await getSetting("alerta_sonido_activo", "1")) === "1";
    if (userId <= 0) {
        return {
            alertas_nuevas_comandas: true,
            alerta_sonido_activo: soundEnabled,
            alerta_tono_comanda: tone
        };
    }
    const row = await one("SELECT alertas_nuevas_comandas FROM usuarios WHERE id = ? LIMIT 1", [userId]);
    const enabled = !row || row.alertas_nuevas_comandas === null ? 1 : cleanInt(row.alertas_nuevas_comandas, 1);
    return {
        alertas_nuevas_comandas: enabled === 1,
        alerta_sonido_activo: soundEnabled,
        alerta_tono_comanda: tone
    };
}

function alertToneOptions() {
    return [
        "tono_1", "tono_2", "tono_3", "tono_4", "tono_5",
        "tono_6", "tono_7", "tono_8", "tono_9", "tono_10"
    ];
}

function normalizeAlertTone(tone) {
    const value = String(tone || "").toLowerCase().trim();
    return alertToneOptions().includes(value) ? value : "tono_1";
}

async function getAlertToneSetting() {
    return normalizeAlertTone(await getSetting("alerta_tono_comanda", "tono_1"));
}

async function ticketPaperWidthMm() {
    const mm = cleanInt(await getSetting("ticket_papel_mm", "58"));
    if (mm < 48 || mm > 120) {
        return 58;
    }
    return mm;
}

async function ticketCharsWidth() {
    const chars = cleanInt(await getSetting("ticket_ancho_chars", "32"));
    if (chars < 20 || chars > 80) {
        return (await ticketPaperWidthMm()) <= 60 ? 32 : 42;
    }
    return chars;
}

async function ticketFontSizePt() {
    const size = cleanFloat(await getSetting("ticket_fuente_pt", "9"));
    if (size < 6 || size > 16) {
        return 9;
    }
    return size;
}

function normalizePaymentMethod(method) {
    const value = String(method || "").toLowerCase().trim();
    if (!value) {
        return "otros";
    }
    if (value.includes("efect") || value === "cash") {
        return "efectivo";
    }
    if (value.includes("tarj") || ["card", "credito", "debito"].includes(value)) {
        return "tarjeta";
    }
    if (value.includes("transf") || value.includes("transfer") || value === "qr") {
        return "transferencia";
    }
    return "otros";
}

function sanitizePaymentBreakdown(paymentsBody) {
    const clean = [];
    for (const raw of paymentsBody) {
        if (!isObject(raw)) {
            continue;
        }
        const method = normalizePaymentMethod(raw.metodo);
        const amount = cleanFloat(raw.monto);
        if (amount <= 0) {
            continue;
        }
        clean.push({ metodo: method, monto: amount });
    }
    return clean;
}

function paymentBreakdownTotal(payments) {
    let sum = 0;
    for (const payment of payments) {
        sum += cleanFloat(payment.monto);
    }
    return cleanFloat(sum);
}

function paymentMethodLabel(method) {
    const normalized = normalizePaymentMethod(method);
    if (normalized === "efectivo") {
        return "Efectivo";
    }
    if (normalized === "tarjeta") {
        return "Tarjeta";
    }
    if (normalized === "transferencia") {
        return "Transferencia";
    }
    return "Otros";
}

function normalizeProductCategoryLabel(category) {
    const token = normalizeCategoryToken(category);
    if (!token) {
        return "Platos";
    }
    if (token.includes("beb") || ["jugo", "jugos", "refresco", "refrescos", "gaseosa", "gaseosas", "agua", "aguamineral"].includes(token)) {
        return "Bebidas";
    }
    if (token.includes("post") || token.includes("dulce") || token.includes("helad") || token.includes("torta")) {
        return "Postres";
    }
    if (token.includes("entrada")) {
        return "Entradas";
    }
    return "Platos";
}

function normalizeCategoryToken(value) {
    const text = String(value || "").toLowerCase().trim();
    if (!text) {
        return "";
    }
    const normalized = text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "");
    return normalized.trim();
}

function normalizeRole(role) {
    const value = String(role || "").trim().toLowerCase();
    if (value === "cajero") {
        return "caja";
    }
    return value;
}

function requiredFields(body, fields) {
    for (const field of fields) {
        if (!Object.prototype.hasOwnProperty.call(body, field)) {
            throwHttp(422, `Falta el campo obligatorio: ${field}.`);
        }
    }
}

function throwHttp(status, message, extra = {}) {
    throw new HttpError(status, message, extra);
}

class HttpError extends Error {
    constructor(status, message, extra = {}) {
        super(message);
        this.status = status;
        this.payload = {
            ok: false,
            error: message,
            ...extra
        };
    }
}

function apiCorsMiddleware(req, res, next) {
    const origin = req.headers && req.headers.origin ? String(req.headers.origin) : "";
    if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
    }
    next();
}

function printCorsMiddleware(req, res, next) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
    }
    next();
}

function jsonResponse(res, statusCode, payload) {
    res.status(statusCode).json(payload);
}

async function run(sql, params = []) {
    const [result] = await pool.execute(sql, params);
    return result;
}

async function all(sql, params = []) {
    const [rows] = await pool.execute(sql, params);
    return rows;
}

async function one(sql, params = []) {
    const rows = await all(sql, params);
    return rows.length > 0 ? rows[0] : null;
}

async function runDb(db, sql, params = []) {
    const [result] = await db.execute(sql, params);
    return result;
}

async function allDb(db, sql, params = []) {
    const [rows] = await db.execute(sql, params);
    return rows;
}

async function oneDb(db, sql, params = []) {
    const rows = await allDb(db, sql, params);
    return rows.length > 0 ? rows[0] : null;
}

function nowTs() {
    return formatLocalTimestamp(new Date());
}

function nowTsWithTz() {
    return `${nowTs()} ${getTimezoneAbbrev(new Date())}`;
}

function todayKey() {
    const parts = getLocalDateParts(new Date());
    return `${parts.year}-${parts.month}-${parts.day}`;
}

function sanitizeDateKey(value, fallback) {
    const trimmed = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return fallback;
    }
    const [y, m, d] = trimmed.split("-").map((n) => Number.parseInt(n, 10));
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (Number.isNaN(dt.getTime())) {
        return fallback;
    }
    if (dt.getUTCFullYear() !== y || (dt.getUTCMonth() + 1) !== m || dt.getUTCDate() !== d) {
        return fallback;
    }
    return trimmed;
}

function normalizePeriodBounds(desdeRaw, hastaRaw) {
    const today = todayKey();
    let desde = sanitizeDateKey(desdeRaw, today);
    let hasta = sanitizeDateKey(hastaRaw, desde);
    if (desde > hasta) {
        const tmp = desde;
        desde = hasta;
        hasta = tmp;
    }
    return { desde, hasta };
}

function dateKeyOffset(dateKey, offsetDays) {
    const dt = new Date(`${dateKey}T00:00:00`);
    dt.setDate(dt.getDate() + offsetDays);
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function cleanInt(value, defaultValue = 0) {
    if (Number.isInteger(value)) {
        return value;
    }
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) {
        return defaultValue;
    }
    return n;
}

function cleanFloat(value, defaultValue = 0) {
    const n = Number.parseFloat(value);
    if (!Number.isFinite(n)) {
        return defaultValue;
    }
    return n;
}

function round2(value) {
    return Math.round((cleanFloat(value) + Number.EPSILON) * 100) / 100;
}

function moneyText(value) {
    return `$${Math.round(cleanFloat(value)).toLocaleString("es-CL")}`;
}

function trimNumberString(value, decimals = 2) {
    const num = cleanFloat(value);
    return num.toFixed(decimals).replace(/\.?0+$/, "");
}

function repeat(char, count) {
    const total = Math.max(0, cleanInt(count));
    return String(char || "-").repeat(total);
}

function centerText(text, width) {
    const raw = String(text || "");
    const w = Math.max(raw.length, cleanInt(width, raw.length));
    const left = Math.max(0, Math.floor((w - raw.length) / 2));
    return `${" ".repeat(left)}${raw}`;
}

function unique(arr) {
    return Array.from(new Set(arr));
}

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decodeURIComponentSafe(value) {
    try {
        return decodeURIComponent(String(value || ""));
    } catch {
        return String(value || "");
    }
}

function buildFilename(tipo, comandaId, impresionId) {
    const safeType = String(tipo || "ticket").replace(/[^a-z0-9_-]/gi, "_");
    const stamp = formatLocalStamp(new Date());
    return `${stamp}_${safeType}_comanda-${comandaId || "na"}_job-${impresionId || "na"}.txt`;
}

function resolveTimezone(rawTz) {
    const fallback = "America/Santiago";
    const tz = String(rawTz || "").trim() || fallback;
    try {
        new Intl.DateTimeFormat("es-CL", { timeZone: tz }).format(new Date());
        return tz;
    } catch {
        return fallback;
    }
}

function getTimezoneAbbrev(dateObj) {
    try {
        const formatter = new Intl.DateTimeFormat("es-CL", {
            timeZone: APP_TIMEZONE,
            timeZoneName: "short"
        });
        const parts = formatter.formatToParts(dateObj);
        const part = parts.find((item) => item.type === "timeZoneName");
        return part ? part.value : "CLT";
    } catch {
        return "CLT";
    }
}

function formatLocalTimestamp(dateObj) {
    const parts = getLocalDateParts(dateObj);
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function formatLocalStamp(dateObj) {
    const parts = getLocalDateParts(dateObj);
    return `${parts.year}${parts.month}${parts.day}_${parts.hour}${parts.minute}${parts.second}`;
}

function getLocalDateParts(dateObj) {
    const date = dateObj instanceof Date ? dateObj : new Date();
    try {
        const formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: APP_TIMEZONE,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        });
        const rawParts = formatter.formatToParts(date);
        const map = {};
        for (const part of rawParts) {
            map[part.type] = part.value;
        }
        return {
            year: map.year || String(date.getFullYear()),
            month: map.month || String(date.getMonth() + 1).padStart(2, "0"),
            day: map.day || String(date.getDate()).padStart(2, "0"),
            hour: normalizeHour(map.hour || String(date.getHours()).padStart(2, "0")),
            minute: map.minute || String(date.getMinutes()).padStart(2, "0"),
            second: map.second || String(date.getSeconds()).padStart(2, "0")
        };
    } catch {
        return {
            year: String(date.getFullYear()),
            month: String(date.getMonth() + 1).padStart(2, "0"),
            day: String(date.getDate()).padStart(2, "0"),
            hour: normalizeHour(String(date.getHours()).padStart(2, "0")),
            minute: String(date.getMinutes()).padStart(2, "0"),
            second: String(date.getSeconds()).padStart(2, "0")
        };
    }
}

function normalizeHour(value) {
    const raw = String(value || "00").padStart(2, "0");
    return raw === "24" ? "00" : raw;
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function psEscape(value) {
    return String(value || "").replace(/'/g, "''");
}

async function printTextFile(filePath, explicitPrinter = "", options = {}) {
    if (process.platform !== "win32") {
        return {
            ok: false,
            error: "Impresion automatica disponible solo en Windows.",
            printer: String(explicitPrinter || "")
        };
    }

    const selectedPrinter = String(explicitPrinter || "").trim();
    const envPrinter = process.env.PRINTER_NAME ? String(process.env.PRINTER_NAME) : "";
    const printerName = selectedPrinter || envPrinter;
    const paperWidthMm = clampInt(options.paperWidthMm, 58, 48, 120);
    const fontSizePt = clampFloat(options.fontSizePt, 9, 6, 16);

    const customStatus = await printWithCustomPaper(filePath, printerName, paperWidthMm, fontSizePt);
    if (customStatus.ok) {
        return {
            ok: true,
            info: customStatus.info,
            printer: customStatus.printer,
            mode: "custom"
        };
    }

    const fallbackStatus = await printWithOutPrinter(filePath, printerName);
    if (fallbackStatus.ok) {
        return {
            ok: true,
            info: fallbackStatus.info,
            printer: fallbackStatus.printer,
            mode: "fallback_out_printer",
            warning: `Formato termico no aplicado. Fallback Out-Printer. Motivo: ${customStatus.error}`
        };
    }

    return {
        ok: false,
        error: `No se pudo imprimir. Custom: ${customStatus.error}. Fallback: ${fallbackStatus.error}`,
        printer: printerName
    };
}

function printWithCustomPaper(filePath, printerName, paperWidthMm, fontSizePt) {
    const escapedPath = psEscape(filePath);
    const escapedPrinter = psEscape(printerName || "");
    const command = [
        "$ErrorActionPreference='Stop'",
        "Add-Type -AssemblyName System.Drawing",
        `$filePath='${escapedPath}'`,
        `$printerName='${escapedPrinter}'`,
        `$paperWidthMm=${paperWidthMm}`,
        `$fontSizePt=${fontSizePt}`,
        "$ticketLines = Get-Content -LiteralPath $filePath",
        "if ($null -eq $ticketLines) { $ticketLines = @('') }",
        "$ticketFont = New-Object System.Drawing.Font('Consolas', $fontSizePt)",
        "$lineHeight = [int][Math]::Ceiling($ticketFont.GetHeight())",
        "$doc = New-Object System.Drawing.Printing.PrintDocument",
        "if ($printerName -ne '') { $doc.PrinterSettings.PrinterName = $printerName }",
        "if (-not $doc.PrinterSettings.IsValid) { throw 'Impresora no valida o no instalada.' }",
        "$paperWidth = [int][Math]::Round(($paperWidthMm / 25.4) * 100)",
        "$paperHeight = [int][Math]::Max(400, (($ticketLines.Count + 8) * $lineHeight))",
        "$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(5,5,5,5)",
        "$doc.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('TicketCustom',$paperWidth,$paperHeight)",
        "$script:lineIndex = 0",
        "$script:ticketLines = $ticketLines",
        "$script:ticketFont = $ticketFont",
        "$script:ticketLineHeight = [int][Math]::Max(10, $lineHeight)",
        "$doc.add_PrintPage({",
        "$e = $args[1]",
        "$y = $e.MarginBounds.Top",
        "while($script:lineIndex -lt $script:ticketLines.Count){",
        "$line = [string]$script:ticketLines[$script:lineIndex]",
        "$e.Graphics.DrawString($line,$script:ticketFont,[System.Drawing.Brushes]::Black,$e.MarginBounds.Left,$y)",
        "$y += $script:ticketLineHeight",
        "$script:lineIndex++",
        "if(($y + $script:ticketLineHeight) -gt $e.MarginBounds.Bottom){",
        "$e.HasMorePages = $true",
        "return",
        "}",
        "}",
        "$e.HasMorePages = $false",
        "})",
        "$doc.Print()",
        "$doc.Dispose()",
        "$ticketFont.Dispose()"
    ].join("; ");

    return execPowerShell(command, 22000).then((result) => {
        if (!result.ok) {
            return {
                ok: false,
                error: `No se pudo imprimir en modo termico: ${result.error}`,
                printer: printerName
            };
        }
        return {
            ok: true,
            info: result.stdout || "",
            printer: printerName
        };
    });
}

function printWithOutPrinter(filePath, printerName) {
    const escapedPath = psEscape(filePath);
    let command = `Get-Content -LiteralPath '${escapedPath}' | Out-Printer`;
    if (printerName) {
        command = `Get-Content -LiteralPath '${escapedPath}' | Out-Printer -Name '${psEscape(printerName)}'`;
    }

    return execPowerShell(command, 15000).then((result) => {
        if (!result.ok) {
            return {
                ok: false,
                error: `No se pudo imprimir con Out-Printer: ${result.error}`,
                printer: printerName
            };
        }
        return {
            ok: true,
            info: result.stdout || "",
            printer: printerName
        };
    });
}

function execPowerShell(command, timeoutMs) {
    return new Promise((resolve) => {
        execFile(
            "powershell.exe",
            ["-NoProfile", "-Command", command],
            { windowsHide: true, timeout: timeoutMs || 15000 },
            (error, stdout, stderr) => {
                if (error) {
                    resolve({
                        ok: false,
                        error: String(stderr || error.message || "Error PowerShell")
                    });
                    return;
                }
                resolve({
                    ok: true,
                    stdout: String(stdout || "")
                });
            }
        );
    });
}

function listPrinters() {
    return new Promise((resolve) => {
        if (process.platform !== "win32") {
            resolve({
                ok: false,
                error: "Listado de impresoras disponible solo en Windows."
            });
            return;
        }

        const command = [
            "$ErrorActionPreference='Stop'",
            "try {",
            "  $printers = Get-Printer | Select-Object -ExpandProperty Name",
            "} catch {",
            "  $printers = Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name",
            "}",
            "if ($null -eq $printers) { $printers = @() }",
            "try {",
            "  $def = Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1 -ExpandProperty Name",
            "} catch {",
            "  $def = ''",
            "}",
            "$result = [PSCustomObject]@{ ok = $true; printers = @($printers); defaultPrinter = $def }",
            "$result | ConvertTo-Json -Compress"
        ].join("; ");

        execFile(
            "powershell.exe",
            ["-NoProfile", "-Command", command],
            { windowsHide: true, timeout: 15000 },
            (error, stdout, stderr) => {
                if (error) {
                    resolve({
                        ok: false,
                        error: `No se pudo listar impresoras: ${stderr || error.message}`
                    });
                    return;
                }

                try {
                    const parsed = JSON.parse(stdout || "{}");
                    const printers = Array.isArray(parsed.printers)
                        ? parsed.printers
                        : parsed.printers
                            ? [parsed.printers]
                            : [];
                    resolve({
                        ok: true,
                        printers,
                        defaultPrinter: parsed.defaultPrinter || ""
                    });
                } catch {
                    resolve({
                        ok: false,
                        error: "No se pudo interpretar el listado de impresoras."
                    });
                }
            }
        );
    });
}

function clampInt(value, fallback, min, max) {
    const num = Number.parseInt(value, 10);
    if (!Number.isFinite(num)) {
        return fallback;
    }
    if (num < min) {
        return min;
    }
    if (num > max) {
        return max;
    }
    return num;
}

function clampFloat(value, fallback, min, max) {
    const num = Number.parseFloat(value);
    if (!Number.isFinite(num)) {
        return fallback;
    }
    if (num < min) {
        return min;
    }
    if (num > max) {
        return max;
    }
    return Math.round(num * 10) / 10;
}
