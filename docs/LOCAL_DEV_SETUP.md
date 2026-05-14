# Setup local — Tadaima POS (SQLite, sin tocar prod)

Esta guía levanta el proyecto **100 % local** con SQLite, sin Cloud SQL, sin
Google Cloud Storage y sin Supabase. La base de datos de producción **no se
toca** en ningún momento.

Stack:
- **Backend:** Laravel 13 + PHP 8.3 + SQLite (`backend/`)
- **Frontend:** React + Vite + TypeScript (`landing/`)

---

## 1. Requisitos

| Herramienta | Versión mínima | Cómo instalar (macOS) |
|-------------|----------------|-----------------------|
| PHP         | 8.3            | `brew install php`    |
| Composer    | 2.x            | `brew install composer` |
| Node.js     | 20.x           | `brew install node`   |
| npm         | 10.x           | viene con Node        |
| SQLite3     | 3.x            | viene con macOS / `brew install sqlite` |
| Git         | 2.x            | `brew install git`    |

Verifica:
```bash
php -v
composer -V
node -v
npm -v
sqlite3 --version
```

> En Linux usa `apt`, `dnf`, etc. en vez de `brew`. En Windows usa WSL2.

---

## 2. Clonar y entrar a la branch de QA

```bash
git clone <repo-url> tadaima
cd tadaima
git checkout dev/qa-handoff
```

---

## 3. Backend (Laravel + SQLite)

```bash
cd backend

# 3.1 Dependencias PHP
composer install

# 3.2 Variables de entorno
cp .env.example .env

# 3.3 App key
php artisan key:generate

# 3.4 Crear archivo SQLite vacío (si no existe)
touch database/database.sqlite

# 3.5 Migrar + cargar seed mínimo
php artisan migrate --seed

# 3.6 Symlink storage para servir imágenes locales en /storage/
php artisan storage:link

# 3.7 Levantar servidor en :8000
php artisan serve
```

El backend queda en `http://127.0.0.1:8000`.

### Lo que carga el seed (`DatabaseSeeder`)

| Recurso          | Detalle |
|------------------|---------|
| Empresa          | Tadaima |
| Roles            | admin, gerente, cajero |
| Métodos de pago  | Efectivo, Tarjeta Débito, Tarjeta Crédito, Transferencia |
| Tiendas          | Tienda 1 — Centro · Tienda 2 — Macroplaza |
| Cajas            | 1 por tienda |
| Terminales TPV   | 1 por tienda (3.5 % comisión) |
| Almacenes        | 1 por tienda |
| Configuración    | `points_multiplier = 0.001` |

### Usuarios sembrados

| Email                  | Password    | Rol     | Tienda     |
|------------------------|-------------|---------|------------|
| `admin@tadaima.mx`     | `devaccess` | admin   | (todas)    |
| `gerente1@tadaima.mx`  | `devaccess` | gerente | Tienda 1   |
| `gerente2@tadaima.mx`  | `devaccess` | gerente | Tienda 2   |

> El seed **no incluye** productos, clientes ni ventas. Eso lo das de alta
> desde la UI durante QA.

---

## 4. Frontend (Vite + React)

En **otra terminal**, desde la raíz del repo:

```bash
cd landing

# 4.1 Dependencias (instala también packages/* del workspace)
npm install

# 4.2 Variables de entorno
cp .env.example .env

# 4.3 Levantar Vite dev server en :5173
npm run dev
```

El frontend queda en `http://127.0.0.1:5173` y llama al backend en
`http://127.0.0.1:8000` vía `VITE_API_URL`.

---

## 5. Probar el setup

1. Abre `http://127.0.0.1:5173`.
2. Login con `admin@tadaima.mx` / `devaccess`.
3. Si entra al dashboard, todo funciona.

### Smoke test rápido de QA

- [ ] Login con admin
- [ ] Selección de tienda funciona
- [ ] Crear un producto desde Catálogos
- [ ] Subir imagen del producto (se guarda en `backend/storage/app/public/products/`)
- [ ] Crear cliente desde Clientes
- [ ] Hacer una venta en POS
- [ ] Imprimir ticket
- [ ] Crear preventa (catálogo)
- [ ] Liquidar preventa desde POS

---

## 6. Tests

```bash
cd backend
php artisan test
```

Los tests usan **SQLite en memoria** (configurado en `phpunit.xml`), así que
no afectan tu DB de dev.

Frontend:
```bash
cd landing
npm run test         # vitest
npm run type-check   # tsc --noEmit
npm run lint         # eslint
```

---

## 7. Reportar bugs y pushear cambios

```bash
# Trabaja en la branch que ya estás (dev/qa-handoff) o crea una sub-branch:
git checkout -b qa/<tu-nombre>/<descripcion-corta>

# Commits con mensaje convencional:
#   feat: <feature>
#   fix:  <bug>
#   refactor: <cleanup>
git add -A
git commit -m "fix: corrige cálculo de cambio en ticket mixto"

git push -u origin qa/<tu-nombre>/<descripcion-corta>
```

Después abre PR contra `dev/qa-handoff` (o `main` si ya está acordado con
el dueño del proyecto).

---

## 8. Lo que NO debes hacer

- No conectes a la base MySQL de producción ni a Cloud SQL.
- No subas el archivo `backend/.env` ni `landing/.env` (están en `.gitignore`).
- No subas `backend/database/database.sqlite` (está en `.gitignore`).
- No subas `backend/storage/app/gcs-key.json` ni archivos de
  `backend/storage/app/private/` o `public/` (todo eso está blindado por
  `.gitignore`).
- No escribas a Supabase (loyalty externo) — el POS solo lee. Si
  `TADAIMA_SUPABASE_URL` queda vacío, la búsqueda externa de socios
  simplemente no devuelve resultados, y eso está bien para QA local.

---

## 9. Troubleshooting

### `SQLSTATE[HY000] [14] unable to open database file`
El archivo SQLite no existe. Corre:
```bash
touch backend/database/database.sqlite
php artisan migrate --seed
```

### `419 CSRF token mismatch` en login
Verifica que `SANCTUM_STATEFUL_DOMAINS` en `backend/.env` incluya
`localhost:5173,127.0.0.1:5173`.

### Imágenes de productos no se ven
Falta el symlink. Corre:
```bash
cd backend && php artisan storage:link
```

### Vite no encuentra `@tadaima/api`
Asegúrate de haber corrido `npm install` desde `landing/`. El workspace
resuelve los alias contra `../packages/*`.

### Resetear DB local desde cero
```bash
cd backend
rm database/database.sqlite
touch database/database.sqlite
php artisan migrate:fresh --seed
```

---

## 10. (Avanzado) Setup con Cloud SQL — solo para el dueño del proyecto

Si en algún momento necesitas reproducir el entorno productivo apuntando al
MySQL real:

1. Instala Cloud SQL Auth Proxy v2 y autentica `gcloud`.
2. Lanza el proxy: `cloud-sql-proxy --port=3306 impusodigitaldorado:us-west1:pos-lite-db`.
3. Saca el password del Secret Manager:
   `gcloud secrets versions access latest --secret=tadaima-db-password --project=impusodigitaldorado`.
4. En `backend/.env` comenta `DB_CONNECTION=sqlite` y descomenta el bloque
   MySQL del `.env.example`, llenando `DB_PASSWORD`.
5. `php artisan config:clear && php artisan migrate`.

Este flujo **no aplica para QA / desarrollo regular**, solo para reproducir
issues con datos productivos.
