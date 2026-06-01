import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
    appId: "cl.comanda.app",
    appName: "Comanda",
    webDir: "www",
    server: {
        cleartext: true,
        allowNavigation: ["*"]
    }
};

export default config;
