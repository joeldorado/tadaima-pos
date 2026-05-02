#!/bin/sh
set -eu

APP_ROOT="/var/www"
cd "$APP_ROOT"

echo "[entrypoint] Tadaima POS arrancando..."

# APP_KEY de respaldo si no viene del entorno (Cloud Run lo inyecta)
if [ -z "${APP_KEY:-}" ]; then
    echo "[entrypoint] WARNING: APP_KEY ausente — generando clave efímera"
    export APP_KEY="base64:$(head -c 32 /dev/urandom | base64)"
fi

# Esperar conexión MySQL: Cloud SQL socket (/cloudsql/...) o TCP local
echo "[entrypoint] Esperando conexión a MySQL..."
MAX_WAIT=60
ELAPSED=0
until php -r "
    \$sock = getenv('DB_SOCKET');
    \$db   = getenv('DB_DATABASE') ?: 'tadaimaposlite';
    \$user = getenv('DB_USERNAME') ?: 'tadaima_app';
    \$pass = getenv('DB_PASSWORD') ?: '';
    \$dsn  = \$sock
        ? 'mysql:unix_socket='.\$sock.';dbname='.\$db
        : 'mysql:host='.(getenv('DB_HOST')?:'127.0.0.1').';port='.(getenv('DB_PORT')?:'3306').';dbname='.\$db;
    try {
        new PDO(\$dsn, \$user, \$pass, [PDO::ATTR_TIMEOUT => 3]);
        exit(0);
    } catch (Exception \$e) {
        fwrite(STDERR, \$e->getMessage().PHP_EOL);
        exit(1);
    }
" 2>/dev/null; do
    if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
        echo "[entrypoint] ERROR: Timeout esperando MySQL (${MAX_WAIT}s) — abortando"
        exit 1
    fi
    echo "[entrypoint] MySQL no disponible — reintentando en 3s (${ELAPSED}s/${MAX_WAIT}s)"
    sleep 3
    ELAPSED=$((ELAPSED + 3))
done
echo "[entrypoint] MySQL conectado"

# Cache de config y rutas
echo "[entrypoint] Cacheando configuración"
php artisan config:cache --no-interaction 2>/dev/null || true
php artisan route:cache  --no-interaction 2>/dev/null || true

# Migraciones (idempotente)
echo "[entrypoint] Ejecutando migraciones"
php artisan migrate --force --no-interaction

# Seed solo si la tabla users está vacía (DB nueva)
USER_COUNT=$(php -r "
    \$sock = getenv('DB_SOCKET');
    \$db   = getenv('DB_DATABASE') ?: 'tadaimaposlite';
    \$user = getenv('DB_USERNAME') ?: 'tadaima_app';
    \$pass = getenv('DB_PASSWORD') ?: '';
    \$dsn  = \$sock
        ? 'mysql:unix_socket='.\$sock.';dbname='.\$db
        : 'mysql:host='.(getenv('DB_HOST')?:'127.0.0.1').';port='.(getenv('DB_PORT')?:'3306').';dbname='.\$db;
    try {
        \$pdo  = new PDO(\$dsn, \$user, \$pass);
        \$stmt = \$pdo->query('SELECT COUNT(*) FROM users');
        echo \$stmt->fetchColumn();
    } catch (Exception \$e) {
        echo '0';
    }
" 2>/dev/null || echo "0")

if [ "${USER_COUNT:-0}" = "0" ]; then
    echo "[entrypoint] DB nueva — ejecutando seeders"
    php artisan db:seed --force --no-interaction || \
        echo "[entrypoint] WARNING: seed falló (no crítico)"
else
    echo "[entrypoint] DB existente (${USER_COUNT} usuarios) — seed omitido"
fi

# Permisos de storage
chown -R www-data:www-data \
    "$APP_ROOT/storage" \
    "$APP_ROOT/bootstrap/cache"

echo "[entrypoint] Bootstrap completo"
exec "$@"
