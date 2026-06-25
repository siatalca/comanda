#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:-/home/sia/subida_web/comanda}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FILES=(
  "api.php"
  "assets/js/api.js"
  "login.html"
  "mesero.html"
  "servidor.html"
  "admin.html"
)

if [[ ! -d "$TARGET_DIR" ]]; then
  echo "No existe el destino: $TARGET_DIR" >&2
  exit 1
fi

for file in "${FILES[@]}"; do
  if [[ ! -f "$SOURCE_DIR/$file" ]]; then
    echo "Falta el archivo fuente: $SOURCE_DIR/$file" >&2
    exit 1
  fi
done

backup_dir="$TARGET_DIR/.deploy_backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$backup_dir"

for file in "${FILES[@]}"; do
  mkdir -p "$backup_dir/$(dirname "$file")" "$TARGET_DIR/$(dirname "$file")"
  if [[ -f "$TARGET_DIR/$file" ]]; then
    cp -a "$TARGET_DIR/$file" "$backup_dir/$file"
  fi
  cp -a "$SOURCE_DIR/$file" "$TARGET_DIR/$file"
  echo "Actualizado: $TARGET_DIR/$file"
done

if command -v php >/dev/null 2>&1; then
  php -l "$TARGET_DIR/api.php"
fi

echo "Despliegue web listo. Backup: $backup_dir"
