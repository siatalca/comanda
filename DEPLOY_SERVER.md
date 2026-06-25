# Despliegue servidor comanda.mi-registro.cl

El servidor productivo corre con Nginx + PHP-FPM y sirve la web desde:

```text
/home/sia/subida_web/comanda
```

La app Android carga la web desde:

```text
https://comanda.mi-registro.cl/login.html
```

Por eso la impresion Bluetooth requiere dos partes:

1. La APK Android instalada en cada dispositivo.
2. La web del servidor actualizada con los cambios de `api.php` y `assets/js/api.js`.

## Opcion recomendada: repo completo

Si `/home/sia/subida_web/comanda` es un clon Git del proyecto:

```bash
cd /home/sia/subida_web/comanda
git pull
php -l api.php
```

Luego abre:

```text
https://comanda.mi-registro.cl/login.html
```

## Opcion segura: copiar solo archivos web

Si el servidor no usa Git en esa carpeta, copia solo los archivos necesarios:

```bash
bash scripts/deploy-comanda-web.sh
```

El script copia:

- `api.php`
- `assets/js/api.js`
- `login.html`
- `mesero.html`
- `servidor.html`
- `admin.html`

## Verificacion rapida en servidor

```bash
curl "https://comanda.mi-registro.cl/api.php?action=session"
```

Debe responder algo como:

```json
{"ok":true,"logged":false,"user":null,"redirect_to":"login.html"}
```

## Android

En cada dispositivo:

1. Instala la APK.
2. Empareja la impresora Bluetooth desde Ajustes de Android.
3. Abre la app Comanda.
4. Carga impresoras emparejadas.
5. Guarda la impresora.
6. Usa `Imprimir prueba`.
7. Conecta a `https://comanda.mi-registro.cl/login.html`.

Si el servidor intenta imprimir por servicio local y falla, la app Android toma el texto del ticket y lo envia por Bluetooth.
