const STORAGE_KEY = "comanda_server_url";
const DEFAULT_PATH = "/login.html";

const input = document.getElementById("serverUrl");
const connectButton = document.getElementById("connectButton");
const resetButton = document.getElementById("resetButton");
const statusLabel = document.getElementById("status");

init();

connectButton.addEventListener("click", () => {
    const normalized = normalizeUrl(input.value);
    if (!normalized) {
        setStatus("Ingresa una URL valida, por ejemplo: http://192.168.1.20:3003/login.html");
        return;
    }

    localStorage.setItem(STORAGE_KEY, normalized);
    setStatus("Conectando...");
    window.location.href = normalized;
});

resetButton.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    input.value = "";
    setStatus("URL eliminada. Puedes ingresar una nueva.");
    input.focus();
});

function init() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
        return;
    }

    input.value = stored;
    setStatus("URL guardada cargada. Presiona Conectar o cambia la URL.");
}

function normalizeUrl(rawValue) {
    const value = String(rawValue || "").trim();
    if (!value) {
        return null;
    }

    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        return null;
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
        return null;
    }

    if (!parsed.pathname || parsed.pathname === "/") {
        parsed.pathname = DEFAULT_PATH;
    }

    return parsed.toString();
}

function setStatus(text) {
    statusLabel.textContent = text;
}
