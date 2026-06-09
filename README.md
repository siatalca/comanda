# Comanda Local para Donde Abel

Sistema web local para Donde Abel (restaurant de comida casera).

- Frontend en paginas `.html`.
- Backend API en Node.js (`server.js`).
- Base de datos MySQL/MariaDB.
- Servicio local de impresion en Node.js (puerto alto > 7000).

## 1) Requisitos

- Windows con MySQL/MariaDB (por ejemplo via XAMPP).
- Node.js instalado.
- Una red local compartida entre PC y telefonos:
  - router sin internet, o
  - hotspot desde un celular.

No usa CDN ni servicios externos. Funciona offline en LAN.

## 2) Estructura

- `index.html`: inicio.
- `login.html`: inicio de sesion por rol.
- `mesero.html`: toma de pedidos desde telefono.
- `servidor.html`: panel del PC para monitoreo y cambios.
- `admin.html`: panel administrador (impresoras, productos, mesas, usuarios).
- `server.js`: API Node + servicio de impresion.
- `includes/`: utilidades de backend y acceso MySQL.
- `api.php`: backend legado PHP (opcional, ya no requerido para el flujo Node).
- `database/comanda_schema.sql`: SQL inicial (crea base y tablas, sin datos operativos).
- `print_jobs/`: copia local de tickets impresos.

## 3) Arranque rapido

1. Inicia MySQL/MariaDB.
2. Desde la carpeta del proyecto instala dependencias:

```powershell
npm install
```

3. Ejecuta:

```powershell
node server.js
```

4. En el PC abre:

```text
http://localhost:3003/login.html
```

5. Busca la IP local del PC (`ipconfig`) y abre en telefono:

```text
http://IP_DEL_PC:3003/mesero.html
```

6. Panel admin (solo rol admin):

```text
http://localhost:3003/admin.html
```

Credenciales iniciales:
- usuario: `admin`
- password: `123456`

## 4) Flujo operativo

1. Cada usuario inicia sesion en `login.html`.
2. Redireccion por rol:
   - `mesero` -> `mesero.html`
   - `cajero` (`caja`) -> `servidor.html`
   - `admin` -> `servidor.html` (ademas puede entrar a `mesero.html` y `admin.html`)
3. Mesero elige mesa y agrega productos.
4. Presiona `Enviar pedido`:
   - crea o actualiza comanda de la mesa,
   - envia detalle a impresion en el PC.
5. Para cobrar:
   - `Imprimir precuenta` (opcional),
   - `Cobrar mesa` y se imprime ticket final.
6. La mesa queda libre automaticamente al cerrar.

## 5) Impresora y panel admin

El servicio Node imprime en modo termico con tamano de papel configurable (con fallback a `Out-Printer` si el driver no acepta el formato). La API se ejecuta en `3003` y la impresion en `7003` por defecto.

Ahora puedes configurar desde `admin.html`:
- modo una impresora o dos impresoras (cocina/caja),
- impresora para pedidos de cocina,
- impresora para precuenta/ticket de caja,
- papel del ticket en mm (ej: 58mm),
- ancho de ticket en caracteres (ej: 32 para 58mm),
- tamano de fuente del ticket.

Puerto de servicio de impresion: `7003` (por defecto, configurable y siempre recomendado sobre 7000).

Opcional:

```powershell
$env:APP_PORT="3003"
$env:PRINT_PORT="7003"
$env:PRINTER_NAME="Nombre exacto de impresora"
node server.js
```

Importante:
- Si actualizas `server.js`, reinicia `node server.js`.
- Si `admin.html` muestra que no puede listar impresoras, revisa que Node este arriba.

## 6) Base de datos MySQL

Base principal: `comanda` (MySQL/MariaDB), inicializada automaticamente por `server.js` si no existe.

Respaldo para servidor:
- `database/comanda_schema.sql`: crea base y tablas (sin datos).
- En primer arranque, el sistema crea el usuario administrador inicial automaticamente si no hay usuarios.

Ejemplo de restauracion:

```powershell
C:\xampp\mysql\bin\mysql.exe -h 127.0.0.1 -P 3306 -u root < database\comanda_schema.sql
```

## 7) App de escritorio (Electron)

Ahora el proyecto incluye un wrapper desktop con Electron.

1. Instala dependencias (incluye Electron):

```powershell
npm install
```

2. Ejecuta la app de escritorio:

```powershell
npm run desktop
```

Que hace:
- inicia `server.js` automaticamente,
- espera que el backend responda en `http://127.0.0.1:3003/login.html`,
- abre la ventana desktop con `login.html`.

Opcional (si quieres usar servidor externo o ya iniciado):

```powershell
$env:ELECTRON_START_SERVER="0"
$env:COMANDA_URL="http://127.0.0.1:3003/login.html"
npm run desktop
```

### 7.1) Desktop conectado a BD remota (ej: comanda.mi-registro.cl)

Ahora Electron tambien puede leer configuracion desde `desktop.config.json` en la raiz del proyecto.

Ejemplo base: `desktop.config.example.json`

Campos principales:
- `dbHost`: host MySQL remoto (ejemplo: `comanda.mi-registro.cl`)
- `dbPort`: puerto MySQL (normalmente `3306`)
- `dbUser`: usuario de base de datos
- `dbPass`: password de base de datos
- `dbName`: nombre de base (`comanda`)
- `dbSkipCreate`: `true` cuando la base remota ya existe y el usuario no puede crear bases de datos
- `printerName`: nombre exacto de la impresora local; si queda vacio usa la predeterminada de Windows

Luego ejecuta:

```powershell
npm run desktop
```

### 7.2) Modo PC caja con impresion directa

Para que la caja imprima sin popup de seleccion de impresora, el PC de caja debe ejecutar el backend local
Node/Electron. El navegador por si solo no puede imprimir en silencio por seguridad.

Flujo recomendado:

1. Instala Node.js en el PC de caja.
2. Copia el proyecto al PC de caja.
3. Ejecuta una vez:

```powershell
npm install
```

4. Crea la configuracion local:

```powershell
Copy-Item desktop.config.caja.example.json desktop.config.json
```

5. Edita `desktop.config.json` con los datos reales de MySQL de `comanda.mi-registro.cl`.
   Deja `dbSkipCreate` en `true` si la base ya existe en el hosting.
6. Define la impresora de una de estas formas:
   - En Windows, deja la impresora termica como predeterminada y `printerName` vacio.
   - O escribe en `printerName` el nombre exacto de la impresora.
   - O entra a `admin.html` y guarda la impresora desde el panel.
7. Inicia la caja:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-caja-desktop.ps1
```

La caja abrira `http://127.0.0.1:3003/login.html`, trabajara contra la base remota y enviara tickets
al servicio local `http://127.0.0.1:7003/print`, sin mostrar popup.

### 7.3) Si se usa Apache/XAMPP en el PC caja

Apache no reemplaza el servicio de impresion Node; para imprimir sin popup igual debe estar corriendo
`server.js` o la app Electron. Si usas Apache/PHP para servir las paginas localmente, configura estas
variables en Apache o en el entorno de Windows:

```apache
SetEnv COMANDA_DB_HOST "comanda.mi-registro.cl"
SetEnv COMANDA_DB_PORT "3306"
SetEnv COMANDA_DB_NAME "comanda"
SetEnv COMANDA_DB_USER "USUARIO_DB_REMOTO"
SetEnv COMANDA_DB_PASS "CLAVE_DB_REMOTA"
SetEnv COMANDA_DB_SKIP_CREATE "1"
SetEnv PRINT_SERVICE_URL "http://127.0.0.1:7003/print"
SetEnv PRINTER_NAME ""
```

Despues reinicia Apache. Si `PRINTER_NAME` queda vacio, Windows usara la impresora predeterminada
o la impresora guardada en el panel admin.

## 8) App movil (Android/iOS con Capacitor)

Se agrego el modulo `mobile/` para empaquetar una app movil.

Pasos rapidos:

```powershell
cd mobile
npm install
npm run add:android
npm run sync:android
npm run open:android
```

Al abrirse en Android Studio, compilas y ejecutas.

La app movil muestra un formulario para ingresar la URL del servidor en LAN:

```text
http://IP_DEL_PC:3003/login.html
```

Guia completa en `mobile/README.md`.
