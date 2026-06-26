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
})();
