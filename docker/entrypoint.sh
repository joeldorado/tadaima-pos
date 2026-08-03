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

# ── Sonda de DB agnóstica al driver (2026-07-30, migración a Supabase) ────────
# Imprime exactamente "READY", "COUNT:<n>" o "ERR" — nada más. DSN dinámico
# según DB_CONNECTION: pgsql (Supabase, TCP+SSL) o mysql (socket Cloud SQL o
# TCP). PDO puro sin bootstrapear Laravel: arranca en ms y no depende del
# config cache.
db_probe() { # $1 = "ping" | "count_users"
php -d display_errors=0 -r '
    $driver = getenv("DB_CONNECTION") ?: "mysql";
    $db   = getenv("DB_DATABASE") ?: "tadaimaposlite";
    $user = getenv("DB_USERNAME") ?: "tadaima_app";
    $pass = getenv("DB_PASSWORD") ?: "";
    if ($driver === "pgsql") {
        $dsn = sprintf("pgsql:host=%s;port=%s;dbname=%s;sslmode=%s",
            getenv("DB_HOST") ?: "127.0.0.1",
            getenv("DB_PORT") ?: "5432",
            $db,
            getenv("DB_SSLMODE") ?: "require");
    } else {
        $sock = getenv("DB_SOCKET");
        $dsn  = $sock
            ? "mysql:unix_socket={$sock};dbname={$db}"
            : sprintf("mysql:host=%s;port=%s;dbname=%s",
                getenv("DB_HOST") ?: "127.0.0.1", getenv("DB_PORT") ?: "3306", $db);
    }
    try {
        $pdo = new PDO($dsn, $user, $pass, [PDO::ATTR_TIMEOUT => 3, PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        if (($argv[1] ?? "ping") === "count_users") {
            echo "COUNT:" . (int) $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
        } else {
            echo "READY";
        }
        exit(0);
    } catch (Throwable $e) {
        fwrite(STDERR, $e->getMessage() . PHP_EOL);
        echo "ERR";
        exit(1);
    }
' -- "$1" 2>/dev/null || true
}

# Esperar conexión a la DB (fail closed: sin DB no hay arranque)
echo "[entrypoint] Esperando conexión a la base de datos (${DB_CONNECTION:-mysql})..."
MAX_WAIT=60
ELAPSED=0
until [ "$(db_probe ping)" = "READY" ]; do
    if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
        echo "[entrypoint] ERROR: Timeout esperando la DB (${MAX_WAIT}s) — abortando"
        exit 1
    fi
    echo "[entrypoint] DB no disponible — reintentando en 3s (${ELAPSED}s/${MAX_WAIT}s)"
    sleep 3
    ELAPSED=$((ELAPSED + 3))
done
echo "[entrypoint] DB conectada"

# Cache de config y rutas
echo "[entrypoint] Cacheando configuración"
php artisan config:cache --no-interaction 2>/dev/null || true
php artisan route:cache  --no-interaction 2>/dev/null || true

# Migraciones (idempotente)
echo "[entrypoint] Ejecutando migraciones"
php artisan migrate --force --no-interaction

# Seed FAIL-CLOSED: solo si se CONFIRMÓ users==0 Y el entorno lo permite
# explícitamente (ALLOW_DB_SEED=true — prod NUNCA la define). El viejo
# `catch { echo '0' }` podía disparar seeders sobre una DB con datos reales
# si la query fallaba — eso queda eliminado: un "ERR" siempre omite el seed.
USER_COUNT="$(db_probe count_users)"
if [ "$USER_COUNT" = "COUNT:0" ] && [ "${ALLOW_DB_SEED:-false}" = "true" ]; then
    echo "[entrypoint] DB nueva confirmada + ALLOW_DB_SEED — ejecutando seeders"
    php artisan db:seed --force --no-interaction || \
        echo "[entrypoint] WARNING: seed falló (no crítico)"
elif [ "$USER_COUNT" = "COUNT:0" ]; then
    echo "[entrypoint] users==0 pero ALLOW_DB_SEED != true — seed OMITIDO"
else
    echo "[entrypoint] Seed omitido (${USER_COUNT})"
fi

# Permisos de storage
chown -R www-data:www-data \
    "$APP_ROOT/storage" \
    "$APP_ROOT/bootstrap/cache"

echo "[entrypoint] Bootstrap completo"
exec "$@"
