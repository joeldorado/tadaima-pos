# TadaimaUS — Deploy y dominio

> Tienda US (`tadaimaus/`, inglés/USD, checkout dummy) servida desde el **mismo
> contenedor** de Cloud Run que el POS. nginx separa por `Host`: el server block
> nuevo responde a `tadaimaus.com`, `www.tadaimaus.com` y `us.poslite.com.mx`;
> todo lo demás (run.app, tadaima.poslite.com.mx) cae al block default del POS.

## 1. Deploy (nada especial)

El deploy normal ya incluye la tienda US — el Dockerfile buildea `tadaimaus/`
(standalone, su propio `npm install`) y copia el dist a `/var/www/public-us/`:

```bash
./deploy.sh          # o: gcloud run deploy tadaima --source . --region us-central1
```

- Las migraciones (`us_listings`, `us_orders`, `us_order_items`) corren solas al
  arrancar el contenedor (`docker/entrypoint.sh`).
- El SPA US se buildea con `VITE_API_URL` **vacío** a propósito: en prod pega a
  `window.location.origin/api/v1` (same-origin — su server block proxea `/api/`
  al mismo php-fpm). No hay que pasarle ninguna env.

## 2. Mapear dominios (mismo servicio)

```bash
# QA primero — subdominio nuestro (DNS ya en nuestras manos):
gcloud beta run domain-mappings create \
  --service tadaima --domain us.poslite.com.mx --region us-central1

# Dominio real + www (crear el mapping NO afecta al sitio Wix actual):
gcloud beta run domain-mappings create \
  --service tadaima --domain tadaimaus.com --region us-central1
gcloud beta run domain-mappings create \
  --service tadaima --domain www.tadaimaus.com --region us-central1
```

Cada mapping imprime los registros DNS (A/AAAA o CNAME) que hay que dar de alta.
Para `us.poslite.com.mx` se agregan en el DNS de poslite.com.mx y listo.

> ⚠️ **El DNS de tadaimaus.com se mueve de Wix SOLO cuando Joel apruebe.**
> Hoy Wix cobra online de verdad y esta tienda es checkout dummy (solo captura
> contacto). Mientras no se muevan los DNS, el mapping existe pero el público
> sigue viendo Wix — cero riesgo.

## 3. QA

La vía confiable es el subdominio QA (mismo server block que el dominio real):

```bash
curl -s https://us.poslite.com.mx/api/v1/us/catalog | head -c 300   # API US
curl -sI https://us.poslite.com.mx/ | head -5                        # SPA US (index.html)
```

También se puede forzar el `Host` para verificar el ruteo de nginx por block:

```bash
curl -s -H "Host: tadaimaus.com" https://us.poslite.com.mx/ | head -20
```

(Contra la URL `*.run.app` el override de Host puede rechazarlo el frontend de
Google antes de llegar a nginx — por eso el QA canónico es `us.poslite.com.mx`.)

Checklist de QA end-to-end (igual que F2 local):

1. POS → módulo TadaimaUS → publicar un producto con precio USD.
2. Abrir la tienda → producto visible → carrito → checkout → folio `TUS-XXXXXX`.
3. POS → Pedidos: aparece con badge de nuevos; cambiar a Contactado baja el badge.
4. `visible=false` o stock 0 ⇒ desaparece de la tienda (regla SellableStock).

## 4. Datos pendientes de Joel (antes del switch de DNS)

El SPA oculta los slots vacíos — hoy `CONTACT_INFO` en
`tadaimaus/src/lib/constants.ts` está **vacío a propósito**:

- Email / teléfono de contacto US y dirección física (CONTACT_INFO).
- Horarios de atención (CONTACT_INFO.hours).
- Shipping / Returns policy y Privacy / Terms (recomendado ANTES del switch).
- Redes sociales US y destino real del newsletter (hoy solo visual).
- Assets propios en alta (logo/hero actuales vienen del export de Wix).

## 5. Orden seguro

deploy → mapping `us.poslite.com.mx` → QA end-to-end ahí → checklist §4
completo → switch de DNS de tadaimaus.com/www cuando Joel dé el OK.
