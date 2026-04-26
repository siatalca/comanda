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
