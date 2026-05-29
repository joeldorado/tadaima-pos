# Bugs Pendientes — Tadaima POS

> Lista corta de bugs reportados que aún no se han arreglado. Cada uno con
> fecha, archivo aproximado y severidad. Se mueven al MASTERLOG cuando se
> resuelven.

## 🟡 Validación: Precio obligatorio al crear producto

**Reportado:** 2026-05-25 (Joel)

**Síntoma:** Al dar de alta un producto regular, el form permite guardar sin
precio (Precio A queda en 0 o vacío). Debe ser **obligatorio** con `precio_1 > 0`.

**Comportamiento actual:**
- ProductForm / NewProductModal: el submit no valida que `prices.price_1 > 0`.
- Backend `StoreProductRequest` probablemente también permite price_1 nulo
  (los precios se sincronizan después en `syncPrices()` del controller).

**Comportamiento esperado:**
- Frontend: validación al submit. Si `precio_a` está vacío o ≤ 0 → toast error
  "Precio A es obligatorio" + foco en el campo. NO permite cerrar el modal.
- Backend: agregar `price_1 => ['required','numeric','min:0.01']` a
  `StoreProductRequest::rules()`. Mismo en `UpdateProductRequest` con `sometimes`.

**Archivos a tocar:**
- `landing/src/pages/ProductsPage.tsx` o el componente del form (NewProductModal)
- `backend/app/Http/Requests/StoreProductRequest.php`
- `backend/app/Http/Requests/UpdateProductRequest.php`

**Tests sugeridos:**
- Feature test: POST /products sin `prices.price_1` → 422 con mensaje claro.
- Feature test: POST /products con `price_1: 0` → 422.
- Feature test: POST /products con `price_1: 100` → 201.

**Severidad:** 🟡 Media — productos sin precio rompen reportes de ganancia y
no se pueden vender en Caja (pero el flujo de alta sí pasa).

---
