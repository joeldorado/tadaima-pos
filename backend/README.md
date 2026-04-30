# Tadaima POS — Backend API

API REST construida con **Laravel 11 / PHP 8.3**.  
Parte del monorepo [`tadaima-pos`](https://github.com/joeldorado/tadaima-pos).

## Stack

| Capa | Tech |
|------|------|
| Framework | Laravel 11 |
| Runtime | PHP 8.3 |
| Auth | Laravel Sanctum (token-based) |
| DB (dev/pruebas) | SQLite |
| DB (prod) | MySQL 8 |

## Setup local rápido

```bash
cd backend
cp .env.example .env
composer install
php artisan key:generate
php artisan migrate --seed
php artisan serve        # http://localhost:8000
```

### Credenciales semilla (modo pruebas)

| Usuario | Email | Contraseña | Rol |
|---------|-------|-----------|-----|
| Admin | admin@tadaima.mx | password | admin |
| Gerente T1 | gerente1@tadaima.mx | password | gerente |
| Gerente T2 | gerente2@tadaima.mx | password | gerente |

> Cambia las contraseñas antes de cualquier deploy a producción.

## Variables de entorno clave

```env
APP_KEY=           # generada con artisan key:generate
APP_URL=           # URL pública del servicio
DB_CONNECTION=sqlite
DB_DATABASE=/ruta/absoluta/database/database.sqlite
SANCTUM_STATEFUL_DOMAINS=  # dominio del frontend
SESSION_DRIVER=cookie
CACHE_DRIVER=file
QUEUE_CONNECTION=sync
```

## Endpoints principales

```
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/products
GET    /api/v1/sales
POST   /api/v1/sales
GET    /api/v1/reports/sales
GET    /api/v1/pre-sale-catalogs
POST   /api/v1/pre-sale-orders
GET    /api/v1/terminals
```

## Deploy

Ver `docker/` en la raíz del monorepo para Dockerfile y configuración de Cloud Run.
