# Plan De Continuacion - Fase Catalogo Online

Fecha: 2026-05-15
Owner: Web + Backend
Estado: Planeacion lista para ejecutar

## 1) Objetivo de la fase

Extender la fase de catalogo online para publicar productos reales por tienda (segun stock/visibilidad) en una URL publica simple, mobile-first, lista para compartir por WhatsApp.

## 2) Diagnostico actual (verificado en repo)

Backend ya tiene base funcional:

- Endpoint publico existente: `GET /api/v1/public/catalog/{catalogUrl}`
- Endpoints admin para configuracion/catalogo por tienda:
  - `GET /api/v1/catalog/settings/{store}`
  - `PUT /api/v1/catalog/settings/{store}`
  - `GET /api/v1/catalog/products/{store}`
  - `POST /api/v1/catalog/products/{store}`
  - `PUT /api/v1/catalog/products/{store}/{product}`
  - `DELETE /api/v1/catalog/products/{store}/{product}`
- Logica de `show_price` y `show_stock` ya vive en `CatalogController`.

Frontend actual:

- No existe pagina publica en `landing` para catalogo online.
- Router no tiene ruta como `/tienda-online` ni `/catalogo`.
- `packages/api` tiene helpers de `catalog/settings`, pero no helpers para `catalog/products` ni `public/catalog`.

## 3) Recomendacion de ruta publica

Recomendacion principal:

- `GET /catalogo/:catalogUrl`

Alias recomendado (opcional, por compatibilidad de negocio):

- `GET /tienda-online/:catalogUrl` redirigiendo a `/catalogo/:catalogUrl`

Motivo:

- `catalogo` es mas corto, natural en espanol y facil de dictar/enviar.
- El `catalogUrl` ya existe en backend, no inventamos otro ID.

## 4) Alcance MVP (fase siguiente)

Pagina publica simple (lista):

1. Header de tienda: nombre, sucursal y estado.
2. Busqueda + filtro basico (categoria).
3. Lista de productos: imagen, nombre, precio (si aplica), stock (si aplica), estado disponible/agotado.
4. CTA de contacto/pedido por WhatsApp por producto.
5. Estado vacio y errores claros.

Sin carrito online en esta fase. Solo exhibicion + conversion a contacto.

## 5) Plan de implementacion por bloques

### Bloque A - API client compartido

- Agregar en `packages/api`:
  - `getCatalogProducts(storeId, params?)`
  - `addCatalogProduct(storeId, payload)`
  - `updateCatalogProduct(storeId, productId, payload)`
  - `removeCatalogProduct(storeId, productId)`
  - `getPublicCatalog(catalogUrl, params?)`

Resultado: frontend deja de llamar endpoints manuales.

### Bloque B - Ruta y pagina publica en landing

- Crear `landing/src/pages/OnlineCatalogPage.tsx`
- Agregar rutas:
  - `/catalogo/:catalogUrl` (principal)
  - `/tienda-online/:catalogUrl` (alias opcional)
- UI mobile-first, lista simple y rapida.

Resultado: URL publica navegable desde browser.

### Bloque C - Integracion de datos reales

- Consumir `getPublicCatalog(catalogUrl)` en pagina.
- Respetar `show_price/show_stock` del payload.
- Render de categorias, busqueda local y estado agotado.

Resultado: contenido 100% gobernado por configuracion/stock de tienda.

### Bloque D - Conversion y tracking basico

- Boton "Pedir por WhatsApp" por producto con texto prellenado.
- Eventos minimos:
  - `catalog_view`
  - `product_click`
  - `whatsapp_click`
  - `search_used`
  - `filter_used`

Resultado: medimos adopcion antes de una fase de carrito.

### Bloque E - QA y salida

- Casos QA minimos:
  - URL invalida -> 404 amigable
  - Catalogo vacio -> estado vacio
  - show_price=false -> no mostrar precio
  - show_stock=false -> no mostrar stock
  - stock 0 -> badge agotado
  - busqueda/filtro funcionando
  - responsive en movil

## 6) UI/UX minimo acordado para esta fase

- Seccion cliente final, no estilo panel admin.
- Tarjetas compactas, legibles, tap targets >= 44px.
- Boton CTA siempre visible en viewport movil.
- Carga inicial rapida y placeholders simples.

## 7) Riesgos y mitigaciones

- Riesgo: inventario por tienda puede calcularse caro.
  - Mitigacion: paginacion ya disponible + limitar `per_page`.
- Riesgo: `catalogUrl` duplicado o no definido.
  - Mitigacion: validacion existente en request + checklist de configuracion por tienda.
- Riesgo: confusion entre "catalogos de preventa" y "catalogo online".
  - Mitigacion: naming consistente en UI: "Tienda Online".

## 8) Definicion de listo (DoD)

Se considera cerrada esta fase cuando:

1. Existe URL publica `/catalogo/:catalogUrl` funcional.
2. Muestra productos visibles del catalogo de tienda.
3. Respeta `show_price/show_stock`.
4. Tiene CTA WhatsApp por producto.
5. QA MVP aprobado y documentado.

## 9) Siguiente paso recomendado inmediato

Implementar Bloques A + B en el siguiente sprint tecnico corto (1 PR frontend + 1 PR packages/api), dejando Bloques C-E en un segundo corte de integracion/QA.
