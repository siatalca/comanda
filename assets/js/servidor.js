(function () {
    const api = window.ComandaAPI;
    if (!api) {
        return;
    }

    const CASH_AMOUNT_KEYS = [
        "inicial",
        "ventas",
        "efectivo",
        "tarjeta",
        "transferencia",
        "esperado",
        "cierre_diferencia"
    ];

    function defaultCashAmountVisibility() {
        return CASH_AMOUNT_KEYS.reduce((visibility, key) => {
            visibility[key] = true;
            return visibility;
        }, {});
    }

    const EYE_ICON_VISIBLE = `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M1.5 12s3.9-7 10.5-7 10.5 7 10.5 7-3.9 7-10.5 7S1.5 12 1.5 12Z"></path>
            <circle cx="12" cy="12" r="3.2"></circle>
        </svg>
    `;

    const EYE_ICON_HIDDEN = `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M10.58 10.58A3 3 0 0 0 12 15a3 3 0 0 0 2.42-4.42"></path>
            <path d="M16.68 16.68A10.9 10.9 0 0 1 12 18c-6.6 0-10.5-6-10.5-6a18.74 18.74 0 0 1 4.16-4.98"></path>
            <path d="M9.88 5.15A10.65 10.65 0 0 1 12 5c6.6 0 10.5 7 10.5 7a19.2 19.2 0 0 1-2.64 3.73"></path>
            <path d="M1 1l22 22"></path>
        </svg>
    `;

    const state = {
        mesas: [],
        selectedMesa: null,
        menu: {},
        productsById: new Map(),
        miniCart: new Map(),
        cuentas: [],
        cashStatus: null,
        currentUser: null,
        userRole: "",
        isCashier: false,
        isAdmin: false,
        isKitchen: false,
        cashEnabled: false,
        canViewSalesHistory: false,
        cashAmountVisibility: defaultCashAmountVisibility(),
        addProductsCollapsed: false,
        soundEnabled: true,
        soundTone: "tono_1",
        tipEnabled: true,
        tipPercent: 10,
        dailyMenu: null,
        salesHistory: null,
        kitchenQueue: [],
        selectedKitchenComandaId: null,
        kitchenPendingByItem: new Set(),
        kitchenCompleting: false,
        knownOpenComandas: new Map(),
        hasMesaBaseline: false,
        highlightedMesas: new Map(),
        audioContext: null,
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
        document.body.dataset.userRole = String(sessionUser.rol || "").toLowerCase();
        hydrateHeaderUser();
        bindEvents();
        setupRoleBehavior();

        if (state.isKitchen) {
            await Promise.all([
                loadAlertSettings(true),
                loadKitchenQueue()
            ]);

            state.timer = window.setInterval(async () => {
                await Promise.all([
                    loadAlertSettings(true),
                    loadKitchenQueue(true)
                ]);
            }, 5000);
            return;
        }

        await Promise.all([
            loadMenu(),
            loadAlertSettings(true),
            loadChargeConfig(true),
            loadMesas(),
            loadCashierAccounts(true),
            loadCashStatus(true),
            state.isAdmin ? loadDailyMenu(true) : Promise.resolve(),
            state.canViewSalesHistory ? loadSalesHistory(true) : Promise.resolve()
        ]);

        state.timer = window.setInterval(async () => {
            await Promise.all([
                loadAlertSettings(true),
                loadChargeConfig(true),
                loadMesas(true),
                loadCashierAccounts(true),
                loadCashStatus(true),
                state.isAdmin ? loadDailyMenu(true) : Promise.resolve()
            ]);
            if (state.selectedMesa !== null) {
                await refreshDetail(true);
            }
        }, 5000);
    }

    function bindRefs() {
        refs.btnRefreshMesas = document.getElementById("btnRefreshMesas");
        refs.mesasGrid = document.getElementById("mesasGrid");
        refs.detailTitle = document.getElementById("detailTitle");
        refs.detailMeta = document.getElementById("detailMeta");
        refs.detailEmpty = document.getElementById("detailEmpty");
        refs.detailContent = document.getElementById("detailContent");
        refs.detailTotal = document.getElementById("detailTotal");
        refs.detailItems = document.getElementById("detailItems");
        refs.addProductsHeader = document.getElementById("addProductsHeader");
        refs.btnToggleAddProducts = document.getElementById("btnToggleAddProducts");
        refs.addProductsBody = document.getElementById("addProductsBody");
        refs.miniMenu = document.getElementById("miniMenu");
        refs.miniCart = document.getElementById("miniCart");
        refs.btnAgregarItems = document.getElementById("btnAgregarItems");
        refs.btnLimpiarMini = document.getElementById("btnLimpiarMini");
        refs.cashierSummaryWrap = document.getElementById("cashierSummaryWrap");
        refs.cashierSummaryList = document.getElementById("cashierSummaryList");
        refs.btnPrecuenta = document.getElementById("btnPrecuenta");
        refs.btnCobrar = document.getElementById("btnCobrar");
        refs.cashDistributionContainer = document.getElementById("cashDistributionContainer");
        refs.kitchenBoard = document.getElementById("kitchenBoard");
        refs.kitchenQueueMeta = document.getElementById("kitchenQueueMeta");
        refs.kitchenQueueList = document.getElementById("kitchenQueueList");
        refs.kitchenDetailTitle = document.getElementById("kitchenDetailTitle");
        refs.kitchenDetailMeta = document.getElementById("kitchenDetailMeta");
        refs.kitchenDetailEmpty = document.getElementById("kitchenDetailEmpty");
        refs.kitchenDetailContent = document.getElementById("kitchenDetailContent");
        refs.kitchenItems = document.getElementById("kitchenItems");
        refs.btnKitchenComplete = document.getElementById("btnKitchenComplete");

        refs.cashSessionPanel = document.getElementById("cashSessionPanel");
        refs.cashSessionStatus = document.getElementById("cashSessionStatus");
        refs.cashOpenForm = document.getElementById("cashOpenForm");
        refs.cashOpenAmount = document.getElementById("cashOpenAmount");
        refs.cashOpenInfo = document.getElementById("cashOpenInfo");
        refs.cashKpiInicial = document.getElementById("cashKpiInicial");
        refs.cashKpiVentas = document.getElementById("cashKpiVentas");
        refs.cashKpiEfectivo = document.getElementById("cashKpiEfectivo");
        refs.cashKpiTarjeta = document.getElementById("cashKpiTarjeta");
        refs.cashKpiTransferencia = document.getElementById("cashKpiTransferencia");
        refs.cashKpiEsperado = document.getElementById("cashKpiEsperado");
        refs.btnCashRefresh = document.getElementById("btnCashRefresh");
        refs.btnCashClose = document.getElementById("btnCashClose");
        refs.cashAmountGlobalControl = document.getElementById("cashAmountGlobalControl");
        refs.cashAmountToggleAll = document.getElementById("cashAmountToggleAll");
        refs.cashAmountGlobalText = document.getElementById("cashAmountGlobalText");
        refs.cashAmountToggleItems = Array.from(document.querySelectorAll("[data-cash-amount-eye]"));

        refs.dailyMenuPanel = document.getElementById("dailyMenuPanel");
        refs.dailyMenuForm = document.getElementById("dailyMenuForm");
        refs.dailyMenuDate = document.getElementById("dailyMenuDate");
        refs.dailyMenuStatus = document.getElementById("dailyMenuStatus");
        refs.dailyMenuList = document.getElementById("dailyMenuList");
        refs.btnDailyMenuReload = document.getElementById("btnDailyMenuReload");
        refs.btnDailyMenuConfirm = document.getElementById("btnDailyMenuConfirm");

        refs.salesHistoryPanel = document.getElementById("salesHistoryPanel");
        refs.salesHistoryForm = document.getElementById("salesHistoryForm");
        refs.salesHistoryFrom = document.getElementById("salesHistoryFrom");
        refs.salesHistoryTo = document.getElementById("salesHistoryTo");
        refs.btnSalesHistoryLoad = document.getElementById("btnSalesHistoryLoad");
        refs.salesHistoryCount = document.getElementById("salesHistoryCount");
        refs.salesHistoryTotal = document.getElementById("salesHistoryTotal");
        refs.salesHistoryCash = document.getElementById("salesHistoryCash");
        refs.salesHistoryCard = document.getElementById("salesHistoryCard");
        refs.salesHistoryTransfer = document.getElementById("salesHistoryTransfer");
        refs.salesHistoryOther = document.getElementById("salesHistoryOther");
        refs.salesHistoryTipsTotal = document.getElementById("salesHistoryTipsTotal");
        refs.salesHistoryTipsByWaiter = document.getElementById("salesHistoryTipsByWaiter");
        refs.salesHistoryList = document.getElementById("salesHistoryList");

        refs.cashCloseModal = document.getElementById("cashCloseModal");
        refs.cashCloseForm = document.getElementById("cashCloseForm");
        refs.cashCloseVentasTotal = document.getElementById("cashCloseVentasTotal");
        refs.cashCloseVentasCantidad = document.getElementById("cashCloseVentasCantidad");
        refs.cashCloseEfectivo = document.getElementById("cashCloseEfectivo");
        refs.cashCloseTarjeta = document.getElementById("cashCloseTarjeta");
        refs.cashCloseTransferencia = document.getElementById("cashCloseTransferencia");
        refs.cashCloseEsperado = document.getElementById("cashCloseEsperado");
        refs.cashCloseCounted = document.getElementById("cashCloseCounted");
        refs.cashCloseNotes = document.getElementById("cashCloseNotes");
        refs.cashCloseDiff = document.getElementById("cashCloseDiff");
        refs.btnCashCloseCancel = document.getElementById("btnCashCloseCancel");
        refs.btnCashCloseConfirm = document.getElementById("btnCashCloseConfirm");

        refs.cashGate = document.getElementById("cashGate");
        refs.cashGateForm = document.getElementById("cashGateForm");
        refs.cashGateAmount = document.getElementById("cashGateAmount");
        refs.btnCashGateLogout = document.getElementById("btnCashGateLogout");
        refs.btnUserMenu = document.getElementById("btnUserMenu");
        refs.userMenuModal = document.getElementById("userMenuModal");
        refs.btnUserMenuClose = document.getElementById("btnUserMenuClose");
        refs.userSoundStatus = document.getElementById("userSoundStatus");
        refs.userSoundToneLabel = document.getElementById("userSoundToneLabel");

        refs.toast = document.getElementById("toast");
        refs.serverUserLabel = document.getElementById("serverUserLabel");
        refs.linkAdminPanel = document.getElementById("linkAdminPanel");
        refs.btnLogout = document.getElementById("btnLogout");
    }

    function bindEvents() {
        refs.btnRefreshMesas.addEventListener("click", async () => {
            if (state.isKitchen) {
                await loadKitchenQueue();
                toast("Cola de cocina actualizada.");
                return;
            }

            await Promise.all([
                loadMesas(),
                loadCashierAccounts(true),
                loadCashStatus(true),
                loadChargeConfig(true),
                state.isAdmin ? loadDailyMenu(true) : Promise.resolve(),
                state.canViewSalesHistory ? loadSalesHistory(true) : Promise.resolve()
            ]);
            await refreshDetail(true);
            toast("Panel actualizado.");
        });

        refs.mesasGrid.addEventListener("click", async (event) => {
            if (state.isKitchen) {
                return;
            }
            const card = event.target.closest("button[data-mesa]");
            if (!card) {
                return;
            }
            state.selectedMesa = Number(card.dataset.mesa || 0);
            renderMesas();
            await refreshDetail();
        });

        if (refs.kitchenQueueList) {
            refs.kitchenQueueList.addEventListener("click", async (event) => {
                const card = event.target.closest("button[data-kitchen-comanda]");
                if (!card) {
                    return;
                }
                const comandaId = Number(card.dataset.kitchenComanda || 0);
                if (comandaId <= 0) {
                    return;
                }
                state.selectedKitchenComandaId = comandaId;
                renderKitchenQueue();
                renderKitchenDetail();
            });
        }

        if (refs.kitchenItems) {
            refs.kitchenItems.addEventListener("change", async (event) => {
                const input = event.target.closest("input[data-kitchen-item]");
                if (!input) {
                    return;
                }

                const itemId = Number(input.dataset.kitchenItem || 0);
                if (itemId <= 0) {
                    return;
                }
                const delivered = !!input.checked;
                await updateKitchenItemStatus(itemId, delivered);
            });
        }

        if (refs.btnKitchenComplete) {
            refs.btnKitchenComplete.addEventListener("click", completeKitchenOrder);
        }

        refs.miniMenu.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-add]");
            if (!button) {
                return;
            }
            const productId = Number(button.dataset.add || 0);
            if (!productId) {
                return;
            }
            setMiniQty(productId, getMiniQty(productId) + 1);
        });

        refs.miniCart.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-mini-action]");
            if (!button) {
                return;
            }
            const productId = Number(button.dataset.id || 0);
            if (!productId) {
                return;
            }
            const action = button.dataset.miniAction;
            if (action === "plus") {
                setMiniQty(productId, getMiniQty(productId) + 1);
            }
            if (action === "minus") {
                setMiniQty(productId, getMiniQty(productId) - 1);
            }
        });

        refs.btnAgregarItems.addEventListener("click", addItemsToComanda);
        refs.btnLimpiarMini.addEventListener("click", () => {
            state.miniCart.clear();
            renderMiniCart();
        });
        if (refs.btnToggleAddProducts) {
            refs.btnToggleAddProducts.addEventListener("click", () => {
                setAddProductsCollapsed(!state.addProductsCollapsed);
            });
        }
        refs.btnPrecuenta.addEventListener("click", printPrecuenta);
        refs.btnCobrar.addEventListener("click", cobrarMesa);

        if (refs.dailyMenuForm) {
            refs.dailyMenuForm.addEventListener("submit", submitDailyMenu);
        }
        if (refs.btnDailyMenuReload) {
            refs.btnDailyMenuReload.addEventListener("click", async () => {
                await loadDailyMenu(false, true);
            });
        }

        if (refs.salesHistoryForm) {
            refs.salesHistoryForm.addEventListener("submit", async (event) => {
                event.preventDefault();
                await loadSalesHistory();
            });
        }

        if (refs.cashOpenForm) {
            refs.cashOpenForm.addEventListener("submit", async (event) => {
                event.preventDefault();
                await openCashWithValue(refs.cashOpenAmount.value);
            });
        }

        if (refs.cashGateForm) {
            refs.cashGateForm.addEventListener("submit", async (event) => {
                event.preventDefault();
                await openCashWithValue(refs.cashGateAmount.value);
            });
        }
        if (refs.btnCashGateLogout) {
            refs.btnCashGateLogout.addEventListener("click", logout);
        }

        if (refs.btnCashRefresh) {
            refs.btnCashRefresh.addEventListener("click", async () => {
                await loadCashStatus();
            });
        }

        if (refs.btnCashClose) {
            refs.btnCashClose.addEventListener("click", closeCashSession);
        }
        if (refs.cashCloseForm) {
            refs.cashCloseForm.addEventListener("submit", submitCashClose);
        }
        if (refs.btnCashCloseCancel) {
            refs.btnCashCloseCancel.addEventListener("click", hideCashCloseModal);
        }
        if (refs.cashCloseCounted) {
            refs.cashCloseCounted.addEventListener("input", updateCashCloseDifference);
        }
        if (refs.cashCloseModal) {
            refs.cashCloseModal.addEventListener("click", (event) => {
                if (event.target === refs.cashCloseModal) {
                    hideCashCloseModal();
                }
            });
        }
        if (refs.cashAmountToggleAll) {
            refs.cashAmountToggleAll.addEventListener("click", () => {
                const showAll = !areAllCashAmountsVisible();
                setAllCashAmountVisibility(showAll);
                syncCashAmountPrivacyControls();
                refreshCashAmountSensitiveViews();
            });
        }
        if (Array.isArray(refs.cashAmountToggleItems) && refs.cashAmountToggleItems.length > 0) {
            refs.cashAmountToggleItems.forEach((button) => {
                button.addEventListener("click", (event) => {
                    const key = String(event.currentTarget.dataset.cashAmountEye || "");
                    if (!Object.prototype.hasOwnProperty.call(state.cashAmountVisibility, key)) {
                        return;
                    }
                    state.cashAmountVisibility[key] = !isCashAmountVisible(key);
                    syncCashAmountPrivacyControls();
                    refreshCashAmountSensitiveViews();
                });
            });
        }

        if (refs.btnUserMenu) {
            refs.btnUserMenu.addEventListener("click", openUserMenu);
        }
        if (refs.btnUserMenuClose) {
            refs.btnUserMenuClose.addEventListener("click", closeUserMenu);
        }
        if (refs.userMenuModal) {
            refs.userMenuModal.addEventListener("click", (event) => {
                if (event.target === refs.userMenuModal) {
                    closeUserMenu();
                }
            });
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
            const allowed = ["admin", "caja", "cajero", "cocina"];
            if (!allowed.includes(role)) {
                window.location.href = role === "mesero" ? "mesero.html" : "login.html";
                return null;
            }
            return session.user;
        } catch (error) {
            window.location.href = "login.html";
            return null;
        }
    }

    function hydrateHeaderUser() {
        if (!state.currentUser) {
            return;
        }
        if (refs.serverUserLabel) {
            refs.serverUserLabel.textContent = `Usuario: ${state.currentUser.nombre} (${state.currentUser.rol})`;
        }
        if (refs.linkAdminPanel) {
            const isAdmin = String(state.currentUser.rol || "").toLowerCase() === "admin";
            refs.linkAdminPanel.classList.toggle("hidden", !isAdmin);
        }
    }

    async function logout() {
        try {
            await api.logout();
        } catch (error) {
            // Ignora error de logout remoto y redirige igual.
        }
        window.location.href = "login.html";
    }

    function setupRoleBehavior() {
        state.userRole = String((document.body.dataset.userRole || "")).toLowerCase();
        state.isCashier = state.userRole === "caja" || state.userRole === "cajero";
        state.isAdmin = state.userRole === "admin";
        state.isKitchen = state.userRole === "cocina";
        state.cashEnabled = state.isCashier || state.isAdmin;
        state.canViewSalesHistory = state.isAdmin;
        const openDailyMenuShortcut = state.isAdmin && shouldOpenDailyMenuShortcut();

        if (state.isKitchen) {
            if (refs.cashSessionPanel) {
                refs.cashSessionPanel.classList.add("hidden");
            }
            if (refs.cashDistributionContainer) {
                refs.cashDistributionContainer.classList.add("hidden");
            }
            if (refs.kitchenBoard) {
                refs.kitchenBoard.classList.remove("hidden");
            }
            if (refs.cashierSummaryWrap) {
                refs.cashierSummaryWrap.classList.add("hidden");
            }
            if (refs.btnRefreshMesas) {
                refs.btnRefreshMesas.textContent = "Refrescar pedidos";
            }
            return;
        }

        if (refs.kitchenBoard) {
            refs.kitchenBoard.classList.add("hidden");
        }
        if (refs.cashDistributionContainer) {
            refs.cashDistributionContainer.classList.remove("hidden");
        }

        setupCashAmountPrivacy();

        if (state.cashEnabled) {
            if (refs.cashierSummaryWrap) {
                refs.cashierSummaryWrap.classList.toggle("hidden", state.isCashier);
            }
            if (state.isCashier) {
                if (refs.addProductsHeader) {
                    refs.addProductsHeader.classList.add("hidden");
                }
                if (refs.addProductsBody) {
                    refs.addProductsBody.classList.add("hidden");
                }
                setAddProductsCollapsed(true);
            } else if (state.isAdmin) {
                if (refs.addProductsHeader) {
                    refs.addProductsHeader.classList.remove("hidden");
                }
                if (refs.addProductsBody) {
                    refs.addProductsBody.classList.remove("hidden");
                }
                setAddProductsCollapsed(true);
            } else {
                if (refs.addProductsHeader) {
                    refs.addProductsHeader.classList.remove("hidden");
                }
                if (refs.addProductsBody) {
                    refs.addProductsBody.classList.remove("hidden");
                }
                setAddProductsCollapsed(false);
            }
        } else {
            if (refs.cashierSummaryWrap) {
                refs.cashierSummaryWrap.classList.add("hidden");
            }
            if (refs.addProductsHeader) {
                refs.addProductsHeader.classList.remove("hidden");
            }
            if (refs.addProductsBody) {
                refs.addProductsBody.classList.remove("hidden");
            }
            setAddProductsCollapsed(false);
        }

        if (state.cashEnabled) {
            refs.cashSessionPanel.classList.remove("hidden");
            if (refs.dailyMenuPanel) {
                refs.dailyMenuPanel.classList.toggle("hidden", !state.isAdmin);
            }
            if (refs.salesHistoryPanel) {
                refs.salesHistoryPanel.classList.toggle("hidden", !state.canViewSalesHistory);
            }
            if (state.isAdmin) {
                if (refs.dailyMenuPanel && "open" in refs.dailyMenuPanel) {
                    refs.dailyMenuPanel.open = openDailyMenuShortcut;
                }
            }
            if (state.canViewSalesHistory) {
                if (refs.salesHistoryPanel && "open" in refs.salesHistoryPanel) {
                    refs.salesHistoryPanel.open = false;
                }
            }
        } else {
            refs.cashSessionPanel.classList.add("hidden");
            if (refs.dailyMenuPanel) {
                refs.dailyMenuPanel.classList.add("hidden");
            }
            if (refs.salesHistoryPanel) {
                refs.salesHistoryPanel.classList.add("hidden");
            }
            hideCashGate();
        }

        const today = todayKey();
        if (refs.dailyMenuDate && !refs.dailyMenuDate.value) {
            refs.dailyMenuDate.value = today;
        }
        if (refs.salesHistoryFrom && !refs.salesHistoryFrom.value) {
            refs.salesHistoryFrom.value = today;
        }
        if (refs.salesHistoryTo && !refs.salesHistoryTo.value) {
            refs.salesHistoryTo.value = today;
        }

        if (openDailyMenuShortcut) {
            focusDailyMenuPanelFromShortcut();
        }
    }

    function shouldOpenDailyMenuShortcut() {
        if (!window.location || !window.location.search) {
            return false;
        }
        const params = new URLSearchParams(window.location.search);
        const panel = String(params.get("panel") || "").toLowerCase();
        return panel === "menu-dia" || panel === "menu_diario" || panel === "daily-menu";
    }

    function focusDailyMenuPanelFromShortcut() {
        if (!refs.dailyMenuPanel || refs.dailyMenuPanel.classList.contains("hidden")) {
            return;
        }

        refs.dailyMenuPanel.open = true;
        if (refs.salesHistoryPanel && "open" in refs.salesHistoryPanel) {
            refs.salesHistoryPanel.open = false;
        }

        refs.dailyMenuPanel.scrollIntoView({ behavior: "smooth", block: "start" });

        if (refs.dailyMenuDate) {
            window.setTimeout(() => {
                try {
                    refs.dailyMenuDate.focus({ preventScroll: true });
                } catch (_error) {
                    refs.dailyMenuDate.focus();
                }
            }, 180);
        }

        if (window.history && typeof window.history.replaceState === "function" && window.location.search) {
            const cleanUrl = `${window.location.pathname}${window.location.hash || ""}`;
            window.history.replaceState({}, document.title, cleanUrl);
        }
    }

    function setupCashAmountPrivacy() {
        if (!refs.cashAmountGlobalControl) {
            return;
        }
        if (!state.isCashier) {
            refs.cashAmountGlobalControl.classList.add("hidden");
            setAllCashAmountVisibility(true);
            return;
        }
        refs.cashAmountGlobalControl.classList.remove("hidden");
        syncCashAmountPrivacyControls();
    }

    function setAllCashAmountVisibility(visible) {
        const value = Boolean(visible);
        CASH_AMOUNT_KEYS.forEach((key) => {
            state.cashAmountVisibility[key] = value;
        });
    }

    function syncCashAmountPrivacyControls() {
        if (!state.isCashier) {
            return;
        }
        if (Array.isArray(refs.cashAmountToggleItems) && refs.cashAmountToggleItems.length > 0) {
            refs.cashAmountToggleItems.forEach((button) => {
                const key = String(button.dataset.cashAmountEye || "");
                if (!Object.prototype.hasOwnProperty.call(state.cashAmountVisibility, key)) {
                    return;
                }
                const visible = isCashAmountVisible(key);
                const fieldLabel = String(button.dataset.cashAmountLabel || key);
                button.dataset.visible = visible ? "true" : "false";
                button.classList.toggle("is-hidden", !visible);
                button.setAttribute("aria-label", `${visible ? "Ocultar" : "Mostrar"} monto ${fieldLabel}`);
                button.setAttribute("title", `${visible ? "Ocultar" : "Mostrar"} monto ${fieldLabel}`);
                updateCashAmountToggleIcon(button, visible);
            });
        }
        if (refs.cashAmountToggleAll) {
            const allVisible = areAllCashAmountsVisible();
            refs.cashAmountToggleAll.dataset.visible = allVisible ? "true" : "false";
            refs.cashAmountToggleAll.classList.toggle("is-hidden", !allVisible);
            refs.cashAmountToggleAll.setAttribute("aria-label", allVisible ? "Ocultar todos los montos" : "Mostrar todos los montos");
            refs.cashAmountToggleAll.setAttribute("title", allVisible ? "Ocultar todos los montos" : "Mostrar todos los montos");
            updateCashAmountToggleIcon(refs.cashAmountToggleAll, allVisible);
            if (refs.cashAmountGlobalText) {
                refs.cashAmountGlobalText.textContent = allVisible ? "Ocultar todos" : "Mostrar todos";
            }
        }
    }

    function updateCashAmountToggleIcon(button, visible) {
        if (!button) {
            return;
        }
        const iconContainer = button.querySelector(".cash-eye-icon");
        if (!iconContainer) {
            return;
        }
        iconContainer.innerHTML = visible ? EYE_ICON_VISIBLE : EYE_ICON_HIDDEN;
    }

    function areAllCashAmountsVisible() {
        return CASH_AMOUNT_KEYS.every((key) => isCashAmountVisible(key));
    }

    function isCashAmountVisible(key) {
        if (!state.isCashier) {
            return true;
        }
        return state.cashAmountVisibility[String(key)] !== false;
    }

    function formatCashAmount(key, amount) {
        if (!isCashAmountVisible(key)) {
            return "****";
        }
        return api.money(amount || 0);
    }

    function formatCashAmountWithCount(key, amount, count) {
        return `${formatCashAmount(key, amount)} (${Number(count || 0)})`;
    }

    function refreshCashAmountSensitiveViews() {
        if (!state.cashEnabled) {
            return;
        }
        renderCashStatus();
        if (
            refs.cashCloseModal &&
            !refs.cashCloseModal.classList.contains("hidden") &&
            state.cashStatus &&
            state.cashStatus.resumen
        ) {
            renderCashCloseSummary(state.cashStatus.resumen);
            updateCashCloseDifference();
        }
    }

    function setAddProductsCollapsed(collapsed) {
        state.addProductsCollapsed = Boolean(collapsed);
        if (!refs.addProductsBody || !refs.btnToggleAddProducts) {
            return;
        }
        refs.addProductsBody.classList.toggle("hidden", state.addProductsCollapsed);
        refs.btnToggleAddProducts.textContent = state.addProductsCollapsed ? "Mostrar" : "Ocultar";
        refs.btnToggleAddProducts.setAttribute("aria-expanded", state.addProductsCollapsed ? "false" : "true");
    }

    async function loadMenu() {
        try {
            state.menu = await api.getMenu();
            state.productsById.clear();
            Object.values(state.menu).forEach((group) => {
                (group || []).forEach((product) => {
                    state.productsById.set(Number(product.id), product);
                });
            });
            renderMiniMenu();
        } catch (error) {
            toast(error.message, "error");
        }
    }

    async function loadAlertSettings(silent) {
        try {
            const prefs = await api.getUserPreferences();
            state.soundEnabled = Boolean(prefs.alerta_sonido_activo !== false);
            state.soundTone = String(prefs.alerta_tono_comanda || "tono_1");
            renderUserMenuInfo();
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

    async function loadMesas(silent) {
        try {
            const mesas = await api.getMesas();
            const nuevasComandas = detectNewComandas(mesas);
            state.mesas = mesas;
            if (state.selectedMesa === null && state.mesas.length > 0) {
                const occupied = state.mesas.find((mesa) => mesa.estado === "ocupada");
                state.selectedMesa = Number((occupied || state.mesas[0]).numero);
                await refreshDetail(true);
            }

            if (nuevasComandas.length > 0 && (state.isCashier || state.isAdmin)) {
                markNewMesas(nuevasComandas);
                const mesasText = nuevasComandas.map((mesa) => `Mesa ${mesa}`).join(", ");
                toast(`Nueva comanda: ${mesasText}`);
                playNewComandaSound();
                if (state.cashEnabled) {
                    renderCashierAccounts();
                }
            }

            renderMesas();
        } catch (error) {
            if (!silent) {
                toast(error.message, "error");
            }
        }
    }

    function applyKitchenQueueData(payload) {
        const pedidosRaw = Array.isArray(payload && payload.pedidos) ? payload.pedidos : [];
        const pedidos = pedidosRaw.map((order) => {
            const items = Array.isArray(order.items) ? order.items : [];
            return {
                comanda_id: Number(order.comanda_id || 0),
                mesa_numero: Number(order.mesa_numero || 0),
                llegada_en: String(order.llegada_en || order.creada_en || ""),
                items_totales: Number(order.items_totales || items.length || 0),
                items_listos: Number(order.items_listos || 0),
                items_pendientes: Number(order.items_pendientes || 0),
                items: items.map((item) => ({
                    id: Number(item.id || 0),
                    descripcion: String(item.descripcion || ""),
                    categoria: String(item.categoria || ""),
                    cantidad: Number(item.cantidad || 0),
                    notas: String(item.notas || ""),
                    creado_en: String(item.creado_en || ""),
                    entregado: Boolean(item.entregado)
                }))
            };
        }).filter((order) => order.comanda_id > 0);

        state.kitchenQueue = pedidos;

        const validComandaIds = new Set();
        const validItemIds = new Set();
        state.kitchenQueue.forEach((order) => {
            validComandaIds.add(Number(order.comanda_id));
            (order.items || []).forEach((item) => {
                if (Number(item.id) > 0) {
                    validItemIds.add(Number(item.id));
                }
            });
        });

        state.kitchenPendingByItem.forEach((itemId) => {
            if (!validItemIds.has(Number(itemId))) {
                state.kitchenPendingByItem.delete(Number(itemId));
            }
        });

        if (
            !state.selectedKitchenComandaId
            || !validComandaIds.has(Number(state.selectedKitchenComandaId))
        ) {
            state.selectedKitchenComandaId = state.kitchenQueue.length > 0
                ? Number(state.kitchenQueue[0].comanda_id)
                : null;
        }
    }

    async function loadKitchenQueue(silent) {
        if (!state.isKitchen) {
            return;
        }

        try {
            const payload = await api.getKitchenQueue();
            applyKitchenQueueData(payload || {});
            renderKitchenQueue();
            renderKitchenDetail();
        } catch (error) {
            if (!silent) {
                toast(error.message, "error");
            }
        }
    }

    function getSelectedKitchenOrder() {
        const selectedId = Number(state.selectedKitchenComandaId || 0);
        if (selectedId <= 0) {
            return null;
        }
        return state.kitchenQueue.find((order) => Number(order.comanda_id) === selectedId) || null;
    }

    function renderKitchenQueue() {
        if (!state.isKitchen || !refs.kitchenQueueList || !refs.kitchenQueueMeta) {
            return;
        }

        const queue = Array.isArray(state.kitchenQueue) ? state.kitchenQueue : [];
        if (queue.length === 0) {
            refs.kitchenQueueMeta.textContent = "Sin pedidos";
            refs.kitchenQueueList.innerHTML = `<p class="empty-state">No hay pedidos de cocina pendientes.</p>`;
            return;
        }

        refs.kitchenQueueMeta.textContent = `${queue.length} pedido(s) en cola`;
        refs.kitchenQueueList.innerHTML = queue
            .map((order) => {
                const selected = Number(order.comanda_id) === Number(state.selectedKitchenComandaId) ? "selected" : "";
                const pending = Number(order.items_pendientes || 0);
                const ready = Number(order.items_listos || 0);
                const total = Number(order.items_totales || 0);
                return `
                    <button type="button" class="kitchen-order-card ${selected}" data-kitchen-comanda="${order.comanda_id}">
                        <strong>Mesa ${order.mesa_numero}</strong>
                        <span>Llegada: ${escapeHtml(formatKitchenDateTime(order.llegada_en))}</span>
                        <span>Listos: ${ready}/${total} - Pendientes: ${pending}</span>
                    </button>
                `;
            })
            .join("");
    }

    function renderKitchenDetail() {
        if (
            !state.isKitchen
            || !refs.kitchenDetailTitle
            || !refs.kitchenDetailMeta
            || !refs.kitchenDetailEmpty
            || !refs.kitchenDetailContent
            || !refs.kitchenItems
            || !refs.btnKitchenComplete
        ) {
            return;
        }

        const order = getSelectedKitchenOrder();
        if (!order) {
            refs.kitchenDetailTitle.textContent = "Selecciona un pedido";
            refs.kitchenDetailMeta.textContent = "-";
            refs.kitchenDetailEmpty.classList.remove("hidden");
            refs.kitchenDetailContent.classList.add("hidden");
            refs.btnKitchenComplete.disabled = true;
            refs.btnKitchenComplete.removeAttribute("data-comanda-id");
            return;
        }

        refs.kitchenDetailTitle.textContent = `Mesa ${order.mesa_numero}`;
        refs.kitchenDetailMeta.textContent = `Llegada: ${formatKitchenDateTime(order.llegada_en)} - Pendientes: ${order.items_pendientes}`;
        refs.kitchenDetailEmpty.classList.add("hidden");
        refs.kitchenDetailContent.classList.remove("hidden");

        const items = Array.isArray(order.items) ? order.items : [];
        if (items.length === 0) {
            refs.kitchenItems.innerHTML = `<p class="empty-state">Esta mesa no tiene items de cocina.</p>`;
            refs.btnKitchenComplete.disabled = true;
            refs.btnKitchenComplete.removeAttribute("data-comanda-id");
            return;
        }

        refs.kitchenItems.innerHTML = items
            .map((item) => {
                const itemId = Number(item.id || 0);
                const isPendingSave = state.kitchenPendingByItem.has(itemId);
                const delivered = Boolean(item.entregado);
                const disabled = isPendingSave || state.kitchenCompleting ? "disabled" : "";
                return `
                    <article class="kitchen-item ${delivered ? "ready" : "pending"}">
                        <div class="kitchen-item-head">
                            <strong>${Number(item.cantidad || 0)} x ${escapeHtml(item.descripcion || "")}</strong>
                            <label class="kitchen-item-check">
                                <input type="checkbox" data-kitchen-item="${itemId}" ${delivered ? "checked" : ""} ${disabled}>
                                <span>${delivered ? "Listo" : "Pendiente"}</span>
                            </label>
                        </div>
                        ${item.notas ? `<small>Nota: ${escapeHtml(item.notas)}</small>` : ""}
                    </article>
                `;
            })
            .join("");

        const allReady = Number(order.items_totales || 0) > 0 && Number(order.items_pendientes || 0) === 0;
        refs.btnKitchenComplete.disabled = !allReady || state.kitchenCompleting;
        refs.btnKitchenComplete.dataset.comandaId = String(order.comanda_id);
        refs.btnKitchenComplete.textContent = state.kitchenCompleting
            ? "Confirmando..."
            : `Pedido completo mesa ${order.mesa_numero}`;
    }

    async function updateKitchenItemStatus(itemId, delivered) {
        if (!state.isKitchen) {
            return;
        }

        const id = Number(itemId || 0);
        if (id <= 0 || state.kitchenPendingByItem.has(id)) {
            return;
        }

        state.kitchenPendingByItem.add(id);
        renderKitchenDetail();

        try {
            const response = await api.setKitchenItemStatus(id, delivered);
            applyKitchenQueueData((response && response.data) || {});
            renderKitchenQueue();
            renderKitchenDetail();
            toast(delivered ? "Item marcado como listo." : "Item marcado como pendiente.");
        } catch (error) {
            toast(error.message, "error");
            await loadKitchenQueue(true);
        } finally {
            state.kitchenPendingByItem.delete(id);
            renderKitchenDetail();
        }
    }

    async function completeKitchenOrder() {
        if (!state.isKitchen || state.kitchenCompleting) {
            return;
        }

        const order = getSelectedKitchenOrder();
        if (!order) {
            return;
        }

        const allReady = Number(order.items_totales || 0) > 0 && Number(order.items_pendientes || 0) === 0;
        if (!allReady) {
            return;
        }

        state.kitchenCompleting = true;
        renderKitchenDetail();
        try {
            const response = await api.completeKitchenOrder(order.comanda_id);
            applyKitchenQueueData((response && response.data) || {});
            renderKitchenQueue();
            renderKitchenDetail();
            toast(`Mesa ${order.mesa_numero} marcada como lista.`);
        } catch (error) {
            toast(error.message, "error");
        } finally {
            state.kitchenCompleting = false;
            renderKitchenDetail();
        }
    }

    async function loadCashierAccounts(silent) {
        if (!state.cashEnabled) {
            return;
        }

        try {
            state.cuentas = await api.getOpenAccounts();
            renderCashierAccounts();
        } catch (error) {
            if (!silent) {
                toast(error.message, "error");
            }
        }
    }

    async function loadCashStatus(silent) {
        if (!state.cashEnabled) {
            return;
        }

        try {
            state.cashStatus = await api.getCashStatus();
            renderCashStatus();
        } catch (error) {
            if (!silent) {
                toast(error.message, "error");
            }
        }
    }

    async function loadDailyMenu(silent, notify) {
        if (!state.isAdmin || !refs.dailyMenuDate) {
            return;
        }

        try {
            const data = await api.getDailyMenu(refs.dailyMenuDate.value || "");
            state.dailyMenu = data || null;
            if (data && data.fecha) {
                refs.dailyMenuDate.value = String(data.fecha);
            }
            renderDailyMenu();
            if (notify) {
                toast("Menu diario cargado.");
            }
        } catch (error) {
            if (!silent) {
                toast(error.message, "error");
            }
        }
    }

    function renderDailyMenu() {
        if (!refs.dailyMenuList || !refs.dailyMenuStatus || !state.cashEnabled) {
            return;
        }

        const payload = state.dailyMenu || {};
        const products = Array.isArray(payload.productos) ? payload.productos : [];
        const confirmation = payload.confirmacion || {};
        const confirmed = Number(payload.confirmado || 0) === 1;

        if (confirmed) {
            const who = confirmation.confirmado_por_nombre || confirmation.confirmado_por_usuario || "usuario";
            const when = confirmation.confirmado_en || "";
            refs.dailyMenuStatus.textContent = `Confirmado por ${who}${when ? ` (${when})` : ""}`;
        } else {
            refs.dailyMenuStatus.textContent = "Sin confirmar (mesero no podra tomar pedidos)";
        }

        if (products.length === 0) {
            refs.dailyMenuList.innerHTML = `<p class="empty-state">No hay productos activos para este dia.</p>`;
            return;
        }

        const grouped = {};
        products.forEach((product) => {
            const category = String(product.categoria || "General");
            if (!grouped[category]) {
                grouped[category] = [];
            }
            grouped[category].push(product);
        });

        refs.dailyMenuList.innerHTML = Object.entries(grouped)
            .map(([category, items]) => `
                <section class="daily-menu-group">
                    <h4>${escapeHtml(category)}</h4>
                    ${(items || [])
                        .map((product) => `
                            <label class="daily-menu-item">
                                <div>
                                    <strong>${escapeHtml(product.nombre)}</strong>
                                    <small>${api.money(product.precio || 0)}</small>
                                </div>
                                <input type="checkbox" data-daily-product="${product.id}" ${Number(product.habilitado || 0) === 1 ? "checked" : ""}>
                            </label>
                        `)
                        .join("")}
                </section>
            `)
            .join("");
    }

    async function submitDailyMenu(event) {
        event.preventDefault();
        if (!state.isAdmin || !refs.dailyMenuList || !refs.btnDailyMenuConfirm) {
            return;
        }

        const rows = Array.from(refs.dailyMenuList.querySelectorAll("[data-daily-product]")).map((input) => ({
            id: Number(input.getAttribute("data-daily-product") || 0),
            habilitado: input.checked ? 1 : 0
        })).filter((row) => row.id > 0);

        if (rows.length === 0) {
            toast("No hay productos para confirmar en este menu.", "error");
            return;
        }

        refs.btnDailyMenuConfirm.disabled = true;
        try {
            const response = await api.confirmDailyMenu(refs.dailyMenuDate ? refs.dailyMenuDate.value : "", rows);
            state.dailyMenu = response.data || null;
            renderDailyMenu();
            await loadMenu();
            toast(response.mensaje || "Menu diario confirmado.");
        } catch (error) {
            toast(error.message, "error");
        } finally {
            refs.btnDailyMenuConfirm.disabled = false;
        }
    }

    async function loadSalesHistory(silent) {
        if (!state.canViewSalesHistory || !refs.salesHistoryFrom || !refs.salesHistoryTo) {
            return;
        }

        const desde = refs.salesHistoryFrom.value || todayKey();
        const hasta = refs.salesHistoryTo.value || desde;

        try {
            const data = await api.getSalesHistory(desde, hasta);
            state.salesHistory = data || null;

            if (data && data.periodo) {
                refs.salesHistoryFrom.value = data.periodo.desde || desde;
                refs.salesHistoryTo.value = data.periodo.hasta || hasta;
            }

            renderSalesHistory();
            if (!silent) {
                toast("Historial de ventas actualizado.");
            }
        } catch (error) {
            if (!silent) {
                toast(error.message, "error");
            }
        }
    }

    function renderSalesHistory() {
        if (!refs.salesHistoryList || !state.canViewSalesHistory) {
            return;
        }

        const payload = state.salesHistory || {};
        const summary = payload.resumen || {};
        const sales = Array.isArray(payload.ventas) ? payload.ventas : [];

        refs.salesHistoryCount.textContent = String(summary.ventas_cantidad || 0);
        refs.salesHistoryTotal.textContent = api.money(summary.ventas_total || 0);
        refs.salesHistoryCash.textContent = api.money(summary.efectivo_total || 0);
        refs.salesHistoryCard.textContent = api.money(summary.tarjeta_total || 0);
        refs.salesHistoryTransfer.textContent = api.money(summary.transferencia_total || 0);
        refs.salesHistoryOther.textContent = api.money(summary.otros_total || 0);
        if (refs.salesHistoryTipsTotal) {
            refs.salesHistoryTipsTotal.textContent = api.money(summary.propinas_total || 0);
        }
        renderSalesTipsByWaiter(summary.propinas_por_mesero || []);

        if (sales.length === 0) {
            refs.salesHistoryList.innerHTML = `<p class="empty-state">No hay ventas en el periodo seleccionado.</p>`;
            return;
        }

        refs.salesHistoryList.innerHTML = sales
            .map((sale) => {
                const methods = Array.isArray(sale.metodos) ? sale.metodos : [];
                const payments = Array.isArray(sale.pagos) ? sale.pagos : [];
                const badges = methods.length > 0
                    ? methods.map((method) => `<span class="sale-history-badge">${escapeHtml(method)}</span>`).join("")
                    : `<span class="sale-history-badge">Sin registro</span>`;

                const paymentsText = payments.length > 0
                    ? payments.map((payment) => `${escapeHtml(payment.metodo_label || payment.metodo || "Pago")}: ${api.money(payment.monto || 0)}`).join(" | ")
                    : "Sin pagos registrados";
                const waiterName = sale.mesero_nombre || "Sin mesero asignado";
                const waiterUser = sale.mesero_usuario ? ` (${sale.mesero_usuario})` : "";

                return `
                    <article class="sale-history-card">
                        <div class="sale-history-head">
                            <strong>Comanda #${sale.comanda_id} - Mesa ${sale.mesa_numero || "-"}</strong>
                            <strong>${api.money(sale.total || 0)}</strong>
                        </div>
                        <p class="muted">Cerrada: ${escapeHtml(sale.cerrada_en || "-")}</p>
                        <p class="muted">Mesero: ${escapeHtml(waiterName)}${escapeHtml(waiterUser)}</p>
                        <div class="sale-history-meta">${badges}</div>
                        <p class="muted">${escapeHtml(paymentsText)}</p>
                        <p class="muted">Pagado: ${api.money(sale.total_pagado || 0)} - Propina: ${api.money(sale.propina || 0)} - Diferencia: ${api.money(sale.diferencia_pago || 0)}</p>
                    </article>
                `;
            })
            .join("");
    }

    function renderSalesTipsByWaiter(rows) {
        if (!refs.salesHistoryTipsByWaiter) {
            return;
        }

        const list = Array.isArray(rows) ? rows : [];
        if (list.length === 0) {
            refs.salesHistoryTipsByWaiter.innerHTML = `<p class="empty-state">Sin propinas acumuladas por mesero en el periodo.</p>`;
            return;
        }

        refs.salesHistoryTipsByWaiter.innerHTML = list
            .map((row) => {
                const name = row.mesero_nombre || "Sin mesero asignado";
                const user = row.mesero_usuario ? ` (${row.mesero_usuario})` : "";
                return `
                    <article class="sales-tip-card">
                        <div>
                            <strong>${escapeHtml(name)}${escapeHtml(user)}</strong>
                            <small>Ventas: ${Number(row.ventas_cantidad || 0)} - Con propina: ${Number(row.ventas_con_propina || 0)}</small>
                        </div>
                        <strong>${api.money(row.propina_total || 0)}</strong>
                    </article>
                `;
            })
            .join("");
    }

    function renderMesas() {
        if (state.mesas.length === 0) {
            refs.mesasGrid.innerHTML = `<p class="empty-state">No hay mesas cargadas.</p>`;
            return;
        }

        refs.mesasGrid.innerHTML = state.mesas
            .map((mesa) => {
                const selected = Number(mesa.numero) === Number(state.selectedMesa) ? "selected" : "";
                const estadoClass = mesa.estado === "ocupada" ? "ocupada" : "libre";
                const isNew = isMesaHighlighted(Number(mesa.numero)) ? "new-comanda" : "";
                return `
                    <button type="button" class="mesa-card ${estadoClass} ${selected} ${isNew}" data-mesa="${mesa.numero}">
                        <strong>Mesa ${mesa.numero}</strong>
                        <span>Estado: ${mesa.estado}</span>
                        <span>Items: ${mesa.total_items || 0}</span>
                        <span>Total: ${api.money(mesa.comanda_total || 0)}</span>
                    </button>
                `;
            })
            .join("");
    }

    function renderCashierAccounts() {
        if (!state.cashEnabled || !refs.cashierSummaryList || state.isCashier) {
            return;
        }

        const accounts = Array.isArray(state.cuentas) ? state.cuentas : [];
        if (accounts.length === 0) {
            refs.cashierSummaryList.innerHTML = `<p class="empty-state">No hay cuentas abiertas en este momento.</p>`;
            return;
        }

        refs.cashierSummaryList.innerHTML = accounts
            .map((account) => {
                const items = Array.isArray(account.items) ? account.items : [];
                const itemsHtml = items.length > 0
                    ? items
                        .map((item) => `
                            <div class="summary-item">
                                <div>
                                    <strong>${item.cantidad} x ${escapeHtml(item.descripcion)}</strong>
                                    ${item.notas ? `<small>Nota: ${escapeHtml(item.notas)}</small>` : ""}
                                </div>
                                <strong>${api.money(item.subtotal)}</strong>
                            </div>
                        `)
                        .join("")
                    : `<p class="empty-state">Sin items.</p>`;

                return `
                    <article class="summary-card ${isMesaHighlighted(Number(account.mesa_numero)) ? "new-comanda" : ""}">
                        <div class="summary-header">
                            <h4>Mesa ${account.mesa_numero}</h4>
                            <strong>${api.money(account.total || 0)}</strong>
                        </div>
                        <p class="muted">Items: ${account.total_items || 0}</p>
                        <div class="summary-items">${itemsHtml}</div>
                    </article>
                `;
            })
            .join("");
    }

    function detectNewComandas(nextMesas) {
        const nextOpen = new Map();
        (nextMesas || []).forEach((mesa) => {
            const mesaNumero = Number(mesa.numero || 0);
            const comandaId = Number(mesa.comanda_id || 0);
            if (mesaNumero > 0 && comandaId > 0) {
                nextOpen.set(mesaNumero, comandaId);
            }
        });

        if (!state.hasMesaBaseline) {
            state.knownOpenComandas = nextOpen;
            state.hasMesaBaseline = true;
            return [];
        }

        const nuevas = [];
        nextOpen.forEach((comandaId, mesaNumero) => {
            const previous = state.knownOpenComandas.get(mesaNumero);
            if (!previous || previous !== comandaId) {
                nuevas.push(mesaNumero);
            }
        });

        state.knownOpenComandas = nextOpen;
        return nuevas;
    }

    function markNewMesas(mesas) {
        const expiresAt = Date.now() + 45000;
        (mesas || []).forEach((mesaNumero) => {
            state.highlightedMesas.set(Number(mesaNumero), expiresAt);
        });
    }

    function pruneMesaHighlights() {
        const now = Date.now();
        state.highlightedMesas.forEach((expiresAt, mesaNumero) => {
            if (Number(expiresAt) <= now) {
                state.highlightedMesas.delete(Number(mesaNumero));
            }
        });
    }

    function isMesaHighlighted(mesaNumero) {
        pruneMesaHighlights();
        const expiresAt = Number(state.highlightedMesas.get(Number(mesaNumero)) || 0);
        return expiresAt > Date.now();
    }

    async function openUserMenu() {
        await loadAlertSettings(true);
        renderUserMenuInfo();
        refs.userMenuModal.classList.remove("hidden");
    }

    function closeUserMenu() {
        refs.userMenuModal.classList.add("hidden");
    }

    function renderUserMenuInfo() {
        if (!refs.userSoundStatus || !refs.userSoundToneLabel) {
            return;
        }
        refs.userSoundStatus.textContent = state.soundEnabled ? "Activo" : "Desactivado";
        refs.userSoundToneLabel.textContent = toneLabel(state.soundTone);
    }

    function toneLabel(toneId) {
        const labels = {
            tono_1: "Tono 1 - Bombero",
            tono_2: "Tono 2 - Sirena suave",
            tono_3: "Tono 3 - Doble pitido",
            tono_4: "Tono 4 - Ascendente",
            tono_5: "Tono 5 - Descendente",
            tono_6: "Tono 6 - Triple rapido",
            tono_7: "Tono 7 - Pulso grave",
            tono_8: "Tono 8 - Pulso agudo",
            tono_9: "Tono 9 - Alarma corta",
            tono_10: "Tono 10 - Campana corta"
        };
        return labels[String(toneId || "tono_1")] || labels.tono_1;
    }

    function playNewComandaSound() {
        if (!state.soundEnabled) {
            return;
        }

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

            const toneId = String(state.soundTone || "tono_1").toLowerCase();
            if (toneId === "tono_1") {
                playBomberoSiren(ctx);
                return;
            }

            const pattern = soundPatternForTone(toneId);
            let startAt = ctx.currentTime + 0.02;
            pattern.forEach((step) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = step.type || "sine";
                osc.frequency.setValueAtTime(step.from, startAt);
                if (typeof step.to === "number") {
                    osc.frequency.linearRampToValueAtTime(step.to, startAt + step.dur);
                }

                gain.gain.setValueAtTime(0.0001, startAt);
                gain.gain.exponentialRampToValueAtTime(step.volume || 0.22, startAt + 0.015);
                gain.gain.exponentialRampToValueAtTime(0.0001, startAt + step.dur);

                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(startAt);
                osc.stop(startAt + step.dur + 0.02);

                startAt += step.dur + (step.gap || 0.03);
            });
        } catch (_error) {
            // Ignorado: si el navegador bloquea audio automatico.
        }
    }

    function playBomberoSiren(ctx) {
        const startAt = ctx.currentTime + 0.02;
        const cycle = 1.45;
        const duration = cycle * 2;

        const master = ctx.createGain();
        master.gain.setValueAtTime(0.0001, startAt);
        master.gain.exponentialRampToValueAtTime(0.95, startAt + 0.06);
        master.gain.exponentialRampToValueAtTime(0.95, startAt + duration - 0.16);
        master.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
        master.connect(ctx.destination);

        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1650, startAt);
        filter.Q.setValueAtTime(0.9, startAt);
        filter.connect(master);

        const main = ctx.createOscillator();
        const mainGain = ctx.createGain();
        main.type = "sawtooth";
        main.frequency.setValueAtTime(520, startAt);
        main.frequency.linearRampToValueAtTime(1040, startAt + cycle / 2);
        main.frequency.linearRampToValueAtTime(520, startAt + cycle);
        main.frequency.linearRampToValueAtTime(1040, startAt + cycle + cycle / 2);
        main.frequency.linearRampToValueAtTime(520, startAt + duration);
        mainGain.gain.setValueAtTime(0.17, startAt);
        main.connect(mainGain);
        mainGain.connect(filter);

        const layer = ctx.createOscillator();
        const layerGain = ctx.createGain();
        layer.type = "triangle";
        layer.frequency.setValueAtTime(520, startAt);
        layer.frequency.linearRampToValueAtTime(1040, startAt + cycle / 2);
        layer.frequency.linearRampToValueAtTime(520, startAt + cycle);
        layer.frequency.linearRampToValueAtTime(1040, startAt + cycle + cycle / 2);
        layer.frequency.linearRampToValueAtTime(520, startAt + duration);
        layer.detune.setValueAtTime(7, startAt);
        layerGain.gain.setValueAtTime(0.09, startAt);
        layer.connect(layerGain);
        layerGain.connect(filter);

        const vibrato = ctx.createOscillator();
        const vibratoGain = ctx.createGain();
        vibrato.type = "sine";
        vibrato.frequency.setValueAtTime(6.2, startAt);
        vibratoGain.gain.setValueAtTime(9, startAt);
        vibrato.connect(vibratoGain);
        vibratoGain.connect(main.frequency);
        vibratoGain.connect(layer.frequency);

        main.start(startAt);
        layer.start(startAt);
        vibrato.start(startAt);
        main.stop(startAt + duration + 0.04);
        layer.stop(startAt + duration + 0.04);
        vibrato.stop(startAt + duration + 0.04);
    }

    function soundPatternForTone(toneId) {
        const patterns = {
            tono_1: [
                { from: 430, to: 980, dur: 0.92, gap: 0.02, type: "triangle", volume: 0.2 },
                { from: 980, to: 430, dur: 0.92, gap: 0.02, type: "triangle", volume: 0.2 }
            ],
            tono_2: [
                { from: 760, to: 560, dur: 0.18, gap: 0.05, type: "sine" },
                { from: 560, to: 760, dur: 0.18, gap: 0.04, type: "sine" }
            ],
            tono_3: [
                { from: 900, dur: 0.08, gap: 0.04, type: "square" },
                { from: 900, dur: 0.08, gap: 0.14, type: "square" },
                { from: 700, dur: 0.09, gap: 0.03, type: "square" }
            ],
            tono_4: [
                { from: 500, to: 900, dur: 0.22, gap: 0.04, type: "triangle" },
                { from: 640, to: 980, dur: 0.2, gap: 0.03, type: "triangle" }
            ],
            tono_5: [
                { from: 980, to: 540, dur: 0.22, gap: 0.04, type: "triangle" },
                { from: 860, to: 500, dur: 0.2, gap: 0.03, type: "triangle" }
            ],
            tono_6: [
                { from: 870, dur: 0.06, gap: 0.02, type: "square" },
                { from: 870, dur: 0.06, gap: 0.02, type: "square" },
                { from: 870, dur: 0.06, gap: 0.11, type: "square" },
                { from: 650, dur: 0.08, gap: 0.03, type: "square" }
            ],
            tono_7: [
                { from: 360, dur: 0.14, gap: 0.05, type: "sine", volume: 0.28 },
                { from: 420, dur: 0.14, gap: 0.04, type: "sine", volume: 0.28 }
            ],
            tono_8: [
                { from: 980, dur: 0.12, gap: 0.03, type: "sine", volume: 0.18 },
                { from: 1180, dur: 0.12, gap: 0.04, type: "sine", volume: 0.18 }
            ],
            tono_9: [
                { from: 760, to: 640, dur: 0.09, gap: 0.02, type: "sawtooth" },
                { from: 760, to: 640, dur: 0.09, gap: 0.02, type: "sawtooth" },
                { from: 760, to: 640, dur: 0.09, gap: 0.12, type: "sawtooth" }
            ],
            tono_10: [
                { from: 1200, dur: 0.05, gap: 0.03, type: "triangle", volume: 0.17 },
                { from: 900, dur: 0.1, gap: 0.12, type: "triangle", volume: 0.2 }
            ]
        };

        const key = String(toneId || "tono_1").toLowerCase();
        return patterns[key] || patterns.tono_1;
    }

    function renderCashStatus() {
        if (!state.cashEnabled) {
            return;
        }

        const status = state.cashStatus || {};
        const isOpen = Boolean(status.abierta);
        const resumen = status.resumen || {};

        if (!isOpen) {
            refs.cashSessionStatus.textContent = "Caja cerrada";
            refs.cashOpenForm.classList.remove("hidden");
            refs.cashOpenInfo.classList.add("hidden");
            if (state.isCashier) {
                showCashGate();
            }
            updateChargeAvailability();
            return;
        }

        const sesion = status.sesion || {};
        refs.cashSessionStatus.textContent = `Abierta por ${sesion.usuario_nombre || sesion.usuario_login || "-"} desde ${sesion.abierta_en || "-"}`;
        refs.cashOpenForm.classList.add("hidden");
        refs.cashOpenInfo.classList.remove("hidden");

        refs.cashKpiInicial.textContent = formatCashAmount("inicial", resumen.monto_inicial || 0);
        refs.cashKpiVentas.textContent = formatCashAmountWithCount("ventas", resumen.ventas_total || 0, resumen.ventas_cantidad || 0);
        refs.cashKpiEfectivo.textContent = formatCashAmountWithCount("efectivo", resumen.efectivo_total || 0, resumen.efectivo_cantidad || 0);
        refs.cashKpiTarjeta.textContent = formatCashAmountWithCount("tarjeta", resumen.tarjeta_total || 0, resumen.tarjeta_cantidad || 0);
        refs.cashKpiTransferencia.textContent = formatCashAmountWithCount("transferencia", resumen.transferencia_total || 0, resumen.transferencia_cantidad || 0);
        refs.cashKpiEsperado.textContent = formatCashAmount("esperado", resumen.efectivo_esperado || 0);

        hideCashGate();
        updateChargeAvailability();
    }

    function renderCashCloseSummary(resumen) {
        if (
            !refs.cashCloseVentasTotal ||
            !refs.cashCloseVentasCantidad ||
            !refs.cashCloseEfectivo ||
            !refs.cashCloseTarjeta ||
            !refs.cashCloseTransferencia ||
            !refs.cashCloseEsperado
        ) {
            return;
        }

        const summary = resumen || {};
        refs.cashCloseVentasTotal.textContent = formatCashAmount("ventas", summary.ventas_total || 0);
        refs.cashCloseVentasCantidad.textContent = String(summary.ventas_cantidad || 0);
        refs.cashCloseEfectivo.textContent = formatCashAmount("efectivo", summary.efectivo_total || 0);
        refs.cashCloseTarjeta.textContent = formatCashAmount("tarjeta", summary.tarjeta_total || 0);
        refs.cashCloseTransferencia.textContent = formatCashAmount("transferencia", summary.transferencia_total || 0);
        refs.cashCloseEsperado.textContent = formatCashAmount("esperado", summary.efectivo_esperado || 0);
    }

    async function openCashWithValue(rawValue) {
        const amount = Number(rawValue || 0);
        if (!Number.isFinite(amount) || amount < 0) {
            toast("Ingresa un monto inicial valido.", "error");
            return;
        }

        try {
            const response = await api.openCashSession(amount);
            state.cashStatus = response.data || state.cashStatus;
            refs.cashOpenAmount.value = "";
            refs.cashGateAmount.value = "";
            renderCashStatus();
            toast(response.mensaje || "Caja abierta.");
        } catch (error) {
            toast(error.message, "error");
        }
    }

    async function closeCashSession() {
        if (!state.cashEnabled) {
            return;
        }

        if (!state.cashStatus || !state.cashStatus.abierta) {
            toast("No hay caja abierta para cerrar.", "error");
            return;
        }

        const pendingAccounts = Array.isArray(state.cuentas)
            ? state.cuentas.filter((account) => Number(account && account.comanda_id ? account.comanda_id : 0) > 0)
            : [];
        if (pendingAccounts.length > 0) {
            const mesasPendientes = [...new Set(
                pendingAccounts
                    .map((account) => Number(account && account.mesa_numero ? account.mesa_numero : 0))
                    .filter((mesaNumero) => Number.isFinite(mesaNumero) && mesaNumero > 0)
            )].sort((a, b) => a - b);
            const mesasTexto = mesasPendientes.length > 0 ? ` (${mesasPendientes.join(", ")})` : "";
            toast(`No puedes cerrar caja: hay mesas pendientes${mesasTexto}.`, "error");
            return;
        }

        if (!refs.cashCloseModal || !refs.cashCloseForm) {
            toast("No se pudo abrir el formulario de cierre.", "error");
            return;
        }

        const resumen = state.cashStatus.resumen || {};
        const esperado = Number(resumen.efectivo_esperado || 0);

        renderCashCloseSummary(resumen);
        refs.cashCloseCounted.value = isCashAmountVisible("esperado") ? String(Math.round(esperado)) : "";
        refs.cashCloseNotes.value = "";
        refs.btnCashCloseConfirm.disabled = false;

        updateCashCloseDifference();
        refs.cashCloseModal.classList.remove("hidden");
        refs.cashCloseCounted.focus();
        refs.cashCloseCounted.select();
    }

    function hideCashCloseModal() {
        if (!refs.cashCloseModal) {
            return;
        }
        refs.cashCloseModal.classList.add("hidden");
    }

    function updateCashCloseDifference() {
        if (!refs.cashCloseDiff) {
            return;
        }

        const esperado = Number((state.cashStatus && state.cashStatus.resumen && state.cashStatus.resumen.efectivo_esperado) || 0);
        const contadoRaw = Number(refs.cashCloseCounted ? refs.cashCloseCounted.value : 0);
        const contado = Number.isFinite(contadoRaw) ? contadoRaw : 0;
        const diferencia = Math.round((contado - esperado) * 100) / 100;

        refs.cashCloseDiff.classList.remove("cash-close-diff-ok", "cash-close-diff-up", "cash-close-diff-down");
        if (Math.abs(diferencia) <= 0.01) {
            refs.cashCloseDiff.textContent = isCashAmountVisible("cierre_diferencia")
                ? `Cuadrado: ${api.money(contado)} (diferencia ${api.money(0)})`
                : "Cuadrado: **** (diferencia ****)";
            refs.cashCloseDiff.classList.add("cash-close-diff-ok");
            return;
        }
        if (diferencia > 0) {
            refs.cashCloseDiff.textContent = isCashAmountVisible("cierre_diferencia")
                ? `Sobrante: ${api.money(diferencia)} (contado ${api.money(contado)})`
                : "Sobrante: **** (contado ****)";
            refs.cashCloseDiff.classList.add("cash-close-diff-up");
            return;
        }

        refs.cashCloseDiff.textContent = isCashAmountVisible("cierre_diferencia")
            ? `Faltante: ${api.money(Math.abs(diferencia))} (contado ${api.money(contado)})`
            : "Faltante: **** (contado ****)";
        refs.cashCloseDiff.classList.add("cash-close-diff-down");
    }

    async function submitCashClose(event) {
        event.preventDefault();
        const countedAmount = Number(refs.cashCloseCounted.value || 0);
        if (!Number.isFinite(countedAmount) || countedAmount < 0) {
            toast("Monto final invalido.", "error");
            return;
        }

        const notes = String(refs.cashCloseNotes.value || "").trim();
        refs.btnCashCloseConfirm.disabled = true;

        try {
            const response = await api.closeCashSession(countedAmount, notes);
            state.cashStatus = response.data || null;
            renderCashStatus();
            hideCashCloseModal();

            const cierre = response.cierre || {};
            const resumen = cierre.resumen || {};
            const esperado = Number(resumen.efectivo_esperado || 0);
            const contado = Number(cierre.sesion && cierre.sesion.monto_final_declarado ? cierre.sesion.monto_final_declarado : countedAmount);
            const diferencia = Number(cierre.diferencia || 0);

            const detalle = Math.abs(diferencia) <= 0.01
                ? `Cuadrado. Esperado ${api.money(esperado)} / Contado ${api.money(contado)}`
                : `Esperado ${api.money(esperado)} / Contado ${api.money(contado)} / Diferencia ${api.money(diferencia)}`;
            toast(`${response.mensaje || "Caja cerrada."} ${detalle}`);
        } catch (error) {
            toast(error.message, "error");
        } finally {
            refs.btnCashCloseConfirm.disabled = false;
        }
    }

    function showCashGate() {
        if (!state.isCashier || !refs.cashGate) {
            return;
        }
        refs.cashGate.classList.remove("hidden");
    }

    function hideCashGate() {
        if (!refs.cashGate) {
            return;
        }
        refs.cashGate.classList.add("hidden");
    }

    function updateChargeAvailability() {
        if (!state.isCashier) {
            refs.btnCobrar.disabled = false;
            return;
        }

        const hasOpenCash = Boolean(state.cashStatus && state.cashStatus.abierta);
        refs.btnCobrar.disabled = !hasOpenCash;
    }

    async function refreshDetail(silent) {
        if (!state.selectedMesa) {
            refs.detailEmpty.classList.remove("hidden");
            refs.detailContent.classList.add("hidden");
            refs.detailTitle.textContent = "Selecciona una mesa";
            refs.detailMeta.textContent = "-";
            return;
        }

        try {
            const snapshot = await api.getComanda(state.selectedMesa);
            renderDetail(snapshot);
        } catch (error) {
            if (!silent) {
                toast(error.message, "error");
            }
        }
    }

    function renderDetail(snapshot) {
        refs.detailEmpty.classList.add("hidden");
        refs.detailContent.classList.remove("hidden");
        refs.detailTitle.textContent = `Mesa ${state.selectedMesa}`;
        const mesaEstado = snapshot && snapshot.mesa ? snapshot.mesa.estado : "sin datos";
        refs.detailMeta.textContent = `Estado: ${mesaEstado}`;

        if (!snapshot || !snapshot.comanda) {
            refs.detailItems.innerHTML = `<p class="empty-state">Sin comanda abierta. Agrega productos para iniciar una.</p>`;
            refs.detailTotal.textContent = api.money(0);
            return;
        }

        refs.detailTotal.textContent = api.money(snapshot.comanda.total || 0);
        const items = snapshot.items || [];
        if (items.length === 0) {
            refs.detailItems.innerHTML = `<p class="empty-state">Comanda sin items.</p>`;
            return;
        }

        refs.detailItems.innerHTML = items
            .map((item) => `
                <div class="comanda-item">
                    <div>
                        <strong>${item.cantidad} x ${escapeHtml(item.descripcion)}</strong>
                        ${item.notas ? `<small>Nota: ${escapeHtml(item.notas)}</small>` : ""}
                    </div>
                    <strong>${api.money(item.subtotal)}</strong>
                </div>
            `)
            .join("");
    }

    function renderMiniMenu() {
        const categories = Object.entries(state.menu || {});
        if (categories.length === 0) {
            refs.miniMenu.innerHTML = `<p class="empty-state">Menu no disponible.</p>`;
            return;
        }

        refs.miniMenu.innerHTML = categories
            .map(([categoria, products]) => `
                <section class="mini-group">
                    <h4>${escapeHtml(categoria)}</h4>
                    ${(products || [])
                        .map((product) => `
                            <div class="mini-product">
                                <span>${escapeHtml(product.nombre)} - ${api.money(product.precio)}</span>
                                <button type="button" class="btn btn-outline btn-small" data-add="${product.id}">Agregar</button>
                            </div>
                        `)
                        .join("")}
                </section>
            `)
            .join("");
    }

    function getMiniQty(productId) {
        return Number(state.miniCart.get(productId) || 0);
    }

    function setMiniQty(productId, qty) {
        const next = Math.max(0, Number(qty || 0));
        if (next <= 0) {
            state.miniCart.delete(productId);
        } else {
            state.miniCart.set(productId, next);
        }
        renderMiniCart();
    }

    function renderMiniCart() {
        const rows = [...state.miniCart.entries()];
        if (rows.length === 0) {
            refs.miniCart.innerHTML = `<p class="empty-state">No hay productos para agregar.</p>`;
            return;
        }

        refs.miniCart.innerHTML = rows
            .map(([id, qty]) => {
                const product = state.productsById.get(Number(id));
                if (!product) {
                    return "";
                }
                return `
                    <div class="cart-item">
                        <div>
                            <strong>${escapeHtml(product.nombre)}</strong>
                            <small>${api.money(product.precio)} c/u</small>
                        </div>
                        <div class="mini-qty-actions">
                            <button type="button" data-mini-action="minus" data-id="${id}">-</button>
                            <span>${qty}</span>
                            <button type="button" data-mini-action="plus" data-id="${id}">+</button>
                        </div>
                    </div>
                `;
            })
            .join("");
    }

    async function addItemsToComanda() {
        if (!state.selectedMesa) {
            toast("Selecciona una mesa.", "error");
            return;
        }

        const items = [...state.miniCart.entries()].map(([id, qty]) => ({
            producto_id: Number(id),
            cantidad: Number(qty)
        }));

        if (items.length === 0) {
            toast("Agrega productos antes de enviar.", "error");
            return;
        }

        refs.btnAgregarItems.disabled = true;
        try {
            const response = await api.sendOrder(state.selectedMesa, items, "pc");
            state.miniCart.clear();
            renderMiniCart();
            await Promise.all([loadMesas(true), refreshDetail(true), loadCashierAccounts(true)]);
            const printStatus = response && response.impresion ? response.impresion : null;
            const printSkippedByConfig = isPrintOmittedByConfig(printStatus);

            if (printStatus && !printStatus.ok && !printSkippedByConfig) {
                toast(`Comanda actualizada, pero fallo impresion: ${printStatus.detalle}`, "error");
                return;
            }
            if (printStatus && printStatus.warning && !printSkippedByConfig) {
                toast(`Items agregados. Aviso impresion: ${printStatus.warning}`, "error");
                return;
            }
            toast("Items agregados a la comanda.");
        } catch (error) {
            toast(error.message, "error");
        } finally {
            refs.btnAgregarItems.disabled = false;
        }
    }

    async function printPrecuenta() {
        if (!state.selectedMesa) {
            toast("Selecciona una mesa.", "error");
            return;
        }

        try {
            const response = await api.printBill(state.selectedMesa);
            if (response.impresion && !response.impresion.ok) {
                toast(`Precuenta generada, pero fallo impresion: ${response.impresion.detalle}`, "error");
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

    async function cobrarMesa() {
        if (!state.selectedMesa) {
            toast("Selecciona una mesa.", "error");
            return;
        }

        if (state.isCashier && !(state.cashStatus && state.cashStatus.abierta)) {
            toast("Debes abrir caja antes de cobrar mesas.", "error");
            showCashGate();
            return;
        }

        let totalMesa = 0;
        try {
            const snapshot = await api.getComanda(state.selectedMesa);
            totalMesa = Number(snapshot && snapshot.comanda ? snapshot.comanda.total : 0);
        } catch (error) {
            toast(error.message, "error");
            return;
        }

        if (!Number.isFinite(totalMesa) || totalMesa <= 0) {
            toast("La mesa no tiene total valido para cobrar.", "error");
            return;
        }

        const payment = await pickPaymentMethod(state.selectedMesa, totalMesa);
        if (!payment) {
            return;
        }

        refs.btnCobrar.disabled = true;
        try {
            const response = await api.chargeTable(state.selectedMesa, payment);
            await Promise.all([
                loadMesas(true),
                refreshDetail(true),
                loadCashierAccounts(true),
                loadCashStatus(true),
                loadSalesHistory(true)
            ]);

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
            refs.btnCobrar.disabled = false;
            updateChargeAvailability();
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
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        return `${now.getFullYear()}-${month}-${day}`;
    }

    function formatKitchenDateTime(value) {
        const raw = String(value || "").trim();
        if (!raw) {
            return "-";
        }

        const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
        const parsed = new Date(normalized);
        if (Number.isNaN(parsed.getTime())) {
            return raw;
        }

        const day = parsed.toLocaleDateString("es-CL", {
            day: "2-digit",
            month: "2-digit"
        });
        const hour = parsed.toLocaleTimeString("es-CL", {
            hour: "2-digit",
            minute: "2-digit"
        });
        return `${day} ${hour}`;
    }

    function toast(message, type) {
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
        if (String(printStatus.estado || "").toLowerCase() === "omitida") {
            return true;
        }

        const detail = String(printStatus.detalle || "").toLowerCase();
        return detail.includes("desactivada en configuracion")
            || detail.includes("desactivada en configuración")
            || detail.includes("sin impresora configurada");
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
})();
