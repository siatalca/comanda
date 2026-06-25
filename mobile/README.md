# Comanda Movil (Capacitor + Bluetooth)

Este modulo crea una app Android que abre tu sistema Comanda y permite imprimir tickets en una impresora termica Bluetooth de 58mm emparejada con el dispositivo.

## Requisitos

- Node.js instalado.
- Android Studio para Android.
- Una impresora Bluetooth compatible con ESC/POS, emparejada desde Android.
- El sistema Comanda publicado o corriendo en LAN.

## 1) Instalar dependencias

Desde `mobile/`:

```powershell
npm install
```

## 2) Android

```powershell
npm run sync:android
npm run open:android
```

Al abrir Android Studio:
- espera sincronizacion de Gradle,
- conecta tu telefono Android (depuracion USB) o inicia emulador,
- ejecuta Run.

Si todavia no existe la carpeta `android/`, ejecuta una vez:

```powershell
npm run add:android
```

## 3) Primer inicio en la app movil

La app abre una pantalla de configuracion donde debes ingresar la URL del sistema:

```text
https://comanda.mi-registro.cl/login.html
```

Tambien puedes usar un servidor LAN:

```text
http://192.168.0.15:3003/login.html
```

La app viene preconfigurada con:

```text
https://comanda.mi-registro.cl/login.html
```

La URL queda guardada en el dispositivo si la cambias.

## 4) Impresora Bluetooth

1. En Android abre Ajustes > Bluetooth.
2. Empareja la impresora termica. PIN comun: `0000` o `1234`.
3. Abre la app Comanda.
4. Presiona `Cargar impresoras emparejadas`.
5. Selecciona la impresora y presiona `Guardar impresora`.
6. Usa `Imprimir prueba`.

Cuando el sistema devuelve el texto del ticket, la app lo envia por Bluetooth usando ESC/POS. Si el servidor ya imprimio correctamente en otra impresora, la app evita duplicar la impresion.

## 5) Archivos que deben subirse al servidor

Como la app carga la web desde `comanda.mi-registro.cl`, el servidor debe tener estos cambios:

- `api.php`: devuelve el campo `texto` dentro de `impresion` o `impresiones`.
- `assets/js/api.js`: detecta la app Android y envia el ticket al puente Bluetooth.
- `login.html`, `mesero.html`, `servidor.html`, `admin.html`: actualizan la version/cache del JS.

Si esos archivos no se suben, la app abrira la web, pero la impresion Bluetooth no se activara.
