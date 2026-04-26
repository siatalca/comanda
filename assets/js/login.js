(function () {
    const api = window.ComandaAPI;
    if (!api) {
        return;
    }

    const refs = {};

    document.addEventListener("DOMContentLoaded", init);

    async function init() {
        bindRefs();
        bindEvents();
        await redirectIfLogged();
    }

    function bindRefs() {
        refs.loginForm = document.getElementById("loginForm");
        refs.loginUsuario = document.getElementById("loginUsuario");
        refs.loginPassword = document.getElementById("loginPassword");
        refs.btnLogin = document.getElementById("btnLogin");
        refs.loginError = document.getElementById("loginError");
        refs.toast = document.getElementById("toast");
    }

    function bindEvents() {
        if (!refs.loginForm) {
            return;
        }

        refs.loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            hideError();

            const usuario = String(refs.loginUsuario.value || "").trim();
            const password = String(refs.loginPassword.value || "");

            if (!usuario || !password) {
                showError("Debes ingresar usuario y password.");
                return;
            }

            refs.btnLogin.disabled = true;
            try {
                const response = await api.login(usuario, password);
                const redirectTo = normalizeRedirect(response && response.redirect_to);
                toast("Sesion iniciada.");
                window.location.href = redirectTo;
            } catch (error) {
                showError(error.message || "No se pudo iniciar sesion.");
                toast(error.message || "No se pudo iniciar sesion.", "error");
            } finally {
                refs.btnLogin.disabled = false;
            }
        });
    }

    async function redirectIfLogged() {
        try {
            const session = await api.session();
            if (session && session.logged) {
                window.location.href = normalizeRedirect(session.redirect_to);
            }
        } catch (error) {
            // No bloquea login si no hay sesion.
        }
    }

    function showError(message) {
        if (!refs.loginError) {
            return;
        }
        refs.loginError.textContent = message;
        refs.loginError.classList.remove("hidden");
    }

    function hideError() {
        if (!refs.loginError) {
            return;
        }
        refs.loginError.textContent = "";
        refs.loginError.classList.add("hidden");
    }

    function normalizeRedirect(path) {
        const value = String(path || "").trim();
        if (!value) {
            return "servidor.html";
        }
        if (value.endsWith(".php")) {
            return value.slice(0, -4) + ".html";
        }
        return value;
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
})();
