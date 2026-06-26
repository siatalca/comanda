const STORAGE_KEY = "comanda_server_url";
const DEFAULT_SERVER_URL = "https://comanda.mi-registro.cl/login.html";
const DEFAULT_PATH = "/login.html";
const AUTO_CONNECT_DELAY_MS = 700;

const input = document.getElementById("serverUrl");
const connectButton = document.getElementById("connectButton");
const resetButton = document.getElementById("resetButton");
const statusLabel = document.getElementById("status");
const bluetoothSettingsButton = document.getElementById("bluetoothSettingsButton");
const loadPrintersButton = document.getElementById("loadPrintersButton");
const printerSelect = document.getElementById("printerSelect");
const savePrinterButton = document.getElementById("savePrinterButton");
const testPrinterButton = document.getElementById("testPrinterButton");
const printerStatusLabel = document.getElementById("printerStatus");

init();

connectButton.addEventListener("click", () => {
    const normalized = normalizeUrl(input.value);
    if (!normalized) {
        setStatus("Ingresa una URL valida, por ejemplo: http://192.168.1.20:3003/login.html");
        return;
    }

    localStorage.setItem(STORAGE_KEY, normalized);
    const bridge = printerBridge();
    if (bridge && !getSavedPrinter(bridge)) {
        setStatus("URL guardada. Primero selecciona y guarda la impresora Bluetooth.");
        setPrinterStatus("Selecciona una impresora y presiona Guardar impresora.");
        loadPrinters();
        return;
    }

    redirectToServer(normalized);
});

resetButton.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    input.value = "";
    setStatus("URL eliminada. Puedes ingresar una nueva.");
    input.focus();
});

bluetoothSettingsButton.addEventListener("click", () => {
    const bridge = printerBridge();
    if (!bridge) {
        setPrinterStatus("Esta funcion solo esta disponible dentro de la app Android.");
        return;
    }
    parsePrinterResult(bridge.openBluetoothSettings());
    setPrinterStatus("Abre Bluetooth, empareja la impresora y vuelve a la app.");
});

loadPrintersButton.addEventListener("click", loadPrinters);

savePrinterButton.addEventListener("click", () => {
    const bridge = printerBridge();
    if (!bridge) {
        setPrinterStatus("Esta funcion solo esta disponible dentro de la app Android.");
        return;
    }
    const address = printerSelect.value;
    if (!address) {
        setPrinterStatus("Selecciona una impresora.");
        return;
    }
    const result = parsePrinterResult(bridge.selectPrinter(address));
    if (!result.ok) {
        setPrinterStatus(result.error || "No se pudo guardar.");
        return;
    }

    const printerName = result.printer && result.printer.name ? result.printer.name : "Bluetooth";
    setPrinterStatus(`Impresora guardada: ${printerName}.`);

    const normalized = normalizeUrl(input.value);
    if (normalized) {
        localStorage.setItem(STORAGE_KEY, normalized);
        setStatus("Configuracion lista. Conectando...");
        window.setTimeout(() => redirectToServer(normalized), AUTO_CONNECT_DELAY_MS);
    }
});

testPrinterButton.addEventListener("click", () => {
    const bridge = printerBridge();
    if (!bridge) {
        setPrinterStatus("Esta funcion solo esta disponible dentro de la app Android.");
        return;
    }
    const text = [
        "COMANDA - PRUEBA",
        "Impresora Bluetooth OK",
        new Date().toLocaleString("es-CL"),
        "",
        "Si ves este ticket,",
        "la app esta lista.",
        ""
    ].join("\n");
    const result = parsePrinterResult(bridge.printText(text, "prueba"));
    setPrinterStatus(result.ok ? `Prueba enviada a ${result.printer || "Bluetooth"}.` : (result.error || "No se pudo imprimir."));
});

function init() {
    const stored = localStorage.getItem(STORAGE_KEY);
    input.value = stored || DEFAULT_SERVER_URL;

    const bridge = printerBridge();
    if (!bridge) {
        setStatus(stored ? "URL guardada cargada. Presiona Conectar o cambia la URL." : "Servidor oficial cargado. Presiona Conectar.");
        setPrinterStatus("Configura la impresora al abrir desde la app Android.");
        return;
    }

    const savedPrinter = getSavedPrinter(bridge);
    if (stored && savedPrinter) {
        const printerName = savedPrinter.name || "Bluetooth";
        setPrinterStatus(`Impresora guardada: ${printerName}.`);
        setStatus("Configuracion lista. Conectando...");
        window.setTimeout(() => redirectToServer(stored), AUTO_CONNECT_DELAY_MS);
        return;
    }

    setStatus(stored ? "URL guardada. Configura la impresora para entrar." : "Servidor oficial cargado. Configura la impresora para entrar.");
    loadPrinters();
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

function setPrinterStatus(text) {
    printerStatusLabel.textContent = text;
}

function printerBridge() {
    const bridge = window.ComandaAndroidPrinter;
    if (!bridge || typeof bridge.listPairedPrinters !== "function") {
        return null;
    }
    return bridge;
}

function parsePrinterResult(rawResult) {
    if (rawResult && typeof rawResult === "object") {
        return rawResult;
    }
    try {
        return JSON.parse(String(rawResult || "{}"));
    } catch {
        return {
            ok: false,
            error: "Respuesta invalida de Bluetooth."
        };
    }
}

function getSavedPrinter(bridge) {
    if (!bridge || typeof bridge.getSelectedPrinter !== "function") {
        return null;
    }

    const result = parsePrinterResult(bridge.getSelectedPrinter());
    if (result.ok && result.printer && result.printer.address) {
        return result.printer;
    }
    return null;
}

function redirectToServer(url) {
    setStatus("Conectando...");
    window.location.replace(url);
}

function loadPrinters() {
    const bridge = printerBridge();
    if (!bridge) {
        setPrinterStatus("Esta funcion solo esta disponible dentro de la app Android.");
        return;
    }

    const result = parsePrinterResult(bridge.listPairedPrinters());
    printerSelect.innerHTML = '<option value="">Sin impresora seleccionada</option>';

    if (!result.ok) {
        setPrinterStatus(result.error || "No se pudieron cargar impresoras.");
        return;
    }

    const devices = Array.isArray(result.devices) ? result.devices : [];
    devices.forEach((device) => {
        const option = document.createElement("option");
        option.value = device.address || "";
        option.textContent = `${device.name || "Bluetooth"}${device.likely_printer ? " - sugerida" : ""}`;
        option.selected = Boolean(device.selected);
        printerSelect.appendChild(option);
    });

    if (devices.length === 0) {
        setPrinterStatus("No hay dispositivos Bluetooth emparejados.");
        return;
    }

    const selected = devices.find((device) => device.selected) || devices.find((device) => device.likely_printer);
    if (selected && selected.address) {
        printerSelect.value = selected.address;
    }
    setPrinterStatus(`${devices.length} dispositivo(s) emparejado(s) encontrado(s).`);
}
