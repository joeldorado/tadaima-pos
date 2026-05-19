# QA-04 - Tienda Online (Catalogo Publico por Tienda)

Fecha: 2026-05-15
Prioridad: P0/P1
Scope: MVP catalogo publico `/catalogo/:catalogUrl` y alias `/tienda-online/:catalogUrl`

## Precondiciones

- Existe una tienda con `catalog_url` configurado.
- Esa tienda tiene productos visibles en `catalog_products`.
- Endpoint publico responde: `GET /api/v1/public/catalog/{catalogUrl}`.

## Bloque A - Carga base (P0)

1. Abrir `/catalogo/{catalogUrl_valido}`.
   - Esperado: renderiza nombre de tienda y lista de productos.
2. Abrir `/catalogo/{catalogUrl_invalido}`.
   - Esperado: estado "Catalogo no disponible" sin crash.
3. Abrir `/tienda-online/{catalogUrl_valido}`.
   - Esperado: misma vista del catalogo.

## Bloque B - Reglas de visibilidad (P0)

1. `show_price = true`.
   - Esperado: precio visible en tarjetas.
2. `show_price = false`.
   - Esperado: texto "Precio por mensaje" (sin monto).
3. `show_stock = true` con stock > 0 y stock = 0.
   - Esperado: badge `Disponible` o `Agotado`.
4. `show_stock = false`.
   - Esperado: no mostrar badge de stock.

## Bloque C - Busqueda y filtro (P1)

1. Buscar por nombre parcial.
   - Esperado: filtra resultados correctos.
2. Buscar por categoria en texto.
   - Esperado: incluye coincidencias por categoria.
3. Seleccionar categoria en dropdown.
   - Esperado: lista solo productos de esa categoria.
4. Con busqueda+filtro sin match.
   - Esperado: estado "Sin resultados".

## Bloque D - CTA WhatsApp (P0)

1. Click en "Pedir por WhatsApp" de un producto.
   - Esperado: abre `wa.me` en pestaña nueva.
2. Verificar texto prellenado.
   - Esperado: incluye tienda + nombre producto.
3. Con `show_price=true`.
   - Esperado: incluye precio en el mensaje.
4. Con `show_stock=true`.
   - Esperado: incluye estado (Disponible/Agotado).

## Bloque E - Tracking minimo (P1)

1. Abrir catalogo.
   - Esperado: evento `catalog_view` en `window` custom event `tadaima:catalog-event`.
2. Escribir busqueda >= 2 caracteres.
   - Esperado: evento `search_used`.
3. Cambiar categoria.
   - Esperado: evento `filter_used`.
4. Click en tarjeta de producto.
   - Esperado: evento `product_click`.
5. Click CTA WhatsApp.
   - Esperado: evento `whatsapp_click`.
6. Verificar buffer local.
   - Esperado: `sessionStorage["tadaima_catalog_events"]` contiene los eventos.

## Bloque F - Responsive (P0)

1. iPhone SE / 390px width.
   - Esperado: layout usable, sin overflow horizontal.
2. Android mediano.
   - Esperado: CTA accesible y legible.
3. Desktop >= 1280px.
   - Esperado: grid 3 columnas cuando haya suficiente ancho.
