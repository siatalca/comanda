(function () {
    const api = window.ComandaAPI;
    if (!api) {
        return;
    }

    const state = {
        data: null,
        audioContext: null,
        currentUser: null
    };

    const refs = {};

    document.addEventListener("DOMContentLoaded", init);

    async function init() {
        bindRefs();
        bindEvents();
        try {
            await ensureAdminSession();
            hydrateHeaderUser();
            await loadBootstrap();
            showAdminContent(true);
        } catch (error) {
            toast(error.message, "error");
            window.location.href = "login.html";
        }
    }

    function bindRefs() {
        refs.adminLoginCard = document.getElementById("adminLoginCard");
        refs.adminLoginForm = document.getElementById("adminLoginForm");
        refs.loginUsuario = document.getElementById("loginUsuario");
        refs.loginPassword = document.getElementById("loginPassword");
        refs.adminContent = document.getElementById("adminContent");
        refs.btnAdminLogout = document.getElementById("btnAdminLogout");
        refs.adminQuickNav = document.getElementById("adminQuickNav");
        refs.adminDetailsProducts = document.getElementById("adminDetailsProducts");
        refs.adminDetailsSettings = document.getElementById("adminDetailsSettings");
        refs.adminDetailsPrinters = document.getElementById("adminDetailsPrinters");
        refs.adminDetailsTables = document.getElementById("adminDetailsTables");
        refs.adminDetailsUsers = document.getElementById("adminDetailsUsers");
        refs.adminPanels = [
            refs.adminDetailsProducts,
            refs.adminDetailsSettings,
            refs.adminDetailsPrinters,
            refs.adminDetailsTables,
            refs.adminDetailsUsers
        ].filter(Boolean);
        refs.adminQuickButtons = refs.adminQuickNav
            ? Array.from(refs.adminQuickNav.querySelectorAll("button[data-open-target]"))
            : [];

        refs.settingsForm = document.getElementById("settingsForm");
        refs.settingNombreLocal = document.getElementById("settingNombreLocal");
        refs.settingMoneda = document.getElementById("settingMoneda");
        refs.settingImprimirPedidos = document.getElementById("settingImprimirPedidos");
        refs.settingPropinaHabilitada = document.getElementById("settingPropinaHabilitada");
        refs.settingAlertaSonidoActivo = document.getElementById("settingAlertaSonidoActivo");
        refs.settingAlertaTono = document.getElementById("settingAlertaTono");

        refs.printersForm = document.getElementById("printersForm");
        refs.printerMode = document.getElementById("printerMode");
        refs.printerKitchen = document.getElementById("printerKitchen");
        refs.printerCashier = document.getElementById("printerCashier");
        refs.ticketPaperMm = document.getElementById("ticketPaperMm");
        refs.ticketChars = document.getElementById("ticketChars");
        refs.ticketFontPt = document.getElementById("ticketFontPt");
        refs.printersStatus = document.getElementById("printersStatus");

        refs.tablesForm = document.getElementById("tablesForm");
        refs.tablesCount = document.getElementById("tablesCount");

        refs.productForm = document.getElementById("productForm");
        refs.productId = document.getElementById("productId");
        refs.productName = document.getElementById("productName");
        refs.productCategory = document.getElementById("productCategory");
        refs.productPrice = document.getElementById("productPrice");
        refs.productRequiresAddonRow = document.getElementById("productRequiresAddonRow");
        refs.productRequiresAddon = document.getElementById("productRequiresAddon");
        refs.productActive = document.getElementById("productActive");
        refs.btnProductReset = document.getElementById("btnProductReset");
        refs.productsTable = document.getElementById("productsTable");

        refs.userForm = document.getElementById("userForm");
        refs.userId = document.getElementById("userId");
        refs.userName = document.getElementById("userName");
        refs.userUsername = document.getElementById("userUsername");
        refs.userRole = document.getElementById("userRole");
        refs.userPassword = document.getElementById("userPassword");
        refs.userActive = document.getElementById("userActive");
        refs.btnUserReset = document.getElementById("btnUserReset");
        refs.usersTable = document.getElementById("usersTable");

        refs.toast = document.getElementById("toast");
        refs.adminUserLabel = document.getElementById("adminUserLabel");
    }

    async function ensureAdminSession() {
        const session = await api.session();
        if (!session || !session.logged || !session.user) {
            throw new Error("Debes iniciar sesion.");
        }
        const role = String(session.user.rol || "").toLowerCase();
        if (role !== "admin") {
            throw new Error("Este usuario no tiene permisos de administracion.");
        }
        state.currentUser = session.user;
    }

    function hydrateHeaderUser() {
        if (!refs.adminUserLabel || !state.currentUser) {
            return;
        }
        refs.adminUserLabel.textContent = `Usuario: ${state.currentUser.nombre} (${state.currentUser.rol})`;
    }

    function bindEvents() {
        if (refs.adminLoginForm) {
            refs.adminLoginForm.addEventListener("submit", handleLogin);
        }
        if (refs.btnAdminLogout) {
            refs.btnAdminLogout.addEventListener("click", handleLogout);
        }
        if (refs.adminQuickNav) {
            refs.adminQuickNav.addEventListener("click", (event) => {
                const button = event.target.closest("button[data-open-target]");
                if (!button) {
                    return;
                }
                openAdminPanel(String(button.dataset.openTarget || ""));
            });
        }
        refs.adminPanels.forEach((panel) => {
            panel.addEventListener("toggle", () => {
                if (panel.open) {
                    refs.adminPanels.forEach((otherPanel) => {
                        if (otherPanel !== panel) {
                            otherPanel.open = false;
                        }
                    });
                }
                syncAdminQuickNav();
            });
        });

        refs.settingsForm.addEventListener("submit", saveSettings);
        refs.printersForm.addEventListener("submit", savePrinters);
        refs.tablesForm.addEventListener("submit", saveTables);

        refs.productForm.addEventListener("submit", saveProduct);
        refs.btnProductReset.addEventListener("click", resetProductForm);
        refs.productsTable.addEventListener("click", handleProductsActions);
        refs.productCategory.addEventListener("change", syncProductRequiresAddon);

        refs.userForm.addEventListener("submit", saveUser);
        refs.btnUserReset.addEventListener("click", resetUserForm);
        refs.usersTable.addEventListener("click", handleUsersActions);

        refs.ticketPaperMm.addEventListener("change", () => {
            const mm = Number(refs.ticketPaperMm.value || 58);
            const currentChars = Number(refs.ticketChars.value || 0);
            if (mm <= 60 && (currentChars === 0 || currentChars > 40)) {
                refs.ticketChars.value = 32;
            }
            if (mm > 60 && (currentChars === 0 || currentChars < 36)) {
                refs.ticketChars.value = 42;
            }
        });

        refs.settingAlertaSonidoActivo.addEventListener("change", () => {
            refs.settingAlertaTono.disabled = !refs.settingAlertaSonidoActivo.checked;
            if (refs.settingAlertaSonidoActivo.checked) {
                playAlertTonePreview(refs.settingAlertaTono.value || "tono_1");
            }
        });
        refs.settingAlertaTono.addEventListener("change", () => {
            if (!refs.settingAlertaSonidoActivo.checked) {
                return;
            }
            playAlertTonePreview(refs.settingAlertaTono.value || "tono_1");
        });
    }

    function openAdminPanel(panelId) {
        if (!panelId) {
            return;
        }

        const panels = Array.isArray(refs.adminPanels) ? refs.adminPanels : [];

        panels.forEach((panel) => {
            panel.open = panel.id === panelId;
        });

        const target = document.getElementById(panelId);
        if (!target) {
            return;
        }
        target.open = true;
        syncAdminQuickNav(panelId);
        target.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function syncAdminQuickNav(activePanelId) {
        const activeId = String(
            activePanelId
                || (Array.isArray(refs.adminPanels)
                    ? (refs.adminPanels.find((panel) => panel.open) || {}).id
                    : "")
                || ""
        );

        (refs.adminQuickButtons || []).forEach((button) => {
            const targetId = String(button.dataset.openTarget || "");
            const isActive = targetId !== "" && targetId === activeId;
            button.classList.toggle("active", isActive);
            if (isActive) {
                button.setAttribute("aria-current", "true");
            } else {
                button.removeAttribute("aria-current");
            }
        });
    }

    async function checkSession() {
        try {
            const session = await api.adminSession();
            if (session.logged) {
                await loadBootstrap();
                showAdminContent(true);
                return;
            }
            showAdminContent(false);
        } catch (error) {
            toast(error.message, "error");
            showAdminContent(false);
        }
    }

    function showAdminContent(logged) {
        if (refs.adminLoginCard) {
            refs.adminLoginCard.classList.toggle("hidden", logged);
        }
        if (refs.adminContent) {
            refs.adminContent.classList.toggle("hidden", !logged);
        }
        if (refs.btnAdminLogout) {
            refs.btnAdminLogout.classList.toggle("hidden", !logged);
        }
    }

    async function handleLogin(event) {
        event.preventDefault();
        try {
            await api.adminLogin(
                refs.loginUsuario.value.trim(),
                refs.loginPassword.value
            );
            refs.loginPassword.value = "";
            await loadBootstrap();
            showAdminContent(true);
            toast("Sesion admin iniciada.");
        } catch (error) {
            toast(error.message, "error");
        }
    }

    async function handleLogout() {
        try {
            await api.adminLogout();
            window.location.href = "login.html";
        } catch (error) {
            toast(error.message, "error");
        }
    }

    async function loadBootstrap() {
        const response = await api.adminBootstrap();
        state.data = response.data || {};
        hydrateSettings();
        hydratePrinters();
        renderProducts();
        renderUsers();
        syncProductRequiresAddon();
        syncAdminQuickNav();
    }

    function hydrateSettings() {
        const settings = (state.data && state.data.settings) || {};
        refs.settingNombreLocal.value = settings.nombre_local || "Donde Abel";
        refs.settingMoneda.value = settings.moneda_simbolo || "$";
        refs.settingImprimirPedidos.checked = String(settings.imprimir_pedidos || "1") === "1";
        refs.settingPropinaHabilitada.checked = String(settings.propina_habilitada || "1") === "1";
        refs.settingAlertaSonidoActivo.checked = String(settings.alerta_sonido_activo || "1") === "1";
        refs.settingAlertaTono.value = settings.alerta_tono_comanda || "tono_1";
        refs.settingAlertaTono.disabled = !refs.settingAlertaSonidoActivo.checked;
        refs.tablesCount.value = Number(settings.mesas_cantidad || 20);
    }

    function hydratePrinters() {
        const settings = (state.data && state.data.settings) || {};
        const printersInfo = (state.data && state.data.printers) || {};
        const printerList = Array.isArray(printersInfo.printers) ? printersInfo.printers : [];

        refs.printerMode.value = settings.impresora_modo || "una";
        refs.printerKitchen.innerHTML = buildPrinterOptions(printerList, settings.impresora_cocina || "");
        refs.printerCashier.innerHTML = buildPrinterOptions(printerList, settings.impresora_caja || "");
        refs.ticketPaperMm.value = Number(settings.ticket_papel_mm || 58);
        refs.ticketChars.value = Number(settings.ticket_ancho_chars || 32);
        refs.ticketFontPt.value = Number(settings.ticket_fuente_pt || 9);

        if (printersInfo.ok) {
            const def = printersInfo.defaultPrinter ? `Predeterminada: ${printersInfo.defaultPrinter}` : "Sin impresora predeterminada";
            refs.printersStatus.textContent = `Servicio OK. ${printerList.length} impresora(s) detectadas. ${def}.`;
            refs.printersStatus.className = "muted";
            return;
        }

        refs.printersStatus.textContent = `No se pudo leer impresoras: ${printersInfo.error || "servicio no disponible"}`;
        refs.printersStatus.className = "text-error";
    }

    function buildPrinterOptions(printerList, selectedPrinter) {
        const safeList = [...new Set([...(printerList || []), selectedPrinter].filter(Boolean))];
        const options = [`<option value="">Impresora predeterminada del sistema</option>`];
        safeList.forEach((name) => {
            const selected = name === selectedPrinter ? "selected" : "";
            options.push(`<option value="${escapeHtml(name)}" ${selected}>${escapeHtml(name)}</option>`);
        });
        return options.join("");
    }

    async function saveSettings(event) {
        event.preventDefault();
        try {
            const response = await api.adminSaveSettings({
                nombre_local: refs.settingNombreLocal.value.trim(),
                moneda_simbolo: refs.settingMoneda.value.trim(),
                imprimir_pedidos: refs.settingImprimirPedidos.checked ? 1 : 0,
                propina_habilitada: refs.settingPropinaHabilitada.checked ? 1 : 0,
                alerta_sonido_activo: refs.settingAlertaSonidoActivo.checked ? 1 : 0,
                alerta_tono_comanda: refs.settingAlertaTono.value || "tono_1"
            });
            state.data.settings = response.settings || state.data.settings;
            hydrateSettings();
            toast("Configuracion general guardada.");
        } catch (error) {
            toast(error.message, "error");
        }
    }

    async function savePrinters(event) {
        event.preventDefault();
        try {
            const response = await api.adminSavePrinters({
                impresora_modo: refs.printerMode.value,
                impresora_cocina: refs.printerKitchen.value,
                impresora_caja: refs.printerCashier.value,
                ticket_papel_mm: Number(refs.ticketPaperMm.value || 58),
                ticket_ancho_chars: Number(refs.ticketChars.value || 32),
                ticket_fuente_pt: Number(refs.ticketFontPt.value || 9)
            });
            state.data.settings = response.settings || state.data.settings;
            state.data.printers = response.printers || state.data.printers;
            hydratePrinters();
            toast("Impresoras actualizadas.");
        } catch (error) {
            toast(error.message, "error");
        }
    }

    async function saveTables(event) {
        event.preventDefault();
        try {
            const cantidad = Number(refs.tablesCount.value || 0);
            const response = await api.adminSetTables(cantidad);
            refs.tablesCount.value = Number(response.mesas_cantidad || cantidad);
            toast(response.mensaje || "Mesas actualizadas.");
        } catch (error) {
            toast(error.message, "error");
        }
    }

    function renderProducts() {
        const products = Array.isArray(state.data.productos) ? state.data.productos : [];
        if (products.length === 0) {
            refs.productsTable.innerHTML = `<p class="empty-state">No hay productos.</p>`;
            return;
        }

        refs.productsTable.innerHTML = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Nombre</th>
                        <th>Categoria</th>
                        <th>Precio</th>
                        <th>Agregado</th>
                        <th>Activo</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${products
                        .map((item) => `
                            <tr>
                                <td data-label="ID">${item.id}</td>
                                <td data-label="Nombre">${escapeHtml(item.nombre)}</td>
                                <td data-label="Categoria">${escapeHtml(item.categoria)}</td>
                                <td data-label="Precio">${api.money(item.precio)}</td>
                                <td data-label="Agregado">${Number(item.requiere_agregado || 0) === 1 ? "Si" : "No"}</td>
                                <td data-label="Activo">${item.activo === 1 ? "Si" : "No"}</td>
                                <td data-label="Acciones" class="table-actions">
                                    <button class="btn btn-outline btn-small" data-product-edit="${item.id}">Editar</button>
                                    <button class="btn btn-outline btn-small" data-product-toggle="${item.id}" data-product-state="${item.activo === 1 ? 0 : 1}">
                                        ${item.activo === 1 ? "Desactivar" : "Activar"}
                                    </button>
                                </td>
                            </tr>
                        `)
                        .join("")}
                </tbody>
            </table>
        `;
    }

    function resetProductForm() {
        refs.productId.value = "";
        refs.productName.value = "";
        refs.productCategory.value = "Platos";
        refs.productPrice.value = "";
        refs.productRequiresAddon.checked = false;
        refs.productActive.checked = true;
        syncProductRequiresAddon();
    }

    function normalizeProductCategory(category) {
        const value = String(category || "")
            .toLowerCase()
            .trim()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
        if (value.includes("beb")) {
            return "Bebestibles";
        }
        if (value.includes("extra") || value.includes("adic") || value.includes("complement")) {
            return "Extras";
        }
        if (value.includes("otro")) {
            return "Otros";
        }
        if (value.includes("agreg") || value.includes("acompan") || value.includes("guarn")) {
            return "Agregados";
        }
        if (value.includes("post") || value.includes("dulce") || value.includes("helad") || value.includes("torta")) {
            return "Agregados";
        }
        return "Platos";
    }

    function syncProductRequiresAddon() {
        const isPlate = normalizeProductCategory(refs.productCategory.value) === "Platos";
        if (!isPlate) {
            refs.productRequiresAddon.checked = false;
        }
        refs.productRequiresAddon.disabled = !isPlate;
        if (refs.productRequiresAddonRow) {
            refs.productRequiresAddonRow.classList.toggle("muted", !isPlate);
        }
    }

    function handleProductsActions(event) {
        const editBtn = event.target.closest("button[data-product-edit]");
        if (editBtn) {
            const id = Number(editBtn.dataset.productEdit || 0);
            const products = Array.isArray(state.data.productos) ? state.data.productos : [];
            const product = products.find((item) => Number(item.id) === id);
            if (!product) {
                return;
            }

            refs.productId.value = String(product.id);
            refs.productName.value = product.nombre;
            refs.productCategory.value = normalizeProductCategory(product.categoria);
            refs.productPrice.value = String(product.precio);
            refs.productRequiresAddon.checked = Number(product.requiere_agregado || 0) === 1;
            refs.productActive.checked = Number(product.activo) === 1;
            syncProductRequiresAddon();
            openAdminPanel("adminDetailsProducts");
            refs.productName.focus({ preventScroll: true });
            refs.productName.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }

        const toggleBtn = event.target.closest("button[data-product-toggle]");
        if (toggleBtn) {
            const id = Number(toggleBtn.dataset.productToggle || 0);
            const active = Number(toggleBtn.dataset.productState || 0);
            toggleProduct(id, active);
        }
    }

    async function saveProduct(event) {
        event.preventDefault();
        try {
            const payload = {
                id: refs.productId.value ? Number(refs.productId.value) : 0,
                nombre: refs.productName.value.trim(),
                categoria: normalizeProductCategory(refs.productCategory.value),
                precio: Number(refs.productPrice.value || 0),
                requiere_agregado: refs.productRequiresAddon.checked ? 1 : 0,
                activo: refs.productActive.checked ? 1 : 0
            };
            const response = await api.adminProductSave(payload);
            state.data.productos = response.productos || state.data.productos;
            renderProducts();
            resetProductForm();
            toast("Producto guardado.");
        } catch (error) {
            toast(error.message, "error");
        }
    }

    async function toggleProduct(id, active) {
        try {
            const response = await api.adminProductToggle(id, active);
            state.data.productos = response.productos || state.data.productos;
            renderProducts();
            toast("Estado del producto actualizado.");
        } catch (error) {
            toast(error.message, "error");
        }
    }

    function renderUsers() {
        const users = Array.isArray(state.data.usuarios) ? state.data.usuarios : [];
        if (users.length === 0) {
            refs.usersTable.innerHTML = `<p class="empty-state">No hay usuarios.</p>`;
            return;
        }

        refs.usersTable.innerHTML = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Nombre</th>
                        <th>Usuario</th>
                        <th>Rol</th>
                        <th>Activo</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${users
                        .map((item) => `
                            <tr>
                                <td data-label="ID">${item.id}</td>
                                <td data-label="Nombre">${escapeHtml(item.nombre)}</td>
                                <td data-label="Usuario">${escapeHtml(item.usuario)}</td>
                                <td data-label="Rol">${escapeHtml(item.rol)}</td>
                                <td data-label="Activo">${item.activo === 1 ? "Si" : "No"}</td>
                                <td data-label="Acciones" class="table-actions">
                                    <button class="btn btn-outline btn-small" data-user-edit="${item.id}">Editar</button>
                                    <button class="btn btn-outline btn-small" data-user-toggle="${item.id}" data-user-state="${item.activo === 1 ? 0 : 1}">
                                        ${item.activo === 1 ? "Desactivar" : "Activar"}
                                    </button>
                                </td>
                            </tr>
                        `)
                        .join("")}
                </tbody>
            </table>
        `;
    }

    function resetUserForm() {
        refs.userId.value = "";
        refs.userName.value = "";
        refs.userUsername.value = "";
        refs.userRole.value = "mesero";
        refs.userPassword.value = "";
        refs.userActive.checked = true;
    }

    function handleUsersActions(event) {
        const editBtn = event.target.closest("button[data-user-edit]");
        if (editBtn) {
            const id = Number(editBtn.dataset.userEdit || 0);
            const users = Array.isArray(state.data.usuarios) ? state.data.usuarios : [];
            const user = users.find((item) => Number(item.id) === id);
            if (!user) {
                return;
            }

            refs.userId.value = String(user.id);
            refs.userName.value = user.nombre;
            refs.userUsername.value = user.usuario;
            refs.userRole.value = user.rol;
            refs.userPassword.value = "";
            refs.userActive.checked = Number(user.activo) === 1;
            openAdminPanel("adminDetailsUsers");
            refs.userName.focus({ preventScroll: true });
            refs.userName.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }

        const toggleBtn = event.target.closest("button[data-user-toggle]");
        if (toggleBtn) {
            const id = Number(toggleBtn.dataset.userToggle || 0);
            const active = Number(toggleBtn.dataset.userState || 0);
            toggleUser(id, active);
        }
    }

    async function saveUser(event) {
        event.preventDefault();
        try {
            const payload = {
                id: refs.userId.value ? Number(refs.userId.value) : 0,
                nombre: refs.userName.value.trim(),
                usuario: refs.userUsername.value.trim(),
                rol: refs.userRole.value,
                password: refs.userPassword.value,
                activo: refs.userActive.checked ? 1 : 0
            };
            const response = await api.adminUserSave(payload);
            state.data.usuarios = response.usuarios || state.data.usuarios;
            renderUsers();
            resetUserForm();
            toast("Usuario guardado.");
        } catch (error) {
            toast(error.message, "error");
        }
    }

    async function toggleUser(id, active) {
        try {
            const response = await api.adminUserToggle(id, active);
            state.data.usuarios = response.usuarios || state.data.usuarios;
            renderUsers();
            toast("Estado de usuario actualizado.");
        } catch (error) {
            toast(error.message, "error");
        }
    }

    function toast(message, type) {
        refs.toast.textContent = message;
        refs.toast.className = `toast show ${type === "error" ? "error" : "ok"}`;
        window.setTimeout(() => {
            refs.toast.className = "toast";
        }, 3200);
    }

    function playAlertTonePreview(toneId) {
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

            const selectedTone = String(toneId || "tono_1").toLowerCase();
            if (selectedTone === "tono_1") {
                playBomberoSiren(ctx);
                return;
            }

            const pattern = soundPatternForTone(selectedTone);
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
            // Ignorado: navegador puede bloquear audio.
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

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
})();
