(function () {
    const api = window.ComandaAPI;
    if (!api) {
        return;
    }

    const state = {
        mesaNumero: null,
        viewMode: "selector",
        menu: {},
        dailyMenuInfo: null,
        currentUser: null,
        tipEnabled: true,
        tipPercent: 10,
        cashOpen: true,
        productsById: new Map(),
        cart: new Map(),
        plateConfigsByProductId: new Map(),
        mesas: [],
        timer: null,
        kitchenReadyByComanda: new Map(),
        readySeenByComanda: new Map(),
        kitchenPopupQueue: [],
        kitchenPopupActive: false,
        kitchenPopupTimer: null,
        kitchenPopupToken: 0,
        audioContext: null,
        audioUnlocked: false,
        mesasConfiguredCount: 0,
        currentComandaItemCount: 0,
        currentComandaTotal: 0
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
        bindAudioPriming();
        updateViewMode();
        renderMesaCards();
        paintMesaStatus();

        await Promise.all([loadMenu(), loadMesas(), loadChargeConfig(true), loadTipSummary(true)]);

        state.timer = window.setInterval(async () => {
            await Promise.all([
                loadMenu(true),
                loadMesas(true),
                loadChargeConfig(true),
                loadTipSummary(true),
                state.viewMode === "pedido" ? refreshComanda(true) : Promise.resolve()
            ]);
        }, 5000);
    }

    function bindRefs() {
        refs.mesaSelectorPanel = document.getElementById("mesaSelectorPanel");
        refs.mesaOrderHeader = document.getElementById("mesaOrderHeader");
        refs.meseroMesasGrid = document.getElementById("meseroMesasGrid");
        refs.mesasLibresCount = document.getElementById("mesasLibresCount");
        refs.mesasOcupadasCount = document.getElementById("mesasOcupadasCount");
        refs.selectedMesaTitle = document.getElementById("selectedMesaTitle");
        refs.btnBackToMesas = document.getElementById("btnBackToMesas");
        refs.btnRefrescarMesa = document.getElementById("btnRefrescarMesa");
        refs.mesaEstado = document.getElementById("mesaEstado");

        refs.panelMenu = document.getElementById("panelMenu");
        refs.panelCart = document.getElementById("panelCart");
        refs.panelComanda = document.getElementById("panelComanda");

        refs.menuMount = document.getElementById("menuMount");
        refs.cartList = document.getElementById("cartList");
        refs.cartEmpty = document.getElementById("cartEmpty");
        refs.btnEnviarPedido = document.getElementById("btnEnviarPedido");
        refs.comandaItems = document.getElementById("comandaItems");
        refs.comandaTotal = document.getElementById("comandaTotal");
        refs.btnImprimirPrecuenta = document.getElementById("btnImprimirPrecuenta");
        refs.btnCobrarMesa = document.getElementById("btnCobrarMesa");

        refs.tipsSummaryText = document.getElementById("tipsSummaryText");
        refs.tipsSummaryDate = document.getElementById("tipsSummaryDate");
        refs.toast = document.getElementById("toast");
        refs.currentUserLabel = document.getElementById("currentUserLabel");
        refs.btnLogout = document.getElementById("btnLogout");

        refs.kitchenReadyPopup = document.getElementById("kitchenReadyPopup");
        refs.kitchenReadyText = document.getElementById("kitchenReadyText");
        refs.kitchenReadyItems = document.getElementById("kitchenReadyItems");
        refs.btnKitchenReadyClose = document.getElementById("btnKitchenReadyClose");
    }

    function bindEvents() {
        if (refs.meseroMesasGrid) {
            refs.meseroMesasGrid.addEventListener("click", async (event) => {
                const card = event.target.closest("button[data-mesa]");
                if (!card) {
                    return;
                }
                if (card.disabled) {
                    return;
                }
                const mesaNumero = Number(card.dataset.mesa || 0);
                if (mesaNumero <= 0) {
                    return;
                }
                await openMesaView(mesaNumero);
            });
        }

        if (refs.btnBackToMesas) {
            refs.btnBackToMesas.addEventListener("click", () => {
                state.viewMode = "selector";
                updateViewMode();
                renderMesaCards();
            });
        }

        if (refs.btnRefrescarMesa) {
            refs.btnRefrescarMesa.addEventListener("click", async () => {
                await Promise.all([
                    loadMenu(true),
                    loadMesas(),
                    loadTipSummary(true),
                    state.viewMode === "pedido" ? refreshComanda(true) : Promise.resolve()
                ]);
                toast("Datos actualizados.");
            });
        }

        if (refs.menuMount) {
            refs.menuMount.addEventListener("click", (event) => {
                const button = event.target.closest("button[data-action]");
                if (!button) {
                    return;
                }

                const id = Number(button.dataset.id || 0);
                if (!id) {
                    return;
                }

                handleMenuQtyAction(id, String(button.dataset.action || "").trim());
            });
        }

        if (refs.cartList) {
            refs.cartList.addEventListener("click", (event) => {
                const button = event.target.closest("button[data-remove]");
                if (!button) {
                    return;
                }
                const id = Number(button.dataset.remove || 0);
                if (id) {
                    clearCartItem(id);
                    renderCart();
                    renderMenu();
                }
            });
        }

        if (refs.comandaItems) {
            refs.comandaItems.addEventListener("click", (event) => {
                const button = event.target.closest("button[data-comanda-remove]");
                if (!button) {
                    return;
                }
                const itemId = Number(button.dataset.comandaRemove || 0);
                if (itemId <= 0) {
                    return;
                }
                void removeComandaItem(itemId);
            });
        }

        if (refs.btnEnviarPedido) {
            refs.btnEnviarPedido.addEventListener("click", sendOrder);
        }

        if (refs.btnImprimirPrecuenta) {
            refs.btnImprimirPrecuenta.addEventListener("click", printBill);
        }

        if (refs.btnCobrarMesa) {
            refs.btnCobrarMesa.addEventListener("click", chargeTable);
        }

        if (refs.btnLogout) {
            refs.btnLogout.addEventListener("click", logout);
        }

        if (refs.btnKitchenReadyClose) {
            refs.btnKitchenReadyClose.addEventListener("click", closeKitchenReadyPopup);
        }
    }

    async function ensureSession() {
        try {
            const session = await api.session();
            if (!session || !session.logged || !session.user) {
                window.location.href = "login.html";
                return null;
            }
            const role = normalizeRole(session.user.rol);
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
            // Continua con redireccion aunque falle logout remoto.
        }
        window.location.href = "login.html";
    }

    function updateViewMode() {
        const inOrder = state.viewMode === "pedido" && Number(state.mesaNumero) > 0;

        if (refs.mesaSelectorPanel) {
            refs.mesaSelectorPanel.classList.toggle("hidden", inOrder);
        }
        if (refs.mesaOrderHeader) {
            refs.mesaOrderHeader.classList.toggle("hidden", !inOrder);
        }
        if (refs.panelMenu) {
            refs.panelMenu.classList.toggle("hidden", !inOrder);
        }
        if (refs.panelCart) {
            refs.panelCart.classList.toggle("hidden", !inOrder);
        }
        if (refs.panelComanda) {
            refs.panelComanda.classList.toggle("hidden", !inOrder);
        }

        if (refs.selectedMesaTitle) {
            refs.selectedMesaTitle.textContent = inOrder ? `Mesa ${state.mesaNumero}` : "Mesa -";
        }
    }

    async function openMesaView(mesaNumero) {
        const nextMesa = Number(mesaNumero || 0);
        if (nextMesa <= 0) {
            return;
        }

        acknowledgeReadyForMesa(nextMesa);
        const changedMesa = Number(state.mesaNumero || 0) !== nextMesa;
        state.mesaNumero = nextMesa;
        state.viewMode = "pedido";
        if (changedMesa) {
            state.cart.clear();
            state.plateConfigsByProductId.clear();
            renderCart();
            renderMenu();
        }
        updateViewMode();
        paintMesaStatus();
        await refreshComanda();
        window.scrollTo({ top: 0, behavior: "smooth" });
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
                const normalizedId = Number(productId);
                if (!state.productsById.has(normalizedId)) {
                    clearCartItem(normalizedId);
                    return;
                }

                const product = state.productsById.get(normalizedId);
                if (!productRequiresAddon(product)) {
                    state.plateConfigsByProductId.delete(normalizedId);
                    return;
                }

                const qty = getQty(normalizedId);
                const trimmed = getPlateConfigs(normalizedId).slice(0, Math.max(0, qty));
                if (trimmed.length === 0) {
                    state.plateConfigsByProductId.delete(normalizedId);
                } else {
                    state.plateConfigsByProductId.set(normalizedId, trimmed);
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
            const nextMesas = await api.getMesas();
            state.mesas = Array.isArray(nextMesas) ? nextMesas : [];
            pruneReadySeenByComanda(state.mesas);
            handleKitchenReadyTransitions(state.mesas);
            renderMesaCards();
            paintMesaStatus();

            if (state.viewMode === "pedido" && Number(state.mesaNumero) > 0) {
                const mesasSelector = buildMesaSelectorList();
                const exists = mesasSelector.some((mesa) => Number(mesa.numero) === Number(state.mesaNumero));
                if (!exists) {
                    state.viewMode = "selector";
                    state.mesaNumero = null;
                    updateViewMode();
                }
            }
        } catch (error) {
            renderMesaCards();
            paintMesaStatus();
            if (!silent) {
                toast(error.message, "error");
            }
        }
    }

    function handleKitchenReadyTransitions(nextMesas) {
        const activeComandas = new Set();

        (nextMesas || []).forEach((mesa) => {
            const comandaId = Number(mesa.comanda_id || 0);
            if (comandaId <= 0) {
                return;
            }

            activeComandas.add(comandaId);
            const isReady = Number(mesa.comanda_cocina_lista || 0) === 1;
            const wasReady = state.kitchenReadyByComanda.get(comandaId) === true;
            if (isReady && !wasReady && canNotifyKitchenReady(mesa)) {
                queueKitchenReadyAlert({
                    mesaNumero: Number(mesa.numero || 0),
                    comandaId,
                    comandaMeseroId: Number(mesa.comanda_mesero_id || 0)
                });
            }
            state.kitchenReadyByComanda.set(comandaId, isReady);
        });

        for (const comandaId of state.kitchenReadyByComanda.keys()) {
            if (!activeComandas.has(Number(comandaId))) {
                state.kitchenReadyByComanda.delete(Number(comandaId));
            }
        }
    }

    function canNotifyKitchenReady(mesa) {
        const role = normalizeRole(state.currentUser ? state.currentUser.rol : "");
        if (role === "admin") {
            return true;
        }
        if (role !== "mesero") {
            return false;
        }

        const currentUserId = Number(state.currentUser && state.currentUser.id ? state.currentUser.id : 0);
        const ownerUserId = Number(mesa && mesa.comanda_mesero_id ? mesa.comanda_mesero_id : 0);
        if (currentUserId <= 0 || ownerUserId <= 0) {
            return false;
        }
        return currentUserId === ownerUserId;
    }

    function queueKitchenReadyAlert(payload) {
        const mesaNumero = Number(payload && payload.mesaNumero ? payload.mesaNumero : 0);
        const comandaId = Number(payload && payload.comandaId ? payload.comandaId : 0);
        if (mesaNumero <= 0 || comandaId <= 0) {
            return;
        }
        state.kitchenPopupQueue.push({
            mesaNumero,
            comandaId,
            comandaMeseroId: Number(payload.comandaMeseroId || 0)
        });
        playKitchenReadySound();
        void maybeShowNextKitchenPopup();
    }

    async function maybeShowNextKitchenPopup() {
        if (state.kitchenPopupActive) {
            return;
        }
        const alertPayload = state.kitchenPopupQueue.shift();
        if (!alertPayload) {
            return;
        }
        const mesaNumero = Number(alertPayload.mesaNumero || 0);
        if (mesaNumero <= 0) {
            void maybeShowNextKitchenPopup();
            return;
        }

        state.kitchenPopupActive = true;
        const popupToken = Date.now() + Math.random();
        state.kitchenPopupToken = popupToken;
        if (refs.kitchenReadyText) {
            refs.kitchenReadyText.textContent = `La cocina marco lista la mesa ${mesaNumero}.`;
        }
        renderKitchenReadyItems([], "Cargando detalle del pedido...");
        if (refs.kitchenReadyPopup) {
            refs.kitchenReadyPopup.classList.remove("hidden");
        }

        const detailedItems = await getKitchenReadyItems(mesaNumero);
        if (!state.kitchenPopupActive || state.kitchenPopupToken !== popupToken) {
            return;
        }
        renderKitchenReadyItems(detailedItems, "Sin detalle de productos.");

        toast(`Mesa ${mesaNumero} lista en cocina.`);

        if (state.kitchenPopupTimer) {
            window.clearTimeout(state.kitchenPopupTimer);
        }
        state.kitchenPopupTimer = window.setTimeout(() => {
            closeKitchenReadyPopup();
        }, 11000);
    }

    function closeKitchenReadyPopup() {
        if (refs.kitchenReadyPopup) {
            refs.kitchenReadyPopup.classList.add("hidden");
        }
        if (state.kitchenPopupTimer) {
            window.clearTimeout(state.kitchenPopupTimer);
            state.kitchenPopupTimer = null;
        }
        state.kitchenPopupActive = false;
        state.kitchenPopupToken = 0;
        void maybeShowNextKitchenPopup();
    }

    function bindAudioPriming() {
        const primeOnce = () => {
            void unlockAudioContext();
            if (state.audioUnlocked) {
                document.removeEventListener("touchstart", primeOnce, true);
                document.removeEventListener("pointerdown", primeOnce, true);
                document.removeEventListener("keydown", primeOnce, true);
            }
        };

        document.addEventListener("touchstart", primeOnce, true);
        document.addEventListener("pointerdown", primeOnce, true);
        document.addEventListener("keydown", primeOnce, true);
    }

    async function unlockAudioContext() {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) {
            return false;
        }

        try {
            if (!state.audioContext) {
                state.audioContext = new AudioCtx();
            }
            const ctx = state.audioContext;
            if (ctx.state === "suspended") {
                await ctx.resume();
            }
            if (ctx.state !== "running") {
                return false;
            }

            const start = ctx.currentTime + 0.01;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(880, start);
            gain.gain.setValueAtTime(0.00001, start);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.015);
            state.audioUnlocked = true;
            return true;
        } catch (error) {
            return false;
        }
    }

    function pruneReadySeenByComanda(mesas) {
        const activeComandas = new Set();
        (Array.isArray(mesas) ? mesas : []).forEach((mesa) => {
            const comandaId = Number(mesa && mesa.comanda_id ? mesa.comanda_id : 0);
            if (comandaId > 0) {
                activeComandas.add(comandaId);
            }
        });

        for (const key of state.readySeenByComanda.keys()) {
            if (!activeComandas.has(Number(key))) {
                state.readySeenByComanda.delete(Number(key));
            }
        }
    }

    function acknowledgeReadyForMesa(mesaNumero) {
        const targetMesa = Number(mesaNumero || 0);
        if (targetMesa <= 0) {
            return;
        }

        const mesa = buildMesaSelectorList().find((item) => Number(item.numero || 0) === targetMesa);
        if (!mesa) {
            return;
        }

        const comandaId = Number(mesa.comanda_id || 0);
        if (comandaId <= 0) {
            return;
        }

        const readyItems = Math.max(0, Number(mesa.comanda_items_listos || 0));
        state.readySeenByComanda.set(comandaId, readyItems);
    }

    function playKitchenReadySound() {
        void unlockAudioContext();
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) {
            return;
        }

        try {
            if (!state.audioContext) {
                state.audioContext = new AudioCtx();
            }
            const ctx = state.audioContext;
            if (ctx.state === "suspended") {
                ctx.resume().catch(() => {});
            }
            if (ctx.state !== "running") {
                if (window.navigator && typeof window.navigator.vibrate === "function") {
                    window.navigator.vibrate([180, 90, 260, 90, 340]);
                }
                return;
            }

            const start = ctx.currentTime + 0.02;
            const master = ctx.createGain();
            master.gain.setValueAtTime(0.65, start);
            master.connect(ctx.destination);

            const sequence = [
                { freq: 980, dur: 0.2 },
                { freq: 1320, dur: 0.22 },
                { freq: 980, dur: 0.2 },
                { freq: 1320, dur: 0.22 },
                { freq: 980, dur: 0.22 }
            ];
            let cursor = start;

            sequence.forEach((step) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "square";
                osc.frequency.setValueAtTime(step.freq, cursor);

                gain.gain.setValueAtTime(0.0001, cursor);
                gain.gain.exponentialRampToValueAtTime(0.45, cursor + 0.015);
                gain.gain.exponentialRampToValueAtTime(0.0001, cursor + step.dur);

                osc.connect(gain);
                gain.connect(master);
                osc.start(cursor);
                osc.stop(cursor + step.dur + 0.02);
                cursor += step.dur + 0.05;
            });

            if (window.navigator && typeof window.navigator.vibrate === "function") {
                window.navigator.vibrate([160, 70, 220, 70, 280]);
            }
        } catch (error) {
            // Silencia errores de audio para no romper flujo.
        }
    }

    async function getKitchenReadyItems(mesaNumero) {
        try {
            const snapshot = await api.getComanda(mesaNumero);
            const sourceItems = Array.isArray(snapshot && snapshot.items) ? snapshot.items : [];
            return sourceItems.map((item) => ({
                descripcion: String(item && item.descripcion ? item.descripcion : ""),
                cantidad: Number(item && item.cantidad ? item.cantidad : 0),
                notas: String(item && item.notas ? item.notas : "")
            }));
        } catch (error) {
            return [];
        }
    }

    function renderKitchenReadyItems(items, emptyMessage) {
        if (!refs.kitchenReadyItems) {
            return;
        }

        const list = Array.isArray(items) ? items.filter((item) => String(item.descripcion || "").trim()) : [];
        if (list.length === 0) {
            refs.kitchenReadyItems.innerHTML = `<p class="kitchen-ready-empty">${escapeHtml(emptyMessage || "Sin detalle de productos.")}</p>`;
            return;
        }

        refs.kitchenReadyItems.innerHTML = list
            .map((item) => {
                const qty = Number(item.cantidad || 0);
                const note = String(item.notas || "").trim();
                const noteHtml = note ? `<small>Nota: ${escapeHtml(note)}</small>` : "";
                return `
                    <div class="kitchen-ready-item">
                        <div>
                            <strong>${qty > 0 ? `${qty} x ` : ""}${escapeHtml(item.descripcion)}</strong>
                            ${noteHtml}
                        </div>
                    </div>
                `;
            })
            .join("");
    }

    function isBeverageItem(item) {
        const category = String(item && item.categoria ? item.categoria : "").trim();
        if (!category) {
            return false;
        }
        const token = normalizeCategoryToken(category);
        if (!token) {
            return false;
        }
        return token.includes("beb")
            || ["jugo", "jugos", "refresco", "refrescos", "gaseosa", "gaseosas", "agua", "aguamineral"].includes(token);
    }

    function normalizeMenuCategoryLabel(category) {
        const token = normalizeCategoryToken(category);
        if (!token) {
            return "Platos";
        }
        if (token.includes("beb") || ["jugo", "jugos", "refresco", "refrescos", "gaseosa", "gaseosas", "agua", "aguamineral"].includes(token)) {
            return "Bebestibles";
        }
        if (token.includes("extra") || token.includes("adic") || token.includes("complement")) {
            return "Extras";
        }
        if (token.includes("otro")) {
            return "Otros";
        }
        if (token.includes("agreg")
            || token.includes("acompan")
            || token.includes("guarn")
            || token.includes("post")
            || token.includes("dulce")
            || token.includes("helad")
            || token.includes("torta")) {
            return "Agregados";
        }
        return "Platos";
    }

    function isPlateItem(item) {
        const category = String(item && item.categoria ? item.categoria : "").trim();
        return normalizeMenuCategoryLabel(category) === "Platos";
    }

    function productRequiresAddon(item) {
        return isPlateItem(item) && Number(item && item.requiere_agregado ? item.requiere_agregado : 0) === 1;
    }

    function isAddonCategory(category) {
        return normalizeMenuCategoryLabel(category) === "Agregados";
    }

    function isHiddenAddonCategory(category) {
        return normalizeMenuCategoryLabel(category) === "Agregados";
    }

    function isAddonItem(item) {
        const category = String(item && item.categoria ? item.categoria : "").trim();
        return isAddonCategory(category);
    }

    function getProductsByCategory(categoryLabel) {
        const list = [];
        const seen = new Set();

        Object.entries(state.menu || {}).forEach(([groupCategory, products]) => {
            const normalizedGroup = normalizeMenuCategoryLabel(groupCategory);
            const groupMatches = normalizedGroup === categoryLabel;
            (Array.isArray(products) ? products : []).forEach((product) => {
                if (!product || typeof product !== "object") {
                    return;
                }
                const productId = Number(product.id || 0);
                if (productId <= 0 || seen.has(productId)) {
                    return;
                }
                const normalizedProduct = normalizeMenuCategoryLabel(product.categoria);
                if (!groupMatches && normalizedProduct !== categoryLabel) {
                    return;
                }
                seen.add(productId);
                list.push({
                    id: productId,
                    nombre: String(product.nombre || "").trim(),
                    precio: Number(product.precio || 0)
                });
            });
        });

        return list.sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
    }

    function getAddonProducts() {
        return getProductsByCategory("Agregados");
    }

    function normalizePlateConfig(value) {
        if (value && typeof value === "object") {
            const agregado = String(value.agregado || value.side || "").trim();
            if (!agregado) {
                return null;
            }
            const extras = (Array.isArray(value.extras) ? value.extras : [])
                .map((entry) => String(entry || "").trim())
                .filter((entry) => entry !== "");
            return { agregado, extras };
        }
        const legacyAgregado = String(value || "").trim();
        if (!legacyAgregado) {
            return null;
        }
        return { agregado: legacyAgregado, extras: [] };
    }

    function getPlateConfigs(productId) {
        const source = state.plateConfigsByProductId.get(Number(productId));
        if (!Array.isArray(source)) {
            return [];
        }
        const normalized = source
            .map((entry) => normalizePlateConfig(entry))
            .filter((entry) => entry && entry.agregado);
        return normalized;
    }

    function summarizePlateConfigs(productId, qty) {
        const expected = Math.max(0, Number(qty || 0));
        if (expected <= 0) {
            return "";
        }

        const assigned = getPlateConfigs(productId).slice(0, expected);
        if (assigned.length === 0) {
            return "Agregado pendiente.";
        }

        if (assigned.length < expected) {
            const missing = expected - assigned.length;
            return `Agregados asignados: ${assigned.length}/${expected}. Faltan ${missing}.`;
        }

        return assigned
            .map((config, index) => {
                const extrasText = config.extras.length > 0 ? ` + Extras: ${config.extras.join(", ")}` : "";
                return `#${index + 1} ${config.agregado}${extrasText}`;
            })
            .join(" | ");
    }

    function buildAddonPromptText(productName, addonProducts) {
        const lines = addonProducts.map((item, index) => `${index + 1}. ${item.nombre}`);
        return [
            `Selecciona el agregado para "${productName}".`,
            "Escribe el numero o el nombre exacto.",
            "",
            ...lines
        ].join("\n");
    }

    function promptAddonForPlate(product) {
        const productName = String(product && product.nombre ? product.nombre : "plato").trim() || "plato";
        const addonProducts = getAddonProducts();
        if (addonProducts.length === 0) {
            const manualValue = window.prompt(`No hay agregados configurados. Escribe el agregado para "${productName}":`, "");
            if (manualValue === null) {
                return null;
            }
            const cleanedManual = String(manualValue || "").trim();
            if (!cleanedManual) {
                toast("Debes indicar un agregado para el plato.", "error");
                return null;
            }
            return cleanedManual;
        }

        const promptText = buildAddonPromptText(productName, addonProducts);
        while (true) {
            const answer = window.prompt(promptText, "1");
            if (answer === null) {
                return null;
            }

            const cleaned = String(answer || "").trim();
            if (!cleaned) {
                window.alert("Debes indicar un agregado.");
                continue;
            }

            const asNumber = Number.parseInt(cleaned, 10);
            if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= addonProducts.length) {
                return addonProducts[asNumber - 1].nombre;
            }

            const normalized = normalizeCategoryToken(cleaned);
            const found = addonProducts.find((item) => normalizeCategoryToken(item.nombre) === normalized);
            if (found) {
                return found.nombre;
            }

            window.alert("Agregado invalido. Escribe un numero o nombre de la lista.");
        }
    }

    function promptPlateConfig(product) {
        const agregado = promptAddonForPlate(product);
        if (!agregado) {
            return null;
        }
        return {
            agregado,
            extras: []
        };
    }

    function clearCartItem(productId) {
        const normalizedId = Number(productId || 0);
        if (normalizedId <= 0) {
            return;
        }
        state.cart.delete(normalizedId);
        state.plateConfigsByProductId.delete(normalizedId);
    }

    function handleMenuQtyAction(productId, action) {
        const normalizedId = Number(productId || 0);
        if (normalizedId <= 0) {
            return;
        }

        const product = state.productsById.get(normalizedId);
        if (!product) {
            return;
        }

        if (action === "inc") {
            if (isAddonItem(product)) {
                toast("Los agregados se eligen al sumar un plato que los pida.", "error");
                return;
            }
            if (productRequiresAddon(product)) {
                const config = promptPlateConfig(product);
                if (!config) {
                    return;
                }
                const currentConfigs = getPlateConfigs(normalizedId);
                currentConfigs.push(config);
                state.plateConfigsByProductId.set(normalizedId, currentConfigs);
                state.cart.set(normalizedId, getQty(normalizedId) + 1);
                renderMenu();
                renderCart();
                return;
            }

            setQty(normalizedId, getQty(normalizedId) + 1);
            return;
        }

        if (action === "dec") {
            if (productRequiresAddon(product)) {
                const currentQty = getQty(normalizedId);
                if (currentQty <= 0) {
                    return;
                }
                const nextQty = currentQty - 1;
                if (nextQty <= 0) {
                    clearCartItem(normalizedId);
                } else {
                    state.cart.set(normalizedId, nextQty);
                    const currentConfigs = getPlateConfigs(normalizedId).slice(0, nextQty);
                    if (currentConfigs.length === 0) {
                        state.plateConfigsByProductId.delete(normalizedId);
                    } else {
                        state.plateConfigsByProductId.set(normalizedId, currentConfigs);
                    }
                }
                renderMenu();
                renderCart();
                return;
            }

            setQty(normalizedId, getQty(normalizedId) - 1);
        }
    }

    function normalizeCategoryToken(value) {
        return String(value || "")
            .toLowerCase()
            .trim()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "");
    }

    async function loadChargeConfig(silent) {
        try {
            const data = await api.getChargeConfig();
            state.tipEnabled = Boolean(data.propina_habilitada !== false && Number(data.propina_habilitada || 0) !== 0);
            const percent = Number(data.propina_porcentaje || 10);
            state.tipPercent = Number.isFinite(percent) && percent >= 0 ? percent : 10;
            const mesasCantidad = Number(data.mesas_cantidad || 0);
            if (Number.isInteger(mesasCantidad) && mesasCantidad > 0) {
                state.mesasConfiguredCount = mesasCantidad;
            }
            renderMesaCards();
            paintMesaStatus();
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

        try {
            const status = await api.getCashStatus();
            const summary = status && status.resumen ? status.resumen : {};
            const totalTips = Number(summary.propinas_total || 0);
            state.cashOpen = Boolean(status && status.abierta);
            updateChargeButton(state.currentComandaItemCount > 0 && state.currentComandaTotal > 0);

            refs.tipsSummaryText.innerHTML = `<strong>Total Propina: ${api.money(totalTips)}</strong>`;
            if (status && status.abierta) {
                const openedAt = status.sesion && status.sesion.abierta_en ? status.sesion.abierta_en : "";
                refs.tipsSummaryDate.textContent = openedAt
                    ? `Sesion de caja: ${formatDateTimeLabel(openedAt)}`
                    : "Sesion de caja abierta";
            } else {
                refs.tipsSummaryDate.textContent = "Caja cerrada: propina reiniciada";
            }
            renderMesaCards();
            paintMesaStatus();

            if (!silent) {
                toast("Propinas actualizadas.");
            }
        } catch (error) {
            if (!silent) {
                toast(error.message, "error");
            }
        }
    }

    function formatDateTimeLabel(value) {
        const raw = String(value || "").trim();
        if (!raw) {
            return "-";
        }
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) {
            return raw;
        }
        const day = String(parsed.getDate()).padStart(2, "0");
        const month = String(parsed.getMonth() + 1).padStart(2, "0");
        const year = parsed.getFullYear();
        const hours = String(parsed.getHours()).padStart(2, "0");
        const minutes = String(parsed.getMinutes()).padStart(2, "0");
        return `${day}-${month}-${year} ${hours}:${minutes}`;
    }

    function renderMesaCards() {
        if (!refs.meseroMesasGrid) {
            return;
        }

        const role = normalizeRole(state.currentUser && state.currentUser.rol ? state.currentUser.rol : "");
        const mesasEnabled = role === "mesero" ? Boolean(state.cashOpen) : true;
        const mesas = buildMesaSelectorList();
        renderMesaCounters(mesas);
        refs.meseroMesasGrid.innerHTML = mesas
            .map((mesa) => {
                const mesaNumero = Number(mesa.numero || 0);
                const comandaId = Number(mesa.comanda_id || 0);
                const hasOrder = Number(mesa.comanda_id || 0) > 0 && Number(mesa.total_items || 0) > 0;
                const kitchenReady = Number(mesa.comanda_cocina_lista || 0) === 1 && Number(mesa.comanda_id || 0) > 0;
                const readyItems = Math.max(0, Number(mesa.comanda_items_listos || 0));
                const readySeen = comandaId > 0 ? Math.max(0, Number(state.readySeenByComanda.get(comandaId) || 0)) : 0;
                const readyPending = Math.max(0, readyItems - readySeen);
                const selected = mesaNumero === Number(state.mesaNumero || 0) ? "selected" : "";
                const statusClass = [
                    "mesa-card",
                    mesa.estado === "ocupada" ? "ocupada" : "libre",
                    hasOrder ? "has-order" : "",
                    kitchenReady ? "ready-kitchen" : "",
                    mesasEnabled ? "" : "disabled-mesa",
                    selected
                ].join(" ").trim();

                let badge = `<span class="waiter-status-chip">${mesa.estado === "ocupada" ? "Ocupada" : "Libre"}</span>`;
                if (kitchenReady) {
                    badge = `<span class="waiter-status-chip ready-kitchen">Pedido listo en cocina</span>`;
                } else if (hasOrder) {
                    badge = `<span class="waiter-status-chip has-order">Con pedido</span>`;
                }

                const readyBubble = readyPending > 0
                    ? `<span class="mesa-ready-bubble" title="Items listos: ${readyPending}">${readyPending}</span>`
                    : "";
                const disabled = mesasEnabled ? "" : "disabled";

                return `
                    <button type="button" class="${statusClass}" data-mesa="${mesaNumero}" ${disabled}>
                        ${readyBubble}
                        <strong>Mesa ${mesaNumero}</strong>
                        ${badge}
                        <span>Items: ${Number(mesa.total_items || 0)}</span>
                        <span>Total: ${api.money(mesa.comanda_total || 0)}</span>
                    </button>
                `;
            })
            .join("");
    }

    function renderMesaCounters(mesas) {
        if (!refs.mesasLibresCount && !refs.mesasOcupadasCount) {
            return;
        }

        const source = Array.isArray(mesas) ? mesas : [];
        const ocupadas = source.filter((mesa) => isMesaOcupada(mesa)).length;
        const libres = Math.max(0, source.length - ocupadas);

        if (refs.mesasLibresCount) {
            refs.mesasLibresCount.textContent = `Libres: ${libres}`;
        }
        if (refs.mesasOcupadasCount) {
            refs.mesasOcupadasCount.textContent = `Ocupadas: ${ocupadas}`;
        }
    }

    function isMesaOcupada(mesa) {
        if (!mesa || typeof mesa !== "object") {
            return false;
        }
        if (String(mesa.estado || "").toLowerCase() === "ocupada") {
            return true;
        }
        const hasOrder = Number(mesa.comanda_id || 0) > 0 && Number(mesa.total_items || 0) > 0;
        return hasOrder;
    }

    function buildMesaSelectorList() {
        const mesasDisponibles = Array.isArray(state.mesas) ? state.mesas : [];
        const mesasByNumber = new Map();

        mesasDisponibles.forEach((mesa) => {
            const numero = Number(mesa && mesa.numero ? mesa.numero : 0);
            if (numero > 0 && !mesasByNumber.has(numero)) {
                mesasByNumber.set(numero, mesa);
            }
        });

        const configuredCount = getConfiguredMesaCount();
        const maxDetected = mesasByNumber.size > 0 ? Math.max(...mesasByNumber.keys()) : 0;
        const total = configuredCount > 0
            ? configuredCount
            : (maxDetected > 0 ? maxDetected : 10);

        const mesas = [];
        for (let i = 1; i <= total; i += 1) {
            if (mesasByNumber.has(i)) {
                mesas.push(mesasByNumber.get(i));
            } else {
                mesas.push(defaultMesaState(i));
            }
        }

        return mesas;
    }

    function defaultMesaState(numero) {
        return {
            numero: Number(numero || 0),
            estado: "libre",
            total_items: 0,
            comanda_total: 0,
            comanda_id: null,
            comanda_mesero_id: null,
            comanda_cocina_lista: 0,
            comanda_items_listos: 0
        };
    }

    function getConfiguredMesaCount() {
        const cantidad = Number(state.mesasConfiguredCount || 0);
        if (!Number.isFinite(cantidad) || cantidad <= 0) {
            return 0;
        }
        return Math.floor(cantidad);
    }

    function paintMesaStatus() {
        if (!refs.mesaEstado) {
            return;
        }
        if (Number(state.mesaNumero || 0) <= 0) {
            refs.mesaEstado.textContent = "Estado: -";
            return;
        }

        const mesa = buildMesaSelectorList().find((item) => Number(item.numero) === Number(state.mesaNumero));
        if (!mesa) {
            refs.mesaEstado.textContent = "Estado: sin datos";
            return;
        }

        const base = `Estado: ${mesa.estado || "sin datos"}`;
        if (Number(mesa.comanda_cocina_lista || 0) === 1 && Number(mesa.comanda_id || 0) > 0) {
            refs.mesaEstado.textContent = `${base} - Cocina: pedido listo`;
            return;
        }

        if (Number(mesa.comanda_id || 0) > 0 && Number(mesa.total_items || 0) > 0) {
            const readyCount = Math.max(0, Number(mesa.comanda_items_listos || 0));
            if (readyCount > 0) {
                refs.mesaEstado.textContent = `${base} - Con pedido activo - Listos: ${readyCount}`;
                return;
            }
            refs.mesaEstado.textContent = `${base} - Con pedido activo`;
            return;
        }

        refs.mesaEstado.textContent = base;
    }

    function renderMenu() {
        if (!refs.menuMount) {
            return;
        }

        const allCategories = Object.entries(state.menu || {});
        if (allCategories.length === 0) {
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

        const categories = allCategories
            .filter(([categoria]) => !isHiddenAddonCategory(categoria))
            .sort(compareMenuCategories);
        if (categories.length === 0) {
            refs.menuMount.innerHTML = `<p class="empty-state">No hay platos o bebestibles disponibles.</p>`;
            return;
        }

        const addonProducts = getAddonProducts();
        const hasProductsWithAddon = categories.some(([, products]) => (Array.isArray(products) ? products : []).some((product) => productRequiresAddon(product)));
        const addonsLabel = hasProductsWithAddon && addonProducts.length > 0
            ? `<p class="muted">Agregados disponibles para platos: ${escapeHtml(addonProducts.map((item) => item.nombre).join(", "))}</p>`
            : (hasProductsWithAddon ? `<p class="muted">No hay agregados configurados. Al agregar plato se pedira ingresarlo manualmente.</p>` : "");

        refs.menuMount.innerHTML = `${addonsLabel}${categories
            .map(([categoria, products]) => {
                const cards = products
                    .map((product) => {
                        const id = Number(product.id);
                        const qty = getQty(id);
                        const addonBadge = productRequiresAddon(product)
                            ? `<small class="product-card-note">Pide agregado</small>`
                            : "";
                        return `
                            <article class="product-card">
                                <div>
                                    <h3>${escapeHtml(product.nombre)}</h3>
                                    ${addonBadge}
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
            .join("")}`;
    }

    function compareMenuCategories([categoryA], [categoryB]) {
        const order = {
            Platos: 1,
            Bebestibles: 2,
            Extras: 3,
            Otros: 4
        };
        const normalizedA = normalizeMenuCategoryLabel(categoryA);
        const normalizedB = normalizeMenuCategoryLabel(categoryB);
        const weightA = order[normalizedA] || 20;
        const weightB = order[normalizedB] || 20;
        if (weightA !== weightB) {
            return weightA - weightB;
        }
        return String(categoryA || "").localeCompare(String(categoryB || ""), "es", { sensitivity: "base" });
    }

    function getQty(productId) {
        return Number(state.cart.get(productId) || 0);
    }

    function setQty(productId, qty) {
        const next = Math.max(0, Number(qty || 0));
        if (next <= 0) {
            clearCartItem(productId);
        } else {
            state.cart.set(Number(productId), next);
        }
        renderMenu();
        renderCart();
    }

    function renderCart() {
        if (!refs.cartList || !refs.cartEmpty) {
            return;
        }

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
                const sideSummary = productRequiresAddon(product) ? summarizePlateConfigs(id, qty) : "";
                const sideHtml = sideSummary ? `<small>${escapeHtml(sideSummary)}</small>` : "";
                return `
                    <div class="cart-item">
                        <div>
                            <strong>${escapeHtml(product.nombre)}</strong>
                            <small>${qty} x ${api.money(product.precio)}</small>
                            ${sideHtml}
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
        const mesaNumero = Number(state.mesaNumero || 0);
        if (mesaNumero <= 0) {
            return;
        }

        try {
            const snapshot = await api.getComanda(mesaNumero);
            renderComanda(snapshot);
        } catch (error) {
            if (!silent) {
                toast(error.message, "error");
            }
        }
    }

    function renderComanda(snapshot) {
        if (!refs.comandaItems || !refs.comandaTotal) {
            return;
        }

        if (!snapshot || !snapshot.comanda) {
            state.currentComandaItemCount = 0;
            state.currentComandaTotal = 0;
            refs.comandaItems.innerHTML = `<p class="empty-state">Esta mesa aun no tiene comanda abierta.</p>`;
            refs.comandaTotal.textContent = api.money(0);
            updateChargeButton(false);
            return;
        }

        const items = snapshot.items || [];
        state.currentComandaItemCount = items.length;
        state.currentComandaTotal = Number(snapshot.comanda.total || 0);
        updateChargeButton(state.currentComandaItemCount > 0 && state.currentComandaTotal > 0);
        const canRemove = canRemoveComandaItems();
        if (items.length === 0) {
            refs.comandaItems.innerHTML = `<p class="empty-state">Sin items cargados.</p>`;
        } else {
            refs.comandaItems.innerHTML = items
                .map((item) => {
                    const nota = item.notas ? `<small>Nota: ${escapeHtml(item.notas)}</small>` : "";
                    const removeAction = canRemove
                        ? `<button type="button" class="btn-link" data-comanda-remove="${Number(item.id || 0)}">Quitar</button>`
                        : "";
                    return `
                        <div class="comanda-item">
                            <div>
                                <strong>${item.cantidad} x ${escapeHtml(item.descripcion)}</strong>
                                ${nota}
                            </div>
                            <div class="cart-item-right">
                                <strong>${api.money(item.subtotal)}</strong>
                                ${removeAction}
                            </div>
                        </div>
                    `;
                })
                .join("");
        }

        refs.comandaTotal.textContent = api.money(snapshot.comanda.total || 0);
    }

    async function removeComandaItem(itemId) {
        const roleAllowed = canRemoveComandaItems();
        if (!roleAllowed) {
            toast("No tienes permisos para quitar items de la cuenta.", "error");
            return;
        }

        const mesaNumero = Number(state.mesaNumero || 0);
        if (mesaNumero <= 0) {
            toast("Selecciona una mesa primero.", "error");
            return;
        }

        const normalizedId = Number(itemId || 0);
        if (normalizedId <= 0) {
            return;
        }

        const confirmed = window.confirm("Se quitara este producto de la cuenta. Deseas continuar?");
        if (!confirmed) {
            return;
        }

        try {
            const response = await api.removeComandaItem(normalizedId);
            if (response && response.data) {
                renderComanda(response.data);
            } else {
                await refreshComanda(true);
            }
            await loadMesas(true);
            paintMesaStatus();
            toast(response && response.mensaje ? response.mensaje : "Producto eliminado de la cuenta.");
        } catch (error) {
            toast(error.message, "error");
        }
    }

    function canRemoveComandaItems() {
        const role = normalizeRole(state.currentUser ? state.currentUser.rol : "");
        return role === "mesero" || role === "admin";
    }

    async function sendOrder() {
        const mesaNumero = Number(state.mesaNumero || 0);
        if (mesaNumero <= 0) {
            toast("Selecciona una mesa primero.", "error");
            state.viewMode = "selector";
            updateViewMode();
            return;
        }

        const items = [];
        for (const [productId, qtyValue] of state.cart.entries()) {
            const normalizedId = Number(productId || 0);
            const qty = Number(qtyValue || 0);
            if (normalizedId <= 0 || qty <= 0) {
                continue;
            }

            const product = state.productsById.get(normalizedId);
            if (!product) {
                continue;
            }

            if (productRequiresAddon(product)) {
                const configs = getPlateConfigs(normalizedId).slice(0, qty);
                if (configs.length < qty) {
                    toast(`Faltan agregados para ${product.nombre}.`, "error");
                    return;
                }

                for (let i = 0; i < qty; i += 1) {
                    const config = normalizePlateConfig(configs[i]);
                    if (!config || !config.agregado) {
                        toast(`Faltan configuraciones de agregado para ${product.nombre}.`, "error");
                        return;
                    }
                    const noteParts = [`Agregado: ${config.agregado}`];
                    if (Array.isArray(config.extras) && config.extras.length > 0) {
                        noteParts.push(`Extras: ${config.extras.join(", ")}`);
                    }
                    items.push({
                        producto_id: normalizedId,
                        cantidad: 1,
                        notas: noteParts.join(" | ")
                    });
                }
                continue;
            }

            items.push({
                producto_id: normalizedId,
                cantidad: qty
            });
        }

        if (items.length === 0) {
            toast("Agrega al menos un producto.", "error");
            return;
        }

        if (refs.btnEnviarPedido) {
            refs.btnEnviarPedido.disabled = true;
        }
        try {
            const response = await api.sendOrder(mesaNumero, items, "movil");
            state.cart.clear();
            state.plateConfigsByProductId.clear();
            renderCart();
            renderMenu();
            await loadMesas(true);

            state.viewMode = "selector";
            state.mesaNumero = null;
            updateViewMode();
            renderMesaCards();
            paintMesaStatus();
            window.scrollTo({ top: 0, behavior: "smooth" });

            const printStatus = response && response.impresion ? response.impresion : null;
            const printSkippedByConfig = isPrintOmittedByConfig(printStatus);

            if (printStatus && !printStatus.ok && !printSkippedByConfig) {
                toast(`Pedido guardado, pero fallo impresion: ${response.impresion.detalle}`, "error");
                return;
            }

            if (printStatus && printStatus.warning && !printSkippedByConfig) {
                toast(`Pedido enviado. Aviso impresion: ${response.impresion.warning}`, "error");
                return;
            }

            toast("Pedido enviado y comanda actualizada.");
        } catch (error) {
            toast(error.message, "error");
        } finally {
            if (refs.btnEnviarPedido) {
                refs.btnEnviarPedido.disabled = false;
            }
        }
    }

    async function printBill() {
        const mesaNumero = Number(state.mesaNumero || 0);
        if (mesaNumero <= 0) {
            toast("Selecciona una mesa primero.", "error");
            state.viewMode = "selector";
            updateViewMode();
            return;
        }

        try {
            const response = await api.printBill(mesaNumero);
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
        const mesaNumero = Number(state.mesaNumero || 0);
        if (mesaNumero <= 0) {
            toast("Selecciona una mesa primero.", "error");
            state.viewMode = "selector";
            updateViewMode();
            return;
        }

        if (!state.cashOpen) {
            toast("Caja cerrada. Pide a caja/admin abrir caja antes de cobrar.", "error");
            return;
        }

        let totalMesa = 0;
        try {
            const snapshot = await api.getComanda(mesaNumero);
            totalMesa = Number(snapshot && snapshot.comanda ? snapshot.comanda.total : 0);
            renderComanda(snapshot);
        } catch (error) {
            toast(error.message, "error");
            return;
        }

        if (!Number.isFinite(totalMesa) || totalMesa <= 0) {
            toast("La mesa no tiene total valido para cobrar.", "error");
            return;
        }

        const payment = await pickPaymentMethod(mesaNumero, totalMesa);
        if (!payment) {
            return;
        }

        if (refs.btnCobrarMesa) {
            refs.btnCobrarMesa.disabled = true;
        }

        try {
            const response = await api.chargeTable(mesaNumero, {
                ...payment,
                forceNativePrint: true
            });
            await Promise.all([loadMesas(true), loadTipSummary(true)]);

            const printStatus = response && response.impresion ? response.impresion : null;
            if (printStatus && !printStatus.ok) {
                toast(`Mesa cobrada, pero fallo impresion: ${printStatus.detalle}`, "error");
            } else if (printStatus && printStatus.warning) {
                toast(`Mesa cobrada. Aviso impresion: ${printStatus.warning}`, "error");
            } else {
                const tip = Number(response.propina || 0);
                const tipText = tip > 0 ? ` + Propina: ${api.money(tip)}` : "";
                toast(`Mesa cobrada y cerrada. Total: ${api.money(response.total || 0)}${tipText}`);
            }

            state.cart.clear();
            state.plateConfigsByProductId.clear();
            state.currentComandaItemCount = 0;
            state.currentComandaTotal = 0;
            state.viewMode = "selector";
            state.mesaNumero = null;
            renderCart();
            renderMenu();
            updateViewMode();
            renderMesaCards();
            paintMesaStatus();
            window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (error) {
            toast(error.message, "error");
        } finally {
            updateChargeButton(state.viewMode === "pedido" && state.currentComandaItemCount > 0 && state.currentComandaTotal > 0);
        }
    }

    function updateChargeButton(enabled) {
        if (!refs.btnCobrarMesa) {
            return;
        }
        refs.btnCobrarMesa.disabled = !enabled || !state.cashOpen;
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
                                <option value="mixto">Pago mixto</option>
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
        });
    }

    function toast(message, type) {
        if (!refs.toast) {
            return;
        }
        refs.toast.textContent = message;
        refs.toast.className = `toast show ${type === "error" ? "error" : "ok"}`;
        window.setTimeout(() => {
            refs.toast.className = "toast";
        }, 3200);
    }

    function isPrintOmittedByConfig(printStatus) {
        if (!printStatus || typeof printStatus !== "object") {
            return false;
        }
        const stateValue = String(printStatus.estado || "").trim().toLowerCase();
        if (stateValue === "omitida") {
            return true;
        }

        const detail = String(printStatus.detalle || "").trim().toLowerCase();
        if (!detail) {
            return false;
        }

        return detail.includes("desactivada en configuracion")
            || detail.includes("desactivada en configuración")
            || detail.includes("sin impresora configurada");
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function normalizeRole(role) {
        const normalized = String(role || "")
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
        if (normalized === "garzon") {
            return "mesero";
        }
        if (normalized === "cajero") {
            return "caja";
        }
        return normalized;
    }

})();
