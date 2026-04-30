# Tadaima POS — Mobile App (Expo React Native) — Pasos de implementación

> Stack: Expo 54 · React 19 · TypeScript · Expo Router · TanStack Query · Zustand · React Hook Form
> App existente en: `/Tadaima/app/` → migrar a `/Tadaima/apps/mobile/`
> Prioridad: POS Checkout funcional lo antes posible (Fase 7)

---

## Fase 0 — Migración al Monorepo
**Tiempo estimado: 1–2h**

- [ ] Copiar el contenido de `/app/` a `/apps/mobile/`
- [ ] Actualizar `package.json` de la app: nombre → `@tadaima/mobile`
- [ ] Verificar que `npx expo start` funciona desde `/apps/mobile/`
- [ ] Agregar `/apps/mobile/` al workspace root en `package.json`
- [ ] Agregar script en `turbo.json` para `expo:start` y `expo:build`
- [ ] Crear `/apps/mobile/src/` como carpeta raíz del código de la app
- [ ] Configurar path alias `@/` apuntando a `/apps/mobile/src/`
- [ ] Instalar dependencias: `@tanstack/react-query`, `zustand`, `react-hook-form`, `axios`
- [ ] Instalar `expo-secure-store` para almacenamiento seguro del token
- [ ] Instalar `expo-barcode-scanner` para escaneo de productos en POS
- [ ] Verificar que la app compila sin errores tras migración

---

## Fase 1 — Consumo del package `@tadaima/api`
**Tiempo estimado: 1h**

> Completar primero la Fase 1 del plan web (el package `@tadaima/api` es compartido)

- [ ] Instalar `@tadaima/api` como workspace dependency en `/apps/mobile/package.json`
- [ ] Crear `src/lib/tokenStorage.ts` — implementación con `expo-secure-store`
  - `get()` → `SecureStore.getItemAsync('token')`
  - `set(t)` → `SecureStore.setItemAsync('token', t)`
  - `clear()` → `SecureStore.deleteItemAsync('token')`
- [ ] Crear `src/lib/queryClient.ts` — `QueryClient` con `staleTime: 30_000`, `retry: 1`, `networkMode: 'always'`
- [ ] En el entry point de la app, llamar `setTokenGetter(() => tokenStorage.get())` para inyectar token en Axios

---

## Fase 2 — Auth Mobile
**Tiempo estimado: 1.5–2h**

> Completar primero la Fase 2 del plan web (`@tadaima/auth` package)

- [ ] Instalar `@tadaima/auth` como workspace dependency
- [ ] Envolver el root de la app con `QueryClientProvider` + `AuthProvider` (usando el `tokenStorage` de Expo Secure Store)
- [ ] Crear `src/app/(auth)/login.tsx` — pantalla de login
  - [ ] Campos: email (teclado email) + password (secureTextEntry)
  - [ ] Submit con React Hook Form
  - [ ] En error: mostrar mensaje del backend dentro de la pantalla (no alert nativo)
  - [ ] Loading indicator en el botón mientras autentica
  - [ ] En éxito: Expo Router redirige a `/(app)/`
- [ ] Crear `src/app/(auth)/_layout.tsx` — stack navigator solo para auth
- [ ] Crear lógica en `src/app/_layout.tsx` (root layout):
  - [ ] Al montar: leer token de SecureStore
  - [ ] Si token existe: llamar `me()`, si OK → navegar a `/(app)/`, si 401 → `/(auth)/login`
  - [ ] Si no hay token: navegar a `/(auth)/login`
  - [ ] Mientras verifica: pantalla de splash / loading
- [ ] Verificar: login persiste tras cerrar la app, logout redirige a login

---

## Fase 3 — Navegación Principal (Layout Mobile)
**Tiempo estimado: 1.5h**

- [ ] Crear `src/app/(app)/_layout.tsx` — Tab Navigator con tabs:
  - [ ] **POS** (ícono caja registradora) — tab principal
  - [ ] **Clientes** (ícono persona)
  - [ ] **Apartados** (ícono ticket)
  - [ ] **Caja** (ícono moneda)
  - [ ] **Inventario** (ícono caja)
- [ ] Configurar header con: nombre de tienda (del AuthContext) + botón logout arriba a la derecha
- [ ] Crear pantalla placeholder para cada tab (texto "Próximamente")
- [ ] Verificar que la navegación entre tabs funciona sin errores
- [ ] Configurar colores y tipografía base (definir theme: primario, secundario, error, superficie)

---

## Fase 4 — Package `@tadaima/hooks` en Mobile
**Tiempo estimado: 30min**

> Completar primero la Fase 6 del plan web (`@tadaima/hooks` package)

- [ ] Instalar `@tadaima/hooks` como workspace dependency
- [ ] Verificar que hooks básicos funcionan en mobile: `useProducts({ active: true })` devuelve datos
- [ ] Instalar `@tadaima/permissions` y verificar que `usePermission()` funciona

---

## Fase 5 — Zustand: CartStore
**Tiempo estimado: 1h**

- [ ] Crear `src/store/cartStore.ts` con Zustand:
  - [ ] Estado: `items: CartItem[]`, `customerId: number | null`, `storeId: number`, `discountPercent: number`
  - [ ] `CartItem`: `{ productId, name, price, quantity, stock }`
  - [ ] Acciones: `addItem()`, `removeItem()`, `updateQty()`, `setCustomer()`, `setDiscount()`, `clear()`
  - [ ] `addItem()`: si el producto ya está en el cart, incrementa cantidad; si quantity > stock, rechaza
  - [ ] Getters derivados: `subtotal`, `discountAmount`, `total`, `itemCount`
- [ ] Persistir cart en AsyncStorage entre sesiones (zustand-persist) — opcional, por si se corta la app
- [ ] Exportar `useCartStore()`

---

## Fase 6 — POS: Búsqueda y selección de productos
**Tiempo estimado: 2h**

- [ ] Crear `src/app/(app)/pos/index.tsx` — pantalla principal POS
- [ ] Buscador de productos en la parte superior:
  - [ ] Input de texto con debounce 300ms → llama `useProducts({ search: term, active: true })`
  - [ ] Botón de cámara que activa `expo-barcode-scanner` → busca por barcode
- [ ] Lista de resultados de productos:
  - [ ] `ProductCard` — muestra: nombre, SKU, precio (price_1), stock disponible
  - [ ] Badge rojo si stock === 0 (deshabilitar tap)
  - [ ] Al tocar: agrega 1 unidad al cart con feedback visual (animación breve)
- [ ] Sección inferior fija: resumen del cart
  - [ ] Contador de ítems y total
  - [ ] Botón "Ver carrito" → navega a `/(app)/pos/cart`
- [ ] Estado vacío si no hay resultados de búsqueda

---

## Fase 7 — POS: Carrito
**Tiempo estimado: 2h**

- [ ] Crear `src/app/(app)/pos/cart.tsx`
- [ ] Lista de ítems del cart:
  - [ ] Por ítem: nombre, precio unitario, controles +/− de cantidad, total de línea, botón eliminar
  - [ ] Swipe-to-delete para eliminar ítem (GestureHandler o Reanimated)
- [ ] Sección de cliente:
  - [ ] Buscador de clientes (typeahead) con `useCustomers({ search: term })`
  - [ ] Al seleccionar: muestra nombre y saldo de crédito disponible
  - [ ] Botón para deseleccionar cliente
- [ ] Sección de descuento:
  - [ ] Input numérico de porcentaje (0–100)
  - [ ] Validar que no exceda el máximo permitido (si aplica)
- [ ] Resumen financiero:
  - [ ] Subtotal, descuento (−), total
- [ ] Botón "Cobrar" → navega a `/(app)/pos/payment`
- [ ] Botón "Guardar borrador" → llama `createDraft()`, muestra confirmación, limpia cart
- [ ] Botón "Cancelar" → confirmar con Alert antes de limpiar el cart

---

## Fase 8 — POS: Cobro y confirmación
**Tiempo estimado: 2.5h**

- [ ] Crear `src/app/(app)/pos/payment.tsx`
- [ ] Mostrar total a cobrar (grande, visible)
- [ ] Selector de métodos de pago disponibles para la tienda (llama `getStoreSetting()`)
- [ ] Por cada método seleccionado: input de monto
- [ ] Validar que la suma de pagos ≥ total
- [ ] Mostrar cambio a devolver si pago en efectivo > total
- [ ] Si hay cliente con crédito: checkbox "Usar crédito disponible ($X)"
- [ ] Botón "Confirmar venta" → llama `createSale()`:
  - [ ] Loading indicator mientras procesa
  - [ ] En éxito → navegar a `/(app)/pos/receipt`
  - [ ] En error (stock insuficiente, sin caja abierta) → mostrar mensaje específico del backend
- [ ] Crear `src/app/(app)/pos/receipt.tsx` — pantalla de comprobante:
  - [ ] Número de venta, fecha, ítems, totales, método de pago
  - [ ] Botón "Nueva venta" → limpia cart y regresa a POS index
  - [ ] Botón "Compartir / Imprimir" (placeholder — flujo de impresora bluetooth futuro)

---

## Fase 9 — Caja Registradora
**Tiempo estimado: 2h**

- [ ] Crear `src/app/(app)/cash/index.tsx`
- [ ] Al entrar: llama `getSession()` para verificar si hay sesión abierta
- [ ] **Sin sesión abierta:**
  - [ ] Formulario de apertura: efectivo inicial (input numérico)
  - [ ] Botón "Abrir caja" → llama `openCash()`
  - [ ] En error (ya abierta): mostrar mensaje del backend
- [ ] **Con sesión abierta:**
  - [ ] Card con info: abierta a las X, cajero, efectivo inicial
  - [ ] Lista de movimientos de la sesión (entradas/salidas/ajustes)
  - [ ] Botón "Registrar movimiento" → bottom sheet con tipo (entrada/salida/ajuste), monto, descripción
  - [ ] Botón "Cerrar caja" → modal de confirmación con input de efectivo final
  - [ ] Al cerrar: llama `closeCash()` y muestra resumen de cierre
- [ ] Validar que botón "Cobrar" del POS esté deshabilitado si no hay caja abierta (banner warning)

---

## Fase 10 — Clientes (Mobile)
**Tiempo estimado: 1.5h**

- [ ] Crear `src/app/(app)/customers/index.tsx`
  - [ ] Buscador con debounce + lista de resultados
  - [ ] Por cliente: nombre, teléfono, saldo de crédito
  - [ ] Tap → navega a detalle
- [ ] Crear `src/app/(app)/customers/[id].tsx`
  - [ ] Nombre, teléfono, email, dirección
  - [ ] Saldo de crédito con historial simplificado
  - [ ] Botón "Agregar al carrito actual" si hay una venta en curso (deep link a POS)
- [ ] Crear `src/app/(app)/customers/new.tsx`
  - [ ] Formulario minimal: nombre (requerido), teléfono, email
  - [ ] Útil para crear clientes en mostrador sin ir al web

---

## Fase 11 — Apartados / Pre-Ventas (Mobile)
**Tiempo estimado: 2h**

- [ ] Crear `src/app/(app)/pre-sales/index.tsx`
  - [ ] Tabs: Activos (live/ready) | Completados | Cancelados
  - [ ] Por apartado: nombre cliente, total, saldo pendiente, estado con badge de color
- [ ] Crear `src/app/(app)/pre-sales/[id].tsx`
  - [ ] Detalle: ítems, pagos registrados, saldo pendiente
  - [ ] Botón "Registrar pago" → bottom sheet: monto + método de pago
  - [ ] Botón "Completar" (si saldo = 0) → confirmación → llama `updateStatus(complete)`
  - [ ] Historial de cambios de estado (logs)
- [ ] Crear `src/app/(app)/pre-sales/new.tsx`
  - [ ] Reutilizar flujo similar al cart del POS para seleccionar ítems
  - [ ] Selector de cliente (requerido para apartados)
  - [ ] Botón "Crear apartado" → llama `createPreSale()`

---

## Fase 12 — Inventario (Mobile, solo consulta)
**Tiempo estimado: 1h**

- [ ] Crear `src/app/(app)/inventory/index.tsx`
  - [ ] Buscador por producto (nombre/SKU/barcode scanner)
  - [ ] Lista: producto | bodega | cantidad
  - [ ] Filtro por bodega (picker)
  - [ ] Badge de alerta si stock ≤ 5
- [ ] El inventario en mobile es **solo lectura** — sin ajustes manuales (eso queda en web)
- [ ] Tap en un ítem → muestra stock en todas las bodegas de ese producto (modal)

---

## Fase 13 — Borradores de Venta (Mobile)
**Tiempo estimado: 1h**

- [ ] Botón "Borradores" en la pantalla de POS (icono en header)
- [ ] `src/app/(app)/pos/drafts.tsx` — lista de borradores activos
  - [ ] Por borrador: fecha, cantidad de ítems, total estimado
  - [ ] Botón "Retomar" → carga los ítems del borrador al CartStore, regresa a cart
  - [ ] Botón "Cancelar borrador" → confirmación → llama `cancelDraft()`

---

## Fase 14 — Polish Mobile
**Tiempo estimado: 2–3h**

- [ ] Splash screen personalizada (logo Tadaima)
- [ ] Manejo de errores global: `ErrorBoundary` en el root
- [ ] Estado sin conexión — TanStack Query en modo offline muestra datos cacheados + banner "Sin conexión"
- [ ] Haptic feedback en acciones importantes (checkout, abrir/cerrar caja) con `expo-haptics`
- [ ] Evitar scroll innecesario en pantallas POS — todo visible sin scroll en pantallas normales
- [ ] Bloquear orientación a portrait en toda la app (`expo-screen-orientation`)
- [ ] Tamaños de fuente accesibles — inputs y botones mínimo 44px de altura táctil
- [ ] Keyboard avoiding en todos los formularios (`KeyboardAvoidingView`)
- [ ] Confirmar que la app no crashea si se pierde y recupera la conexión a internet

---

## Fase 15 — Build + Deploy Mobile
**Tiempo estimado: 2h**

- [ ] Configurar `app.json`: nombre, slug, versión, bundle ID (`mx.tadaima.pos`)
- [ ] Configurar `EXPO_PUBLIC_API_URL` en `.env` para producción
- [ ] `eas build --platform android --profile preview` — APK para pruebas internas
- [ ] Instalar en dispositivo físico y probar contra API de producción
- [ ] Verificar que el token persiste entre cierres de la app
- [ ] Configurar `eas update` para OTA updates sin pasar por tienda
- [ ] (Opcional) Build para iOS con certificados de Apple Developer

---

## Orden de desarrollo recomendado (prioridad mobile)

```
Fase 0  Migración monorepo
Fase 1  Conectar @tadaima/api
Fase 2  Auth login / persistencia de token
Fase 3  Layout + tabs
Fase 5  CartStore
Fase 6  POS: buscar productos          ← MVP mínimo empieza aquí
Fase 7  POS: carrito
Fase 8  POS: cobro + recibo            ← Con esto ya se puede vender
Fase 9  Caja registradora
Fase 10 Clientes
Fase 11 Apartados
Fase 12 Inventario consulta
Fase 13 Borradores
Fase 14 Polish
Fase 15 Build
```

**MVP funcional de caja** = Fases 0, 1, 2, 3, 5, 6, 7, 8, 9 — estimado ~14–18h de trabajo

---

## Criterio de completitud por pantalla

Cada pantalla mobile se considera completa cuando:
- [ ] Funciona en dispositivo físico (no solo simulador)
- [ ] Los estados loading / error / vacío están implementados
- [ ] Los inputs tienen validación y mensajes en español
- [ ] No hay pantallas en blanco durante la carga
- [ ] Las acciones destructivas piden confirmación
- [ ] El flujo feliz funciona end-to-end con la API de producción
