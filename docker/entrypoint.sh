#!/bin/sh
set -eu

APP_ROOT="/var/www"
DB_PATH="${APP_ROOT}/database/database.sqlite"

cd "$APP_ROOT"

echo "[entrypoint] Tadaima POS arrancando..."

# 1. Crear SQLite si no existe (Cloud Run es efímero)
if [ ! -f "$DB_PATH" ]; then
    echo "[entrypoint] Creando base de datos SQLite"
    touch "$DB_PATH"
    chown www-data:www-data "$DB_PATH"
    chmod 664 "$DB_PATH"
    DB_IS_FRESH=1
else
    DB_IS_FRESH=0
fi

# 2. APP_KEY de respaldo si no viene del entorno (Cloud Run lo inyecta)
if [ -z "${APP_KEY:-}" ]; then
    echo "[entrypoint] WARNING: APP_KEY ausente — generando clave efímera"
    export APP_KEY="base64:$(head -c 32 /dev/urandom | base64)"
fi

# 3. Cache de config y rutas (env ya resuelto)
echo "[entrypoint] Cacheando configuración"
php artisan config:cache --no-interaction 2>/dev/null || true
php artisan route:cache  --no-interaction 2>/dev/null || true

# 4. Migraciones (idempotente)
echo "[entrypoint] Ejecutando migraciones"
php artisan migrate --force --no-interaction

# 5. Seed solo en DB nueva
if [ "$DB_IS_FRESH" -eq 1 ]; then
    echo "[entrypoint] DB nueva — ejecutando seeders"
    php artisan db:seed --force --no-interaction || \
        echo "[entrypoint] WARNING: seed falló (no crítico)"
fi

# 6. Symlink de storage
php artisan storage:link --no-interaction 2>/dev/null || true

# 7. Permisos
chown -R www-data:www-data \
    "$APP_ROOT/storage" \
    "$APP_ROOT/bootstrap/cache" \
    "$APP_ROOT/database"

echo "[entrypoint] Bootstrap completo"
exec "$@"
