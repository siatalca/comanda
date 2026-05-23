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
        mesasConfiguredCount: 0
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

                if (button.dataset.action === "inc") {
                    setQty(id, getQty(id) + 1);
                }

                if (button.dataset.action === "dec") {
                    setQty(id, getQty(id) - 1);
                }
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
                    state.cart.delete(id);
                    renderCart();
                    renderMenu();
                }
            });
        }

        if (refs.btnEnviarPedido) {
            refs.btnEnviarPedido.addEventListener("click", sendOrder);
        }

        if (refs.btnImprimirPrecuenta) {
            refs.btnImprimirPrecuenta.addEventListener("click", printBill);
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
        const mesaNumero = Number(state.mesaNumero || 0);
        if (mesaNumero <= 0) {
            toast("Selecciona una mesa primero.", "error");
            state.viewMode = "selector";
            updateViewMode();
            return;
        }

        const items = [...state.cart.entries()].map(([productId, qty]) => ({
            producto_id: Number(productId),
            cantidad: Number(qty)
        }));

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
