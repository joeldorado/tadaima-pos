# Especificación y Documentación de la Pantalla de Reportes

Este documento detalla el funcionamiento, la arquitectura, el flujo de datos y las características de la pantalla de **Reportes** (`landing/src/pages/ReportsPage.tsx`) en el sistema Tadaima POS.

---

## 1. Arquitectura de Datos y Consultas (TanStack Query)

La pantalla se conecta a la API de Tadaima a través de hooks de consulta optimizados de React Query:
*   `getSalesReport` — Obtiene los datos generales de ventas.
*   `getInventoryReport` — Obtiene el estado del inventario y existencias.
*   `getTopProductsReport` — Obtiene la lista de productos más vendidos.
*   `getCustomersReport` — Obtiene los datos del top de clientes.
*   `getPreSaleOrders` — Carga los folios de preventas en el rango seleccionado.

### Sincronización y Polling Live (20s)
*   Las consultas financieras de la pestaña activa hacen **polling automático cada 20 segundos** (`refetchInterval: 20_000` o `LIVE_POLL_MS`) para mantener los datos sincronizados en tiempo real en la pantalla.
*   El intervalo solo corre en la pestaña activa para evitar saturación del servidor.
*   Se utiliza un `staleTime: 30s` para permitir navegaciones instantáneas entre pestañas sin recargar innecesariamente.

---

## 2. Pestaña de Ventas (Auditoría Financiera)

La pestaña **Ventas** es el núcleo de auditoría de la pantalla, diseñada para que los gerentes y administradores realicen el balance de caja por producto en lugar de ticket por ticket.

### A. Filtros Multiselección e Historial
*   Ubicados en la parte superior central de la pantalla.
*   Permiten filtrar dinámicamente la lista de ventas y preventas mediante botones de tipo *toggle* (multiselección):
    *   `all` (Todo) — Resetea y muestra todas las transacciones.
    *   `cash` (Efectivo) — Pagos en efectivo (pesos y dólares).
    *   `dollar` (Dólar) — Muestra transacciones con pago en USD.
    *   `card` (Tarjeta) — Pagos con terminal (débito, crédito, TPV).
    *   `transfer` (Transferencia) — Pagos por SPEI o depósitos.
    *   `cancelled` (Cancelados) — Muestra únicamente las transacciones canceladas.

### B. Agrupación y Clasificación de Productos
Los artículos vendidos y preventas cobradas en el rango se unifican en un mapa reactivo en el frontend, agrupados por su ID de producto o catálogo de preventa:
1.  **Productos Generales**: Artículos de tipo regular (figuras, coleccionables, accesorios).
2.  **Manga Nacional**: Artículos identificados en base de datos con `product_type: 'manga'`.

> **Regla de Ordenación**: Todos los productos generales se muestran al inicio de la tabla (ordenados de mayor a menor cantidad vendida). En la parte inferior, tras una **línea de separación gris**, se muestran todos los tomos de **Manga Nacional**, garantizando una visualización sumamente ordenada.

### C. Devoluciones y Cancelaciones (ADR-016 y Legacy)
El sistema unifica y gestiona las devoluciones provenientes de dos flujos distintos para garantizar visibilidad total:
1. **Cancelaciones Parciales/Totales (Modernas - ADR-016)**: Utiliza un "snapshot" exacto (`qty_cancelled` y `line_total`) de los artículos devueltos, permitiendo reportar exactamente qué productos y montos regresaron a tienda.
2. **Devoluciones Clásicas (Legacy)**: Ventas marcadas en su totalidad como `returned` sin snapshot moderno. El sistema procesa recursivamente todos sus artículos originales como devoluciones para asegurar que ninguna métrica escape del balance.
*Nota*: Las devoluciones restan la cantidad en la tabla y se muestran destacadas visualmente en color rojo, restando la métrica neta (bruto) para cuadrar con corte de caja.

### D. Desglose Detallado por Fila (Detalle Expandible)
Al hacer clic en cualquier fila de la tabla, se expande una sección de auditoría que detalla:
1.  **Desglose por Método de Pago**: Muestra cuánto se cobró por cada método (efectivo, dólares, tarjeta).
    *   *Cobros con Tarjeta*: Aplica una regla de **absorción de comisión de terminal** y calcula el **16% de IVA sobre la comisión de terminal** (TPV), mostrando en color verde el **Neto Real de Ingreso para la Tienda** después de deducir comisiones e impuestos:
        $$\text{Neto Real} = \text{Bruto} - \text{Comisión TPV} - (\text{Comisión TPV} \times 0.16)$$
2.  **Desglose por Precios de Venta**: Agrupa cuántas unidades se vendieron a cada precio unitario del producto (por si varió entre clientes o promociones).
3.  **Información de Preventas (Abonos vs Deuda)**: Si el producto pertenece a una preventa, muestra el **Total Abonado (Apartado)** cobrado en el rango frente al **Total Deuda (Pendiente por cobrar)** del cliente.

---

## 3. Totales e Indicadores de Resumen

Debajo de la tabla de ventas, se despliega una fila de totales generales y una cuadrícula de 5 tarjetas de resumen con los KPIs sincronizados en tiempo real según los filtros activos:
1.  **Venta Bruta Total**: Suma total de los ingresos cobrados.
2.  **Manga Nacional**: Suma de ingresos y unidades vendidas de la sección de tomos de manga.
3.  **Comisión TPV Total**: Total de comisiones retenidas por las terminales bancarias.
4.  **IVA s/Comisión Total (16%)**: Impuesto acumulado sobre las comisiones de terminal.
5.  **Neto Real para la Tienda**: Total de ingresos verdaderos que quedan en caja tras comisiones e impuestos.

---

## 4. Vista Ampliada (Modal de Pantalla Completa)

Para facilitar el análisis de inventarios y auditoría con listados extensos, la tabla de Ventas por Producto cuenta con un botón **"Ampliar"** que despliega un modal a pantalla completa con:
*   Fondo difuminado (*backdrop blur*) y diseño optimizado de alto contraste.
*   Scroll interno independiente para navegar sin perder el encabezado.
*   Soporte para abrir múltiples filas de detalles de productos al mismo tiempo.
*   Cierre rápido mediante el botón `[X]` o presionando la tecla `Escape`.

---

## 5. Exportación de Reportes

La pantalla cuenta con dos potentes motores de exportación que se adaptan dinámicamente a los filtros activos de la UI:

### A. Reporte de Excel (.xlsx) con `ExcelJS`
*   **Encabezado Corporativo**: Incluye el logotipo de Tadaima (`/tadaima-logo.jpeg`) e información del periodo, sucursal y marca de tiempo.
*   **Sección 1 (Detalle General)**: Estructurado verticalmente. Separa los productos generales de los tomos de **Manga Nacional** con un separador gris. Incluye columnas dedicadas para `Comisión TPV`, `IVA s/Comisión (16%)` y `Neto Real` para evitar dudas matemáticas, además de una fila de totales generales con bordes dobles de contabilidad.
*   **Sección 2 (Cobros con Tarjeta)**: Detalle exclusivo de TPV con cálculo del 16% de IVA sobre comisiones.
*   **Sección 3 (Efectivo)**: Detalle del dinero ingresado en efectivo (con distinción de dólares si aplica).
*   **Sección 4 (Preventas)**: Balance de control de preventas (Abonos vs Deudas).
*   **Sección 5 (Devoluciones y Cancelaciones)**: Listado independiente y sumario exclusivo de todos los productos cancelados o devueltos en el periodo, destacando las cantidades y los montos regresados al cliente (con valores negativos correspondientes).

### B. Reporte de PDF (.pdf) con `jsPDF`
*   Genera un documento tamaño A4 horizontal de alta calidad con cabeceras de color rojo Tadaima (`rgb(204, 34, 0)`).
*   **Tabla 1**: Muestra el desglose de productos con columnas explícitas de **Comisión TPV**, **IVA s/Comisión (16%)** y **Neto Real**. Los tomos de **Manga Nacional** están segregados en la parte inferior tras un divisor gris de fondo.
*   **Tablas 2, 3, 4 y 5**: Espejos detallados para tarjetas, efectivo, preventas y devoluciones respectivamente, asegurando que todos los reportes impresos sean 100% consistentes con los datos en pantalla y la hoja de cálculo de Excel.
