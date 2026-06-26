(function () {
    const API_BASE = resolveApiBase();

    function resolveApiBase() {
        const protocol = window.location.protocol === "https:" ? "https:" : "http:";
        const host = window.location.hostname || "127.0.0.1";
        try {
            return new URL("api.php", window.location.href).toString();
        } catch (error) {
            return `${protocol}//${host}/api.php`;
        }
    }

    async function request(action, options = {}) {
        const method = options.method || "GET";
        const query = options.query || {};
        const params = new URLSearchParams({ action });
        Object.keys(query).forEach((key) => {
            const value = query[key];
            if (value !== undefined && value !== null && value !== "") {
                params.append(key, String(value));
            }
        });

        const config = {
            method,
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include",
            mode: "cors"
        };

        if (options.body) {
            config.body = JSON.stringify(options.body);
        }

        const url = `${API_BASE}?${params.toString()}`;
        const response = await fetch(url, config);
        const payload = await response.json().catch(() => ({}));

        if (!response.ok || !payload.ok) {
            const errorMessage = payload.error || `Error HTTP ${response.status}`;
            throw new Error(errorMessage);
        }

        return payload;
    }

    function money(value) {
        const number = Number(value || 0);
        return `$${number.toLocaleString("es-CL", { maximumFractionDigits: 0 })}`;
    }

    function nativePrinterBridge() {
        const bridge = window.ComandaAndroidPrinter;
        if (!bridge || typeof bridge.printText !== "function") {
            return null;
        }
        return bridge;
    }

    function parseNativePrinterResult(rawResult) {
        if (rawResult && typeof rawResult === "object") {
            return rawResult;
        }
        try {
            return JSON.parse(String(rawResult || "{}"));
        } catch (error) {
            return {
                ok: false,
                error: "Respuesta invalida de la impresora Android."
            };
        }
    }

    function shouldPrintWithNative(status) {
        if (!status || typeof status !== "object") {
            return true;
        }

        const okValue = status.ok === true ||
            status.ok === 1 ||
            String(status.ok).toLowerCase() === "true" ||
            String(status.ok) === "1";
        const estado = String(status.estado || "").toLowerCase();
        const detalle = String(status.detalle || "").toLowerCase();
        if (!okValue || estado === "fallida" || estado === "error") {
            return true;
        }

        return estado === "omitida" && (
            detalle.includes("sin impresora") ||
            detalle.includes("impresora no valida") ||
            detalle.includes("impresora no instalada") ||
            detalle.includes("no se pudo imprimir") ||
            detalle.includes("servicio de impresion") ||
            detalle.includes("out-printer") ||
            detalle.includes("no se pudo conectar")
        );
    }

    function collectNativePrintJobsFromOrder(payload) {
        const groups = payload && payload.impresiones && typeof payload.impresiones === "object"
            ? payload.impresiones
            : {};
        return Object.keys(groups)
            .map((key) => ({
                key,
                tipo: key,
                status: groups[key],
                texto: groups[key] && groups[key].texto ? String(groups[key].texto) : ""
            }))
            .filter((job) => job.texto && shouldPrintWithNative(job.status));
    }

    function collectNativePrintJobsFromSingle(payload, tipo, options = {}) {
        const status = payload && payload.impresion ? payload.impresion : null;
        const force = Boolean(options.force);
        if (!status || !status.texto || (!force && !shouldPrintWithNative(status))) {
            return [];
        }
        return [{
            key: tipo,
            tipo,
            status,
            texto: String(status.texto)
        }];
    }

    function ensureNativePrinterSelected(bridge) {
        const selected = parseNativePrinterResult(bridge.getSelectedPrinter());
        if (selected.ok && selected.printer && selected.printer.address) {
            return selected;
        }

        const list = parseNativePrinterResult(bridge.listPairedPrinters());
        if (!list.ok) {
            return list;
        }

        const devices = Array.isArray(list.devices) ? list.devices : [];
        if (devices.length === 0) {
            return {
                ok: false,
                error: "No hay impresoras Bluetooth emparejadas en Android."
            };
        }

        let chosen = devices.find((device) => device.selected) ||
            devices.find((device) => device.likely_printer) ||
            (devices.length === 1 ? devices[0] : null);

        if (!chosen && typeof window.prompt === "function") {
            const options = devices
                .map((device, index) => `${index + 1}) ${device.name || "Bluetooth"} ${device.address || ""}`)
                .join("\n");
            const answer = window.prompt(`Elige impresora Bluetooth:\n${options}`, "1");
            const index = Number(answer || 0) - 1;
            chosen = devices[index] || null;
        }

        if (!chosen || !chosen.address) {
            return {
                ok: false,
                error: "No se selecciono impresora Bluetooth."
            };
        }

        return parseNativePrinterResult(bridge.selectPrinter(String(chosen.address)));
    }

    function printWithNativeBluetooth(jobs) {
        const bridge = nativePrinterBridge();
        if (!bridge || !Array.isArray(jobs) || jobs.length === 0) {
            return null;
        }

        const selection = ensureNativePrinterSelected(bridge);
        if (!selection.ok) {
            return {
                ok: false,
                estado: "fallida",
                detalle: selection.error || "No se pudo seleccionar impresora Bluetooth.",
                warning: "",
                printer: "",
                resultados: {}
            };
        }

        const results = {};
        const detailParts = [];
        const printers = [];
        let ok = true;

        jobs.forEach((job) => {
            const result = parseNativePrinterResult(bridge.printText(job.texto, job.tipo || "ticket"));
            results[job.key || job.tipo || "ticket"] = result;
            if (!result.ok) {
                ok = false;
            }
            const label = String(job.key || job.tipo || "ticket").toUpperCase();
            detailParts.push(`${label}: ${result.ok ? (result.message || "Impreso por Bluetooth Android.") : (result.error || "Fallo Bluetooth.")}`);
            if (result.printer) {
                printers.push(result.printer);
            }
        });

        const uniquePrinters = [...new Set(printers)];
        return {
            ok,
            estado: ok ? "enviada" : "fallida",
            detalle: detailParts.join(" | "),
            warning: "",
            printer: uniquePrinters.join(", "),
            resultados: results
        };
    }

    function applyNativePrintStatus(payload, nativeStatus) {
        if (!payload || !nativeStatus) {
            return payload;
        }
        const current = payload.impresion && typeof payload.impresion === "object" ? payload.impresion : {};
        payload.impresion_android = nativeStatus;
        payload.impresion = {
            ...current,
            ok: nativeStatus.ok,
            estado: nativeStatus.estado,
            detalle: nativeStatus.detalle,
            warning: nativeStatus.warning || "",
            printer: nativeStatus.printer || current.printer || "",
            android: true
        };
        return payload;
    }

    function maybePrintOrderWithNative(payload) {
        return applyNativePrintStatus(payload, printWithNativeBluetooth(collectNativePrintJobsFromOrder(payload)));
    }

    function maybePrintSingleWithNative(payload, tipo, options = {}) {
        return applyNativePrintStatus(payload, printWithNativeBluetooth(collectNativePrintJobsFromSingle(payload, tipo, options)));
    }

    function installAndroidPrinterControls() {
        const bridge = nativePrinterBridge();
        if (!bridge || document.getElementById("androidPrinterButton")) {
            return;
        }

        const mount = () => {
            if (!document.body || document.getElementById("androidPrinterButton")) {
                return;
            }

            injectAndroidPrinterStyles();

            const button = document.createElement("button");
            button.id = "androidPrinterButton";
            button.type = "button";
            button.className = "android-printer-fab";
            button.textContent = "Impresora";
            button.addEventListener("click", openAndroidPrinterPanel);
            document.body.appendChild(button);
        };

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", mount, { once: true });
        } else {
            mount();
        }
    }

    function injectAndroidPrinterStyles() {
        if (document.getElementById("androidPrinterStyles")) {
            return;
        }

        const style = document.createElement("style");
        style.id = "androidPrinterStyles";
        style.textContent = `
            .android-printer-fab {
                position: fixed;
                right: 14px;
                bottom: calc(14px + env(safe-area-inset-bottom, 0px));
                z-index: 9999;
                width: auto;
                min-width: 112px;
                min-height: 44px;
                border: 0;
                border-radius: 999px;
                padding: 10px 14px;
                background: #0f766e;
                color: #fff;
                font: 700 14px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                box-shadow: 0 8px 18px rgba(15, 23, 42, 0.22);
            }
            .android-printer-backdrop {
                position: fixed;
                inset: 0;
                z-index: 10000;
                display: grid;
                align-items: end;
                padding: 14px;
                background: rgba(15, 23, 42, 0.42);
            }
            .android-printer-backdrop[hidden] {
                display: none;
            }
            .android-printer-dialog {
                width: min(430px, 100%);
                margin: 0 auto;
                border-radius: 8px;
                border: 1px solid #d0d5dd;
                background: #fff;
                color: #101828;
                box-shadow: 0 18px 45px rgba(15, 23, 42, 0.25);
                padding: 16px;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            }
            .android-printer-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 8px;
            }
            .android-printer-header h2 {
                margin: 0;
                font-size: 18px;
                line-height: 1.25;
            }
            .android-printer-close {
                width: 36px;
                min-width: 36px;
                height: 36px;
                margin: 0;
                border: 1px solid #d0d5dd;
                border-radius: 8px;
                background: #fff;
                color: #101828;
                font-size: 20px;
                line-height: 1;
            }
            .android-printer-help {
                margin: 0 0 12px;
                color: #475467;
                font-size: 14px;
                line-height: 1.4;
            }
            .android-printer-grid {
                display: grid;
                gap: 8px;
            }
            .android-printer-dialog button,
            .android-printer-dialog select {
                width: 100%;
                min-height: 42px;
                border-radius: 8px;
                font: 600 15px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            }
            .android-printer-dialog button {
                border: 0;
                background: #0b6ef9;
                color: #fff;
                padding: 10px 12px;
            }
            .android-printer-dialog button.android-printer-secondary {
                border: 1px solid #d0d5dd;
                background: #f8fafc;
                color: #101828;
            }
            .android-printer-dialog select {
                border: 1px solid #d0d5dd;
                background: #fff;
                color: #101828;
                padding: 9px 10px;
            }
            .android-printer-status {
                min-height: 20px;
                margin: 8px 0 0;
                color: #475467;
                font-size: 14px;
                line-height: 1.4;
            }
            .android-printer-status.is-error {
                color: #b42318;
            }
        `;
        document.head.appendChild(style);
    }

    function openAndroidPrinterPanel() {
        const panel = ensureAndroidPrinterPanel();
        if (!panel) {
            return;
        }
        panel.hidden = false;
        loadAndroidPrinterDevices();
    }

    function ensureAndroidPrinterPanel() {
        let panel = document.getElementById("androidPrinterPanel");
        if (panel) {
            return panel;
        }

        panel = document.createElement("div");
        panel.id = "androidPrinterPanel";
        panel.className = "android-printer-backdrop";
        panel.hidden = true;
        panel.innerHTML = `
            <section class="android-printer-dialog" role="dialog" aria-modal="true" aria-labelledby="androidPrinterTitle">
                <div class="android-printer-header">
                    <h2 id="androidPrinterTitle">Impresora Bluetooth</h2>
                    <button type="button" class="android-printer-close" data-printer-action="close" aria-label="Cerrar">x</button>
                </div>
                <p class="android-printer-help">Empareja la impresora desde Android, carga la lista y guarda la impresora activa.</p>
                <div class="android-printer-grid">
                    <button type="button" class="android-printer-secondary" data-printer-action="settings">Abrir ajustes Bluetooth</button>
                    <button type="button" class="android-printer-secondary" data-printer-action="load">Cargar emparejadas</button>
                    <select data-printer-role="select" aria-label="Impresoras Bluetooth">
                        <option value="">Sin impresora seleccionada</option>
                    </select>
                    <button type="button" data-printer-action="save">Guardar impresora</button>
                    <button type="button" class="android-printer-secondary" data-printer-action="test">Imprimir prueba</button>
                </div>
                <p class="android-printer-status" data-printer-role="status"></p>
            </section>
        `;

        panel.addEventListener("click", (event) => {
            if (event.target === panel || event.target.closest("[data-printer-action='close']")) {
                panel.hidden = true;
                return;
            }

            const action = event.target.closest("[data-printer-action]");
            if (!action) {
                return;
            }

            const value = action.getAttribute("data-printer-action");
            if (value === "settings") {
                openAndroidBluetoothSettings();
            } else if (value === "load") {
                loadAndroidPrinterDevices();
            } else if (value === "save") {
                saveAndroidPrinterSelection();
            } else if (value === "test") {
                testAndroidPrinter();
            }
        });

        document.body.appendChild(panel);
        return panel;
    }

    function androidPrinterElements() {
        const panel = document.getElementById("androidPrinterPanel");
        return {
            panel,
            select: panel ? panel.querySelector("[data-printer-role='select']") : null,
            status: panel ? panel.querySelector("[data-printer-role='status']") : null
        };
    }

    function setAndroidPrinterStatus(message, isError = false) {
        const elements = androidPrinterElements();
        if (!elements.status) {
            return;
        }
        elements.status.textContent = message || "";
        elements.status.classList.toggle("is-error", Boolean(isError));
    }

    function openAndroidBluetoothSettings() {
        const bridge = nativePrinterBridge();
        if (!bridge || typeof bridge.openBluetoothSettings !== "function") {
            setAndroidPrinterStatus("Esta funcion solo esta disponible en la app Android.", true);
            return;
        }

        parseNativePrinterResult(bridge.openBluetoothSettings());
        setAndroidPrinterStatus("Empareja la impresora en Android y vuelve para cargar la lista.");
    }

    function loadAndroidPrinterDevices() {
        const bridge = nativePrinterBridge();
        const elements = androidPrinterElements();
        if (!bridge || !elements.select || typeof bridge.listPairedPrinters !== "function") {
            setAndroidPrinterStatus("Esta funcion solo esta disponible en la app Android.", true);
            return;
        }

        const result = parseNativePrinterResult(bridge.listPairedPrinters());
        elements.select.innerHTML = '<option value="">Sin impresora seleccionada</option>';

        if (!result.ok) {
            setAndroidPrinterStatus(result.error || "No se pudieron cargar impresoras.", true);
            return;
        }

        const devices = Array.isArray(result.devices) ? result.devices : [];
        devices.forEach((device) => {
            const option = document.createElement("option");
            option.value = device.address || "";
            option.textContent = `${device.name || "Bluetooth"}${device.likely_printer ? " - sugerida" : ""}`;
            option.selected = Boolean(device.selected);
            elements.select.appendChild(option);
        });

        if (devices.length === 0) {
            setAndroidPrinterStatus("No hay dispositivos Bluetooth emparejados.", true);
            return;
        }

        const selected = devices.find((device) => device.selected) ||
            devices.find((device) => device.likely_printer);
        if (selected && selected.address) {
            elements.select.value = selected.address;
        }

        setAndroidPrinterStatus(`${devices.length} dispositivo(s) encontrado(s).`);
    }

    function saveAndroidPrinterSelection() {
        const bridge = nativePrinterBridge();
        const elements = androidPrinterElements();
        if (!bridge || !elements.select || typeof bridge.selectPrinter !== "function") {
            setAndroidPrinterStatus("Esta funcion solo esta disponible en la app Android.", true);
            return;
        }

        const address = elements.select.value;
        if (!address) {
            setAndroidPrinterStatus("Selecciona una impresora Bluetooth.", true);
            return;
        }

        const result = parseNativePrinterResult(bridge.selectPrinter(address));
        if (!result.ok) {
            setAndroidPrinterStatus(result.error || "No se pudo guardar la impresora.", true);
            return;
        }

        const printerName = result.printer && result.printer.name ? result.printer.name : "Bluetooth";
        setAndroidPrinterStatus(`Impresora guardada: ${printerName}.`);
    }

    function testAndroidPrinter() {
        const bridge = nativePrinterBridge();
        if (!bridge || typeof bridge.printText !== "function") {
            setAndroidPrinterStatus("Esta funcion solo esta disponible en la app Android.", true);
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
        const result = parseNativePrinterResult(bridge.printText(text, "prueba"));
        setAndroidPrinterStatus(
            result.ok ? `Prueba enviada a ${result.printer || "Bluetooth"}.` : (result.error || "No se pudo imprimir."),
            !result.ok
        );
    }

    window.ComandaAPI = {
        session: async function () {
            return request("session");
        },
        login: async function (usuario, password) {
            return request("login", {
                method: "POST",
                body: {
                    usuario,
                    password
                }
            });
        },
        logout: async function () {
            return request("logout", {
                method: "POST",
                body: {}
            });
        },
        getMenu: async function () {
            const data = await request("menu");
            return data.menu || {};
        },
        getDailyMenu: async function (fecha) {
            const data = await request("menu_diario", {
                query: {
                    fecha: fecha || ""
                }
            });
            return data.data || {};
        },
        confirmDailyMenu: async function (fecha, productos) {
            return request("menu_diario_confirmar", {
                method: "POST",
                body: {
                    fecha: fecha || "",
                    productos: Array.isArray(productos) ? productos : []
                }
            });
        },
        getSalesHistory: async function (desde, hasta) {
            const data = await request("ventas_historial", {
                query: {
                    desde: desde || "",
                    hasta: hasta || ""
                }
            });
            return data.data || {};
        },
        adminSession: async function () {
            return request("admin_session");
        },
        adminBootstrap: async function () {
            return request("admin_bootstrap");
        },
        adminLogin: async function (usuario, password) {
            return request("admin_login", {
                method: "POST",
                body: {
                    usuario,
                    password
                }
            });
        },
        adminLogout: async function () {
            return request("admin_logout", {
                method: "POST",
                body: {}
            });
        },
        adminSaveSettings: async function (settings) {
            return request("admin_save_settings", {
                method: "POST",
                body: settings || {}
            });
        },
        adminSavePrinters: async function (payload) {
            return request("admin_save_printers", {
                method: "POST",
                body: payload || {}
            });
        },
        adminSetTables: async function (cantidad) {
            return request("admin_set_tables", {
                method: "POST",
                body: { cantidad }
            });
        },
        adminProductSave: async function (product) {
            return request("admin_product_save", {
                method: "POST",
                body: product || {}
            });
        },
        adminProductToggle: async function (id, activo) {
            return request("admin_product_toggle", {
                method: "POST",
                body: { id, activo }
            });
        },
        adminUserSave: async function (user) {
            return request("admin_user_save", {
                method: "POST",
                body: user || {}
            });
        },
        adminUserToggle: async function (id, activo) {
            return request("admin_user_toggle", {
                method: "POST",
                body: { id, activo }
            });
        },
        getMesas: async function () {
            const data = await request("mesas");
            return data.mesas || [];
        },
        getOpenAccounts: async function () {
            const data = await request("cuentas_abiertas");
            return data.cuentas || [];
        },
        getCashStatus: async function () {
            const data = await request("caja_estado_actual");
            return data.data || {};
        },
        getUserPreferences: async function () {
            const data = await request("user_preferences");
            return data.data || {};
        },
        saveUserPreferences: async function (prefs) {
            return request("user_preferences_save", {
                method: "POST",
                body: prefs || {}
            });
        },
        openCashSession: async function (montoInicial) {
            return request("caja_abrir", {
                method: "POST",
                body: {
                    monto_inicial: montoInicial
                }
            });
        },
        closeCashSession: async function (montoFinalDeclarado, notas) {
            return request("caja_cerrar", {
                method: "POST",
                body: {
                    monto_final_declarado: montoFinalDeclarado,
                    notas: notas || ""
                }
            });
        },
        getComanda: async function (mesaNumero) {
            const data = await request("comanda", {
                query: {
                    mesa: mesaNumero
                }
            });
            return data.data || {};
        },
        getKitchenQueue: async function () {
            const data = await request("cocina_pedidos");
            return data.data || {};
        },
        setKitchenItemStatus: async function (itemId, entregado) {
            return request("cocina_item_estado", {
                method: "POST",
                body: {
                    item_id: itemId,
                    entregado: entregado ? 1 : 0
                }
            });
        },
        completeKitchenOrder: async function (comandaId) {
            return request("cocina_comanda_lista", {
                method: "POST",
                body: {
                    comanda_id: comandaId
                }
            });
        },
        getChargeConfig: async function () {
            const data = await request("config_cobro");
            return data.data || {};
        },
        sendOrder: async function (mesaNumero, items, origen) {
            const response = await request("send_order", {
                method: "POST",
                body: {
                    mesa_numero: mesaNumero,
                    items,
                    origen: origen || "movil"
                }
            });
            return maybePrintOrderWithNative(response);
        },
        chargeTable: async function (mesaNumero, payment) {
            const payload = {
                mesa_numero: mesaNumero,
                metodo: "efectivo"
            };
            let forceNativePrint = false;

            if (typeof payment === "string") {
                payload.metodo = payment || "efectivo";
            } else if (payment && typeof payment === "object") {
                payload.metodo = payment.metodo || "efectivo";
                forceNativePrint = Boolean(payment.forceNativePrint || payment.imprimir_comprobante_android);
                if (Array.isArray(payment.pagos) && payment.pagos.length > 0) {
                    payload.pagos = payment.pagos;
                }
                const tip = Number(payment.propina || 0);
                if (Number.isFinite(tip) && tip >= 0) {
                    payload.propina = tip;
                }
            }

            const response = await request("charge_table", {
                method: "POST",
                body: payload
            });
            return maybePrintSingleWithNative(response, "ticket", { force: forceNativePrint });
        },
        printBill: async function (mesaNumero) {
            const response = await request("print_bill", {
                method: "POST",
                body: {
                    mesa_numero: mesaNumero
                }
            });
            return maybePrintSingleWithNative(response, "precuenta");
        },
        removeComandaItem: async function (itemId) {
            return request("comanda_item_remove", {
                method: "POST",
                body: {
                    item_id: itemId
                }
            });
        },
        money
    };

    installAndroidPrinterControls();
})();
