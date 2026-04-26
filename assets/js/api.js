(function () {
    const API_BASE = resolveApiBase();

    function resolveApiBase() {
        const protocol = window.location.protocol === "https:" ? "https:" : "http:";
        const host = window.location.hostname || "127.0.0.1";
        return `${protocol}//${host}:3003/api.php`;
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

        const url = `${API_BASE}?${params.toString()}`;
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
        getChargeConfig: async function () {
            const data = await request("config_cobro");
            return data.data || {};
        },
        sendOrder: async function (mesaNumero, items, origen) {
            return request("send_order", {
                method: "POST",
                body: {
                    mesa_numero: mesaNumero,
                    items,
                    origen: origen || "movil"
                }
            });
        },
        chargeTable: async function (mesaNumero, payment) {
            const payload = {
                mesa_numero: mesaNumero,
                metodo: "efectivo"
            };

            if (typeof payment === "string") {
                payload.metodo = payment || "efectivo";
            } else if (payment && typeof payment === "object") {
                payload.metodo = payment.metodo || "efectivo";
                if (Array.isArray(payment.pagos) && payment.pagos.length > 0) {
                    payload.pagos = payment.pagos;
                }
                const tip = Number(payment.propina || 0);
                if (Number.isFinite(tip) && tip >= 0) {
                    payload.propina = tip;
                }
            }

            return request("charge_table", {
                method: "POST",
                body: payload
            });
        },
        printBill: async function (mesaNumero) {
            return request("print_bill", {
                method: "POST",
                body: {
                    mesa_numero: mesaNumero
                }
            });
        },
        money
    };
})();
