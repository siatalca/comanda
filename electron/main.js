const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { URL } = require("url");

applyDesktopConfigEnv();

const APP_PORT = clampInt(process.env.APP_PORT, 3003);
const LOCAL_LOGIN_URL = `http://127.0.0.1:${APP_PORT}/login.html`;
const APP_URL = String(process.env.COMANDA_URL || LOCAL_LOGIN_URL).trim();
const SERVER_STARTUP_TIMEOUT_MS = clampInt(process.env.ELECTRON_SERVER_TIMEOUT_MS, 30000);
const SHOULD_START_SERVER = String(process.env.ELECTRON_START_SERVER || "1") !== "0";

let serverProcess = null;
let isQuitting = false;

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
    try {
        if (SHOULD_START_SERVER) {
            startBackend();
            await waitForServer(LOCAL_LOGIN_URL, SERVER_STARTUP_TIMEOUT_MS);
        }
        createWindow();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        dialog.showErrorBox(
            "No se pudo iniciar Comanda",
            `No fue posible iniciar el servidor local.\n\nDetalle: ${message}`
        );
        app.quit();
    }
});

app.on("before-quit", () => {
    isQuitting = true;
    stopBackend();
});

app.on("window-all-closed", () => {
    app.quit();
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

function createWindow() {
    const window = new BrowserWindow({
        width: 1366,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        autoHideMenuBar: true,
        backgroundColor: "#111827",
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    window.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: "deny" };
    });

    window.loadURL(APP_URL);
}

function startBackend() {
    const projectRoot = path.join(__dirname, "..");
    const serverFile = path.join(projectRoot, "server.js");

    serverProcess = spawn(process.execPath, [serverFile], {
        cwd: projectRoot,
        env: { ...process.env, ELECTRON_RUNNER: "1" },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
    });

    serverProcess.stdout.on("data", (chunk) => {
        process.stdout.write(`[server] ${chunk}`);
    });

    serverProcess.stderr.on("data", (chunk) => {
        process.stderr.write(`[server] ${chunk}`);
    });

    serverProcess.on("exit", (code, signal) => {
        if (isQuitting) {
            return;
        }
        const detail = `El servidor local se cerro (code=${String(code)}, signal=${String(signal)}).`;
        dialog.showErrorBox("Servidor local detenido", detail);
        app.quit();
    });
}

function stopBackend() {
    if (!serverProcess || serverProcess.exitCode !== null) {
        return;
    }

    if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(serverProcess.pid), "/t", "/f"], {
            windowsHide: true
        });
        return;
    }

    serverProcess.kill("SIGTERM");
}

async function waitForServer(url, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let lastError = null;

    while (Date.now() < deadline) {
        try {
            await ping(url);
            return;
        } catch (error) {
            lastError = error;
            await sleep(500);
        }
    }

    throw new Error(
        `Timeout esperando el servidor en ${url}. ` +
            `Ultimo error: ${lastError instanceof Error ? lastError.message : String(lastError)}`
    );
}

function ping(url) {
    return new Promise((resolve, reject) => {
        let parsed;
        try {
            parsed = new URL(url);
        } catch (error) {
            reject(error);
            return;
        }

        const client = parsed.protocol === "https:" ? https : http;
        const req = client.request(
            {
                protocol: parsed.protocol,
                hostname: parsed.hostname,
                port: parsed.port,
                path: parsed.pathname + parsed.search,
                method: "GET",
                timeout: 2500
            },
            (res) => {
                res.resume();
                if (res.statusCode && res.statusCode < 500) {
                    resolve();
                    return;
                }
                reject(new Error(`HTTP ${String(res.statusCode || "sin codigo")}`));
            }
        );

        req.on("error", reject);
        req.on("timeout", () => {
            req.destroy(new Error("Tiempo de espera agotado"));
        });
        req.end();
    });
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampInt(rawValue, fallback) {
    const parsed = Number.parseInt(String(rawValue || fallback), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return parsed;
}

function applyDesktopConfigEnv() {
    const configFile = path.join(__dirname, "..", "desktop.config.json");
    if (!fs.existsSync(configFile)) {
        return;
    }

    let parsed = null;
    try {
        const raw = fs.readFileSync(configFile, "utf8");
        parsed = JSON.parse(raw);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[desktop] No se pudo leer desktop.config.json: ${message}`);
        return;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return;
    }

    const database = parsed.database && typeof parsed.database === "object" && !Array.isArray(parsed.database)
        ? parsed.database
        : {};

    const mapping = {
        appUrl: "COMANDA_URL",
        startServer: "ELECTRON_START_SERVER",
        appPort: "APP_PORT",
        appHost: "APP_HOST",
        printPort: "PRINT_PORT",
        printHost: "PRINT_HOST",
        printServiceUrl: "PRINT_SERVICE_URL",
        dbHost: "COMANDA_DB_HOST",
        dbPort: "COMANDA_DB_PORT",
        dbUser: "COMANDA_DB_USER",
        dbPass: "COMANDA_DB_PASS",
        dbName: "COMANDA_DB_NAME",
        dbCharset: "COMANDA_DB_CHARSET",
        dbCollation: "COMANDA_DB_COLLATION"
    };

    Object.keys(mapping).forEach((key) => {
        const envKey = mapping[key];
        const rawValue = Object.prototype.hasOwnProperty.call(parsed, key)
            ? parsed[key]
            : database[key];

        if (rawValue === undefined || rawValue === null) {
            return;
        }

        let normalized = "";
        if (typeof rawValue === "boolean") {
            normalized = rawValue ? "1" : "0";
        } else {
            normalized = String(rawValue).trim();
        }

        if (normalized === "") {
            return;
        }

        process.env[envKey] = normalized;
    });
}
