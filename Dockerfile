# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Frontend build (React + Vite via npm workspaces)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /repo

# VITE_API_URL is baked into the bundle at build time.
# Pass the Cloud Run URL via --build-arg at deploy time.
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# Copy workspace manifests first to leverage Docker layer cache
COPY package.json package-lock.json* turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY landing/package.json ./landing/
# apps/ workspace reference
COPY apps ./apps

RUN npm install --no-audit --no-fund

# tadaimaus/ es STANDALONE (fuera de los npm workspaces, patrón pos-app):
# necesita su PROPIO npm install. Manifests primero (layer cache).
COPY tadaimaus/package.json tadaimaus/package-lock.json ./tadaimaus/
RUN cd tadaimaus && npm install --no-audit --no-fund

COPY landing ./landing

# Build only the web app (skip tsc type-check, vite transpiles TS natively)
RUN cd landing && npx vite build

COPY tadaimaus ./tadaimaus

# Tienda US: VITE_API_URL VACÍO a propósito — en prod el SPA cae a
# window.location.origin/api/v1 (same-origin: su server block de nginx proxea
# /api/ al MISMO php-fpm). Hornear la URL run.app aquí la haría cross-origin.
RUN cd tadaimaus && VITE_API_URL= npx vite build

# Output: /repo/landing/dist + /repo/tadaimaus/dist


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Composer dependencies (no dev)
# ─────────────────────────────────────────────────────────────────────────────
FROM composer:2 AS vendor

WORKDIR /app
COPY backend/composer.json backend/composer.lock ./

RUN composer install \
    --no-dev \
    --no-interaction \
    --no-scripts \
    --no-progress \
    --prefer-dist \
    --optimize-autoloader


# ─────────────────────────────────────────────────────────────────────────────
# Stage 3: Final runtime — PHP 8.3 FPM Alpine + nginx + supervisor + MySQL
# ─────────────────────────────────────────────────────────────────────────────
FROM php:8.3-fpm-alpine AS runtime

RUN apk add --no-cache \
        nginx \
        supervisor \
        oniguruma-dev \
        oniguruma \
        libzip-dev \
        libzip \
        icu-dev \
        icu-libs \
        postgresql-dev \
        libpq \
        ca-certificates \
        tzdata \
    && docker-php-ext-install -j$(nproc) \
        pdo_mysql \
        pdo_pgsql \
        mbstring \
        bcmath \
        zip \
        intl \
        opcache \
    && apk del --no-network oniguruma-dev libzip-dev icu-dev postgresql-dev \
    && rm -rf /var/cache/apk/*

# PHP runtime: la carga completa de Caja (products?light=1&per_page=0) serializa
# ~14k productos con relaciones tras el import Macro — el default de 128M
# revienta en JsonResponse (500 en Caja, 2026-08-04). El contenedor tiene 1Gi.
RUN echo 'memory_limit=512M' > /usr/local/etc/php/conf.d/memory.ini

# OPcache tuning
RUN { \
        echo 'opcache.enable=1'; \
        echo 'opcache.memory_consumption=128'; \
        echo 'opcache.interned_strings_buffer=16'; \
        echo 'opcache.max_accelerated_files=10000'; \
        echo 'opcache.validate_timestamps=0'; \
        echo 'opcache.jit=tracing'; \
        echo 'opcache.jit_buffer_size=64M'; \
    } > /usr/local/etc/php/conf.d/opcache.ini

# php-fpm: unix socket, run as www-data
RUN { \
        echo '[www]'; \
        echo 'user = www-data'; \
        echo 'group = www-data'; \
        echo 'listen = /run/php-fpm.sock'; \
        echo 'listen.owner = nginx'; \
        echo 'listen.group = nginx'; \
        echo 'listen.mode = 0660'; \
        echo 'pm = dynamic'; \
        echo 'pm.max_children = 20'; \
        echo 'pm.start_servers = 4'; \
        echo 'pm.min_spare_servers = 2'; \
        echo 'pm.max_spare_servers = 10'; \
        echo 'clear_env = no'; \
        echo 'catch_workers_output = yes'; \
        echo 'decorate_workers_output = no'; \
    } > /usr/local/etc/php-fpm.d/zz-cloudrun.conf

WORKDIR /var/www

# Laravel source
COPY backend/ /var/www/
COPY --from=vendor /app/vendor /var/www/vendor

# React SPA alongside Laravel's public/
COPY --from=frontend-builder /repo/landing/dist/ /var/www/public/

# TadaimaUS SPA — la sirve el segundo server block de nginx
# (tadaimaus.com / www / us.poslite.com.mx) desde su propio root.
COPY --from=frontend-builder /repo/tadaimaus/dist/ /var/www/public-us/

# Docker config files
COPY docker/nginx.conf       /etc/nginx/nginx.conf
COPY docker/supervisord.conf /etc/supervisord.conf
COPY docker/entrypoint.sh    /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh \
    && mkdir -p \
        /var/www/storage/framework/cache \
        /var/www/storage/framework/sessions \
        /var/www/storage/framework/views \
        /var/www/storage/logs \
        /var/www/bootstrap/cache \
        /run/nginx /run \
    && chown -R www-data:www-data \
        /var/www/storage \
        /var/www/bootstrap/cache \
    && chmod -R 775 \
        /var/www/storage \
        /var/www/bootstrap/cache

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
