# Comanda Movil (Capacitor)

Este modulo crea una app movil que abre tu sistema Comanda desde la red local (LAN).

## Requisitos

- Node.js instalado.
- Android Studio para Android.
- Xcode para iOS (solo en macOS).
- El servidor del proyecto principal corriendo en el PC:

```powershell
node ..\server.js
```

## 1) Instalar dependencias

Desde `mobile/`:

```powershell
npm install
```

## 2) Android

```powershell
npm run add:android
npm run sync:android
npm run open:android
```

Al abrir Android Studio:
- espera sincronizacion de Gradle,
- conecta tu telefono Android (depuracion USB) o inicia emulador,
- ejecuta Run.

## 3) iOS (en macOS)

```powershell
npm run add:ios
npm run sync:ios
npm run open:ios
```

Luego compilas y ejecutas desde Xcode.

## 4) Primer inicio en la app movil

La app abre una pantalla de configuracion donde debes ingresar la URL del PC en LAN:

```text
http://IP_DEL_PC:3003/login.html
```

Ejemplo:

```text
http://192.168.0.15:3003/login.html
```

La URL queda guardada en el dispositivo.
