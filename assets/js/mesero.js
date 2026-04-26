(function () {
    const api = window.ComandaAPI;
    if (!api) {
        return;
    }

    const state = {
        mesaNumero: 1,
        menu: {},
        dailyMenuInfo: null,
        currentUser: null,
        tipEnabled: true,
        tipPercent: 10,
        productsById: new Map(),
        cart: new Map(),
        mesas: [],
        timer: null
    };

    const refs = {};

    document.addEventListener("DOMContentLoaded", init);

    async function init() {
        bindRefs();
        const sessionUser = await ensureSession();
        if (!sessionUser) {
            return;
        }
        state.currentUser = sessionUser;
        hydrateHeaderUser();
        bindEvents();
        refs.serverTag.textContent = window.location.origin;

        await Promise.all([loadMenu(), loadMesas(), loadChargeConfig(true), loadTipSummary(true)]);
        await refreshComanda();

        state.timer = window.setInterval(async () => {
            await Promise.all([loadMenu(true), loadMesas(true), loadChargeConfig(true), refreshComanda(true), loadTipSummary(true)]);
        }, 5000);
    }

    function bindRefs() {
        refs.mesaSelect = document.getElementById("mesaSelect");
        refs.btnRefrescarMesa = document.getElementById("btnRefrescarMesa");
        refs.mesaEstado = document.getElementById("mesaEstado");
        refs.menuMount = document.getElementById("menuMount");
        refs.cartList = document.getElementById("cartList");
        refs.cartEmpty = document.getElementById("cartEmpty");
        refs.btnEnviarPedido = document.getElementById("btnEnviarPedido");
        refs.btnLimpiarPedido = document.getElementById("btnLimpiarPedido");
        refs.comandaItems = document.getElementById("comandaItems");
        refs.comandaTotal = document.getElementById("comandaTotal");
        refs.btnImprimirPrecuenta = document.getElementById("btnImprimirPrecuenta");
        refs.btnCobrarMesa = document.getElementById("btnCobrarMesa");
        refs.tipsSummaryText = document.getElementById("tipsSummaryText");
        refs.tipsSummaryDate = document.getElementById("tipsSummaryDate");
        refs.toast = document.getElementById("toast");
        refs.serverTag = document.getElementById("serverTag");
        refs.currentUserLabel = document.getElementById("currentUserLabel");
        refs.btnLogout = document.getElementById("btnLogout");
    }

    function bindEvents() {
        refs.mesaSelect.addEventListener("change", async (event) => {
            state.mesaNumero = Number(event.target.value || 1);
            await refreshComanda();
            paintMesaStatus();
        });

        refs.btnRefrescarMesa.addEventListener("click", async () => {
            await Promise.all([loadMenu(), loadMesas(), refreshComanda(), loadTipSummary(true)]);
            toast("Datos actualizados.");
        });

        refs.menuMount.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-action]");
            if (!button) {
                return;
            }

            const id = Number(button.dataset.id || 0);
            if (!id) {
                return;
            }

            if (button.dataset.action === "inc") {
                setQty(id, getQty(id) + 1);
            }

            if (button.dataset.action === "dec") {
                setQty(id, getQty(id) - 1);
            }
        });

        refs.cartList.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-remove]");
            if (!button) {
                return;
            }
            const id = Number(button.dataset.remove || 0);
            if (id) {
                state.cart.delete(id);
                renderCart();
                renderMenu();
            }
        });

        if (refs.btnLimpiarPedido) {
            refs.btnLimpiarPedido.addEventListener("click", () => {
                state.cart.clear();
                renderCart();
                renderMenu();
            });
        }

        refs.btnEnviarPedido.addEventListener("click", sendOrder);
        refs.btnImprimirPrecuenta.addEventListener("click", printBill);
        if (refs.btnCobrarMesa) {
            refs.btnCobrarMesa.addEventListener("click", chargeTable);
        }
        if (refs.btnLogout) {
            refs.btnLogout.addEventListener("click", logout);
        }
    }

    async function ensureSession() {
        try {
            const session = await api.session();
            if (!session || !session.logged || !session.user) {
                window.location.href = "login.html";
                return null;
            }
            const role = String(session.user.rol || "").toLowerCase();
            if (role !== "mesero" && role !== "admin") {
                window.location.href = "servidor.html";
                return null;
            }
            return session.user;
        } catch (error) {
            window.location.href = "login.html";
            return null;
        }
    }

    function hydrateHeaderUser() {
        if (!refs.currentUserLabel || !state.currentUser) {
            return;
        }
        refs.currentUserLabel.textContent = `Usuario: ${state.currentUser.nombre} (${state.currentUser.rol})`;
    }

    async function logout() {
        try {
            await api.logout();
        } catch (error) {
            // Continúa con redireccion aunque falle logout remoto.
        }
        window.location.href = "login.html";
    }

    async function loadMenu(silent) {
        try {
            state.menu = await api.getMenu();
            state.productsById.clear();
            Object.values(state.menu).forEach((group) => {
                (group || []).forEach((product) => {
                    state.productsById.set(Number(product.id), product);
                });
            });

            const currentEntries = [...state.cart.keys()];
            currentEntries.forEach((productId) => {
                if (!state.productsById.has(Number(productId))) {
                    state.cart.delete(Number(productId));
                }
            });

            if (Object.keys(state.menu || {}).length === 0) {
                await loadDailyMenuInfo(true);
            } else {
                state.dailyMenuInfo = null;
            }

            renderMenu();
            renderCart();
        } catch (error) {
            if (!silent) {
                toast(error.message, "error");
            }
        }
    }

    async function loadDailyMenuInfo(silent) {
        try {
            state.dailyMenuInfo = await api.getDailyMenu("");
        } catch (error) {
            if (!silent) {
                toast(error.message, "error");
            }
        }
    }

    async function loadMesas(silent) {
        try {
            state.mesas = await api.getMesas();
            renderMesaSelect();
            paintMesaStatus();
        } catch (error) {
            if (!silent) {
                toast(error.message, "error");
            }
        }
    }

    async function loadChargeConfig(silent) {
        try {
            const data = await api.getChargeConfig();
            state.tipEnabled = Boolean(data.propina_habilitada !== false && Number(data.propina_habilitada || 0) !== 0);
            const percent = Number(data.propina_porcentaje || 10);
            state.tipPercent = Number.isFinite(percent) && percent >= 0 ? percent : 10;
        } catch (error) {
            if (!silent) {
                toast(error.message, "error");
            }
        }
    }

    async function loadTipSummary(silent) {
        if (!refs.tipsSummaryText || !refs.tipsSummaryDate) {
            return;
        }

        const today = todayKey();

        try {
            const data = await api.getSalesHistory(today, today);
            const summary = data && data.resumen ? data.resumen : {};
            const totalTips = Number(summary.propinas_total || 0);

            refs.tipsSummaryText.innerHTML = `<strong>Total Propina: ${api.money(totalTips)}</strong>`;
            refs.tipsSummaryDate.textContent = `Fecha: ${formatDateLabel(today)}`;

            if (!silent) {
                toast("Propinas actualizadas.");
            }
        } catch (error) {
            if (!silent) {
                toast(error.message, "error");
            }
        }
    }

    function formatDateLabel(dateKey) {
        const parts = String(dateKey || "").split("-");
        if (parts.length !== 3) {
            return String(dateKey || "-");
        }
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    function renderMesaSelect() {
        const currentValue = Number(refs.mesaSelect.value || state.mesaNumero || 1);
        const mesas = state.mesas.length > 0 ? state.mesas : createFallbackTables();

        refs.mesaSelect.innerHTML = mesas
            .map((mesa) => {
                const selected = Number(mesa.numero) === currentValue ? "selected" : "";
                return `<option value="${mesa.numero}" ${selected}>Mesa ${mesa.numero}</option>`;
            })
            .join("");

        state.mesaNumero = Number(refs.mesaSelect.value || currentValue || 1);
    }

    function createFallbackTables() {
        const mesas = [];
        for (let i = 1; i <= 20; i += 1) {
            mesas.push({ numero: i, estado: "libre" });
        }
        return mesas;
    }

    function paintMesaStatus() {
        const mesa = state.mesas.find((item) => Number(item.numero) === Number(state.mesaNumero));
        const estado = mesa ? mesa.estado : "sin datos";
        refs.mesaEstado.textContent = `Estado: ${estado}`;
    }

    function renderMenu() {
        const categories = Object.entries(state.menu || {});
        if (categories.length === 0) {
            const info = state.dailyMenuInfo || {};
            const fecha = escapeHtml(info.fecha || "");
            const confirmado = Number(info.confirmado || 0) === 1;
            const productos = Array.isArray(info.productos) ? info.productos : [];
            const habilitados = productos.filter((item) => Number(item.habilitado || 0) === 1).length;

            let message = "No hay menu disponible.";
            if (info.fecha) {
                if (!confirmado) {
                    message = `Menu del dia ${fecha} sin confirmar. Pide a caja/admin confirmar productos para habilitar la toma de pedidos.`;
                } else if (habilitados === 0) {
                    message = `Menu del dia ${fecha} confirmado, pero sin productos habilitados para mesero.`;
                } else {
                    message = `No se pudieron cargar productos del menu del dia ${fecha}.`;
                }
            }

            refs.menuMount.innerHTML = `<p class="empty-state">${message}</p>`;
            return;
        }

        refs.menuMount.innerHTML = categories
            .map(([categoria, products]) => {
                const cards = products
                    .map((product) => {
                        const id = Number(product.id);
                        const qty = getQty(id);
                        return `
                            <article class="product-card">
                                <div>
                                    <h3>${escapeHtml(product.nombre)}</h3>
                                    <p>${api.money(product.precio)}</p>
                                </div>
                                <div class="qty-control">
                                    <button type="button" data-action="dec" data-id="${id}">-</button>
                                    <span>${qty}</span>
                                    <button type="button" data-action="inc" data-id="${id}">+</button>
                                </div>
                            </article>
                        `;
                    })
                    .join("");

                return `
                    <section class="menu-group">
                        <h3>${escapeHtml(categoria)}</h3>
                        <div class="products-grid">${cards}</div>
                    </section>
                `;
            })
            .join("");
    }

    function getQty(productId) {
        return Number(state.cart.get(productId) || 0);
    }

    function setQty(productId, qty) {
        const next = Math.max(0, Number(qty || 0));
        if (next <= 0) {
            state.cart.delete(productId);
        } else {
            state.cart.set(productId, next);
        }
        renderMenu();
        renderCart();
    }

    function renderCart() {
        const entries = [...state.cart.entries()];
        if (entries.length === 0) {
            refs.cartList.innerHTML = "";
            refs.cartEmpty.classList.remove("hidden");
            return;
        }

        refs.cartEmpty.classList.add("hidden");
        const list = entries
            .map(([id, qty]) => {
                const product = state.productsById.get(Number(id));
                if (!product) {
                    return "";
                }
                const subtotal = Number(product.precio) * Number(qty);
                return `
                    <div class="cart-item">
                        <div>
                            <strong>${escapeHtml(product.nombre)}</strong>
                            <small>${qty} x ${api.money(product.precio)}</small>
                        </div>
                        <div class="cart-item-right">
                            <strong>${api.money(subtotal)}</strong>
                            <button type="button" class="btn-link" data-remove="${id}">Quitar</button>
                        </div>
                    </div>
                `;
            })
            .join("");
        refs.cartList.innerHTML = list;
    }

    async function refreshComanda(silent) {
        try {
            const snapshot = await api.getComanda(state.mesaNumero);
            renderComanda(snapshot);
        } catch (error) {
            if (!silent) {
                toast(error.message, "error");
            }
        }
    }

    function renderComanda(snapshot) {
        if (!snapshot || !snapshot.comanda) {
            refs.comandaItems.innerHTML = `<p class="empty-state">Esta mesa aun no tiene comanda abierta.</p>`;
            refs.comandaTotal.textContent = api.money(0);
            return;
        }

        const items = snapshot.items || [];
        if (items.length === 0) {
            refs.comandaItems.innerHTML = `<p class="empty-state">Sin items cargados.</p>`;
        } else {
            refs.comandaItems.innerHTML = items
                .map((item) => {
                    const nota = item.notas ? `<small>Nota: ${escapeHtml(item.notas)}</small>` : "";
                    return `
                        <div class="comanda-item">
                            <div>
                                <strong>${item.cantidad} x ${escapeHtml(item.descripcion)}</strong>
                                ${nota}
                            </div>
                            <strong>${api.money(item.subtotal)}</strong>
                        </div>
                    `;
                })
                .join("");
        }

        refs.comandaTotal.textContent = api.money(snapshot.comanda.total || 0);
    }

    async function sendOrder() {
        const items = [...state.cart.entries()].map(([productId, qty]) => ({
            producto_id: Number(productId),
            cantidad: Number(qty)
        }));

        if (items.length === 0) {
            toast("Agrega al menos un producto.", "error");
            return;
        }

        refs.btnEnviarPedido.disabled = true;
        try {
            const response = await api.sendOrder(state.mesaNumero, items, "movil");
            state.cart.clear();
            renderCart();
            renderMenu();
            await Promise.all([loadMesas(true), refreshComanda(true)]);

            if (response.impresion && !response.impresion.ok) {
                toast(`Pedido guardado, pero fallo impresion: ${response.impresion.detalle}`, "error");
                return;
            }

            if (response.impresion && response.impresion.warning) {
                toast(`Pedido enviado. Aviso impresion: ${response.impresion.warning}`, "error");
                return;
            }

            toast("Pedido enviado y comanda actualizada.");
        } catch (error) {
            toast(error.message, "error");
        } finally {
            refs.btnEnviarPedido.disabled = false;
        }
    }

    async function printBill() {
        try {
            const response = await api.printBill(state.mesaNumero);
            if (response.impresion && !response.impresion.ok) {
                toast(`Precuenta guardada, pero fallo impresion: ${response.impresion.detalle}`, "error");
                return;
            }
            if (response.impresion && response.impresion.warning) {
                toast(`Precuenta enviada. Aviso impresion: ${response.impresion.warning}`, "error");
                return;
            }
            toast("Precuenta enviada a impresion.");
        } catch (error) {
            toast(error.message, "error");
        }
    }

    async function chargeTable() {
        let totalMesa = 0;
        try {
            const snapshot = await api.getComanda(state.mesaNumero);
            totalMesa = Number(snapshot && snapshot.comanda ? snapshot.comanda.total : 0);
        } catch (error) {
            toast(error.message, "error");
            return;
        }

        if (!Number.isFinite(totalMesa) || totalMesa <= 0) {
            toast("La mesa no tiene total valido para cobrar.", "error");
            return;
        }

        const payment = await pickPaymentMethod(state.mesaNumero, totalMesa);
        if (!payment) {
            return;
        }

        if (refs.btnCobrarMesa) {
            refs.btnCobrarMesa.disabled = true;
        }
        try {
            const response = await api.chargeTable(state.mesaNumero, payment);
            await Promise.all([loadMesas(true), refreshComanda(true)]);

            if (response.impresion && !response.impresion.ok) {
                toast(`Mesa cobrada, pero fallo impresion: ${response.impresion.detalle}`, "error");
                return;
            }
            if (response.impresion && response.impresion.warning) {
                toast(`Mesa cobrada. Aviso impresion: ${response.impresion.warning}`, "error");
                return;
            }

            const tip = Number(response.propina || 0);
            const tipText = tip > 0 ? ` + Propina: ${api.money(tip)}` : "";
            toast(`Mesa cobrada. Total: ${api.money(response.total || 0)}${tipText}`);
        } catch (error) {
            toast(error.message, "error");
        } finally {
            if (refs.btnCobrarMesa) {
                refs.btnCobrarMesa.disabled = false;
            }
        }
    }

    function pickPaymentMethod(mesaNumero, total) {
        return new Promise((resolve) => {
            const totalValue = Number(total || 0);
            const tipEnabled = Boolean(state.tipEnabled);
            const tipPercent = Number(state.tipPercent || 10);
            const suggestedTip = tipEnabled ? Math.round(((totalValue * tipPercent) / 100) * 100) / 100 : 0;
            const overlay = document.createElement("div");
            overlay.className = "cash-gate";
            overlay.innerHTML = `
                <div class="cash-gate-card">
                    <h2>Cobrar mesa ${mesaNumero}</h2>
                    <p class="muted">Total a cobrar: <strong>${api.money(totalValue)}</strong></p>
                    <form class="form-grid">
                        <label>
                            Metodo de pago
                            <select id="paymentMethodSelect">
                                <option value="efectivo">Efectivo</option>
                                <option value="tarjeta">Tarjeta</option>
                                <option value="transferencia">Transferencia</option>
                                <option value="mixto">Otro (Pago mixto)</option>
                            </select>
                        </label>
                        <div id="tipFields" class="${tipEnabled ? "" : "hidden"}">
                            <p class="muted">Propina sugerida (${tipPercent}%): <strong>${api.money(suggestedTip)}</strong></p>
                            <label>
                                Propina a registrar (opcional)
                                <input id="tipAmount" type="number" min="0" step="1" value="${tipEnabled ? suggestedTip : 0}">
                            </label>
                        </div>
                        <div id="splitPaymentFields" class="split-payment-fields hidden">
                            <p class="muted">Ingresa los montos por metodo.</p>
                            <label>
                                Efectivo
                                <input id="splitCash" type="number" min="0" step="1" value="0">
                            </label>
                            <label>
                                Tarjeta
                                <input id="splitCard" type="number" min="0" step="1" value="0">
                            </label>
                            <label>
                                Transferencia
                                <input id="splitTransfer" type="number" min="0" step="1" value="0">
                            </label>
                            <p id="splitPaymentSummary" class="muted">Pendiente: ${api.money(totalValue)}</p>
                        </div>
                        <p id="paymentModalError" class="text-error hidden"></p>
                        <div class="action-row">
                            <button type="button" class="btn btn-outline" data-action="cancel">Cancelar</button>
                            <button type="submit" class="btn btn-primary">Confirmar cobro</button>
                        </div>
                    </form>
                </div>
            `;

            const form = overlay.querySelector("form");
            const select = overlay.querySelector("#paymentMethodSelect");
            const cancelButton = overlay.querySelector("[data-action='cancel']");
            const splitFields = overlay.querySelector("#splitPaymentFields");
            const splitCash = overlay.querySelector("#splitCash");
            const splitCard = overlay.querySelector("#splitCard");
            const splitTransfer = overlay.querySelector("#splitTransfer");
            const splitSummary = overlay.querySelector("#splitPaymentSummary");
            const modalError = overlay.querySelector("#paymentModalError");
            const tipInput = overlay.querySelector("#tipAmount");
            let closed = false;

            function close(value) {
                if (closed) {
                    return;
                }
                closed = true;
                document.removeEventListener("keydown", onKeyDown);
                overlay.remove();
                resolve(value);
            }

            function showError(message) {
                modalError.textContent = message;
                modalError.classList.remove("hidden");
            }

            function hideError() {
                modalError.textContent = "";
                modalError.classList.add("hidden");
            }

            function readAmount(input) {
                const value = Number(input.value || 0);
                if (!Number.isFinite(value) || value <= 0) {
                    return 0;
                }
                return Math.round(value * 100) / 100;
            }

            function readTipAmount() {
                if (!tipEnabled || !tipInput) {
                    return 0;
                }
                const value = Number(tipInput.value || 0);
                if (!Number.isFinite(value) || value <= 0) {
                    return 0;
                }
                return Math.round(value * 100) / 100;
            }

            function splitTotal() {
                return readAmount(splitCash) + readAmount(splitCard) + readAmount(splitTransfer);
            }

            function updateSplitSummary() {
                const paid = splitTotal();
                const diff = Math.round((totalValue - paid) * 100) / 100;
                if (Math.abs(diff) <= 0.01) {
                    splitSummary.textContent = `Total completo: ${api.money(totalValue)}`;
                    syncSplitLocks();
                    return;
                }
                if (diff > 0) {
                    splitSummary.textContent = `Falta por asignar: ${api.money(diff)}`;
                    syncSplitLocks();
                    return;
                }
                splitSummary.textContent = `Exceso asignado: ${api.money(Math.abs(diff))}`;
                syncSplitLocks();
            }

            function syncSplitLocks() {
                const paid = splitTotal();
                const diff = Math.round((totalValue - paid) * 100) / 100;
                const isComplete = Math.abs(diff) <= 0.01;
                [splitCash, splitCard, splitTransfer].forEach((input) => {
                    const amount = readAmount(input);
                    input.disabled = isComplete && amount <= 0;
                });
            }

            function toggleSplitFields() {
                const mixed = select.value === "mixto";
                splitFields.classList.toggle("hidden", !mixed);
                if (mixed) {
                    updateSplitSummary();
                } else {
                    [splitCash, splitCard, splitTransfer].forEach((input) => {
                        input.disabled = false;
                    });
                    hideError();
                }
            }

            function onKeyDown(event) {
                if (event.key === "Escape") {
                    close(null);
                }
            }

            overlay.addEventListener("click", (event) => {
                if (event.target === overlay) {
                    close(null);
                }
            });

            cancelButton.addEventListener("click", () => close(null));
            select.addEventListener("change", toggleSplitFields);
            [splitCash, splitCard, splitTransfer].forEach((input) => {
                input.addEventListener("input", () => {
                    hideError();
                    updateSplitSummary();
                });
            });

            form.addEventListener("submit", (event) => {
                event.preventDefault();
                hideError();
                const method = select.value || "efectivo";
                if (method !== "mixto") {
                    close({ metodo: method, propina: readTipAmount() });
                    return;
                }

                const rows = [];
                const cash = readAmount(splitCash);
                const card = readAmount(splitCard);
                const transfer = readAmount(splitTransfer);

                if (cash > 0) {
                    rows.push({ metodo: "efectivo", monto: cash });
                }
                if (card > 0) {
                    rows.push({ metodo: "tarjeta", monto: card });
                }
                if (transfer > 0) {
                    rows.push({ metodo: "transferencia", monto: transfer });
                }

                if (rows.length === 0) {
                    showError("Ingresa al menos un monto para pago mixto.");
                    return;
                }

                const paid = Math.round((cash + card + transfer) * 100) / 100;
                if (Math.abs(paid - totalValue) > 0.01) {
                    showError(`La suma debe ser ${api.money(totalValue)}.`);
                    return;
                }

                close({
                    metodo: "mixto",
                    pagos: rows,
                    propina: readTipAmount()
                });
            });

            document.addEventListener("keydown", onKeyDown);
            document.body.appendChild(overlay);
            toggleSplitFields();
            select.focus();
        });
    }

    function todayKey() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function toast(message, type) {
        refs.toast.textContent = message;
        refs.toast.className = `toast show ${type === "error" ? "error" : "ok"}`;
        window.setTimeout(() => {
            refs.toast.className = "toast";
        }, 3200);
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
})();
