#!/bin/sh
# Arranca nginx solo cuando php-fpm ya escucha en su socket (2026-11-24).
#
# Cloud Run da la instancia por lista en cuanto el puerto 8080 acepta conexiones
# (startup probe TCP). supervisord levanta php-fpm y nginx casi al mismo tiempo,
# así que nginx abría el 8080 antes de que existiera /run/php-fpm.sock y las
# primeras peticiones de cada instancia nueva salían 502
# ("connect() to unix:/run/php-fpm.sock failed (2: No such file or directory)").
# Mientras esperamos, el 8080 sigue cerrado y Cloud Run no le manda tráfico.
set -eu

SOCKET="${PHP_FPM_SOCKET:-/run/php-fpm.sock}"
MAX_WAIT_TENTHS="${NGINX_WAIT_FPM_TENTHS:-600}" # 60 s

waited=0
while [ ! -S "$SOCKET" ]; do
    if [ "$waited" -ge "$MAX_WAIT_TENTHS" ]; then
        # Si php-fpm nunca levanta, supervisord lo reporta como FATAL y el
        # eventlistener tumba la instancia; arrancamos nginx de todos modos para
        # no quedarnos colgados sin log.
        echo "[nginx-after-fpm] php-fpm no creó ${SOCKET} en $((MAX_WAIT_TENTHS / 10)) s; arrancando nginx igual" >&2
        exec "$@"
    fi
    sleep 0.1
    waited=$((waited + 1))
done

echo "[nginx-after-fpm] socket listo tras $((waited / 10)).$((waited % 10)) s; arrancando nginx"
exec "$@"
