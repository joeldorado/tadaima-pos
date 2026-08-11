# TadaimaUS — Deploy

> Tienda US (`tadaimaus/`, inglés/USD, checkout dummy) servida desde el **mismo
> contenedor** de Cloud Run que el POS, montada en **`/tadaimaus/`** del dominio
> principal (p. ej. `https://tadaima.poslite.com.mx/tadaimaus/`).
>
> **Fase futura:** la tienda se migrará a un **proyecto separado** con dominio
> propio (`tadaimaus.com`), conectado a ESTE mismo backend. El build ya está
> preparado para eso: Vite usa base **relativa** (`./`) y el router es
> hash-based, así que el mismo bundle funciona montado en `/tadaimaus/` o en la
> raíz de otro dominio sin cambios. (El esquema anterior por `Host` en nginx —
> server block para tadaimaus.com/us.poslite.com.mx — se retiró; está en el
> historial de git si se necesita de referencia.)

## 1. Deploy (nada especial)

El deploy normal ya incluye la tienda US — el Dockerfile buildea `tadaimaus/`
(standalone, su propio `npm install`) y copia el dist a
`/var/www/public/tadaimaus/`:

```bash
./deploy.sh          # o: gcloud run deploy tadaima --source . --region us-central1
```

- Las migraciones (`us_listings`, `us_orders`, `us_order_items`, `us_leads` y
  el alter de listings custom) corren solas al arrancar el contenedor
  (`docker/entrypoint.sh`).
- El SPA US se buildea con `VITE_API_URL` **vacío** a propósito: en prod pega a
  `window.location.origin/api/v1` (same-origin — vive en el mismo dominio del
  POS). No hay que pasarle ninguna env.
- Las **imágenes migradas del Wix** viven en el repo (`backend/public/us-img/`,
  ~7 MB optimizadas) y las sirve el root del POS — nada apunta al CDN de Wix.
- nginx: `location ^~ /tadaimaus/` con fallback a `/tadaimaus/index.html` y
  `/tadaimaus` (sin slash) → 301 a `/tadaimaus/`.

## 1.5 Sembrar el catálogo migrado del Wix (una vez, con OK de Joel)

Los 42 productos del Wix original ya están extraídos en
`backend/database/seed-data/tadaimaus-catalog.json` (generado por
`scripts/scrape_tadaimaus.py`; re-correr el script refresca datos e imágenes).
La siembra NO es automática — se corre a mano (patrón import-macro: backend
local apuntando a la DB destino):

```bash
cd backend
# QA local (SQLite):
APP_ENV=sqlitelocal php artisan tadaima:import-us-catalog

# Prod (Supabase) — SOLO con OK explícito de Joel; el .env activo define la DB:
php artisan tadaima:import-us-catalog --dry-run   # primero ver qué haría
php artisan tadaima:import-us-catalog
```

Idempotente (upsert por `slug`): re-correrlo no duplica ni pisa ediciones
manuales del panel (precio/visibilidad); `--pisar` fuerza los datos del JSON.

## 2. QA (directo en el dominio del POS)

```bash
curl -s  https://tadaima.poslite.com.mx/api/v1/us/catalog | head -c 300  # API US
curl -sI https://tadaima.poslite.com.mx/tadaimaus/ | head -5             # SPA US
curl -sI https://tadaima.poslite.com.mx/tadaimaus  | head -3             # 301 → /tadaimaus/
```

Checklist de QA end-to-end (igual que F2 local):

1. POS → módulo TadaimaUS → publicar un producto con precio USD.
2. Abrir `/tadaimaus/` → producto visible → carrito → checkout → folio
   `TUS-XXXXXX`.
3. POS → Pedidos: aparece con badge de nuevos; cambiar a Contactado baja el badge.
4. `visible=false` o stock 0 ⇒ desaparece de la tienda (regla SellableStock).
5. Tras sembrar el catálogo Wix: productos reales con foto en Figures/Manga/TCG,
   **search** con resultados y `/us-img/...` sirviendo 200.
6. Newsletter (Sign Up) y formulario de contacto → success → POS → sub-tab
   **Leads** los muestra.
7. POS → "Crear producto dummy" (nombre + precio + foto) → aparece en la tienda.

## 3. Datos pendientes de Joel (antes de compartir la URL / fase dominio)

El SPA oculta los slots vacíos — hoy `CONTACT_INFO` en
`tadaimaus/src/lib/constants.ts` está **vacío a propósito**:

- Email / teléfono de contacto US y dirección física (CONTACT_INFO).
- Horarios de atención (CONTACT_INFO.hours).
- Shipping / Returns policy y Privacy / Terms.
- Redes sociales US y destino real del newsletter (hoy solo visual).
- Assets propios en alta (logo/hero actuales vienen del export de Wix).

## 4. Fase futura — proyecto separado

Cuando se migre a su propio proyecto/dominio:

1. El SPA se despliega tal cual (mismo build, base relativa) en su hosting.
2. Se le pasa `VITE_API_URL=https://<dominio-del-POS>` al build para que pegue
   al backend de aquí (cross-origin: habilitar CORS para ese origen en Laravel).
3. DNS de `tadaimaus.com` se mueve de Wix SOLO cuando Joel apruebe — hoy Wix
   cobra online de verdad y esta tienda es checkout dummy.
