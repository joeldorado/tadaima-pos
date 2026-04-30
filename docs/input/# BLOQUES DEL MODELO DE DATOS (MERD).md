# BLOQUES DEL MODELO DE DATOS (MERD)
# SISTEMA POS MULTI-SUCURSAL

---

## OBJETIVO

Definir la organización del modelo de datos por bloques funcionales para facilitar:

- diseño del MERD  
- desarrollo modular  
- escalabilidad del sistema  
- implementación en Laravel  

El modelo está diseñado para un POS profesional tipo retail (Oxxo / Walmart).

---

## ESTRUCTURA DEL MODELO

La base de datos se organiza en bloques funcionales:

---

# 1. NÚCLEO DEL SISTEMA
(Seguridad y estructura)

Tablas:

- companies  
- stores  
- warehouses  
- store_warehouses  
- users  
- roles  
- permissions  
- user_roles  
- role_permissions  

---

# 2. CATÁLOGO DE PRODUCTOS

Tablas:

- product_categories  
- products  
- product_prices  
- product_images  
- product_payment_methods  

---

# 3. MÓDULO MANGA (ESPECIALIZADO)

Tablas:

- mangas  
- manga_prices  

Este módulo es independiente del catálogo general y permite manejo especializado de productos tipo colección con cálculo automático de costo.

---

# 4. INVENTARIO PROFESIONAL

Modelo basado en movimientos (ledger).

Tablas:

- inventory  
- inventory_movements  
- inventory_transfers  
- inventory_transfer_items  

Opcional (recomendado):

- inventory_reservations  

Este modelo permite trazabilidad completa del stock y evita inconsistencias.

---

# 5. VENTAS POS (CORE FINAL)

Tablas:

- sales  
- sale_items  
- payments  
- payment_methods  
- store_payment_methods  
- terminals  

Aquí se almacenan únicamente ventas confirmadas.

---

# 6. SISTEMA DE CAJA

Tablas:

- cash_registers  
- cash_register_sessions  
- cash_movements  

Permite control de apertura, cierre y movimientos de caja.

---

# 7. SISTEMA DE VENTAS EN PROCESO (DRAFTS)

Bloque clave para POS profesional.

Tablas:

- sales_drafts  
- sales_draft_items  

Permite:

- múltiples ventas simultáneas  
- suspender ventas  
- recuperar ventas  
- flujo rápido tipo retail  

---

# 8. PREVENTAS (AVANZADO)

Tablas:

- pre_sales  
- pre_sale_items  
- pre_sale_payments  

Estados:

- live  
- ready  
- expired  
- completed  

Permite control completo de productos antes de su llegada a inventario.

---

# 9. CLIENTES

Tablas:

- customers  

Soporta integración con sistemas externos (ej. Tadaima).

---

# 10. CATÁLOGO ONLINE

Tablas:

- catalog_settings  
- catalog_products  

Permite generar catálogo digital conectado al inventario.

---

# 11. IMPUESTOS Y DESCUENTOS

Tablas:

- taxes  
- product_taxes  
- discounts  
- sale_discounts  

Permite manejo fiscal y promociones.

---

# 12. COMPRAS (ABASTECIMIENTO)

Tablas:

- suppliers  
- purchase_orders  
- purchase_order_items  

Permite controlar entrada de productos desde proveedores.

---

# 13. DEVOLUCIONES

Tablas:

- sale_returns  
- sale_return_items  

Permite reversión de ventas y ajuste de inventario.

---

# 14. AUDITORÍA DEL SISTEMA

Tablas:

- system_logs  
- audit_logs  

Permite rastrear cambios y acciones críticas del sistema.

---

# 15. CONFIGURACIÓN

Tablas:

- system_settings  

Permite parámetros globales del sistema.

---

# 16. SAAS (OPCIONAL FUTURO)

Tablas:

- plans  
- subscriptions  

Permite escalar el sistema a modelo multiempresa (POS como servicio).

---

## PUNTO CRÍTICO: CONTROL DE COSTOS

Requerimiento del negocio:

No todos los usuarios pueden ver costos reales.

Solución implementada:

- campo en users: `can_view_cost`

Opcional avanzado:

Tabla:

- product_cost_permissions  

Permite control granular por producto y usuario.

---

## PRINCIPIOS DEL MODELO

El modelo está diseñado bajo los siguientes principios:

- separación modular  
- trazabilidad completa  
- control de seguridad  
- escalabilidad horizontal  
- compatibilidad multi-sucursal  
- preparado para alto volumen de transacciones  

---

## RESULTADO FINAL

Con este modelo se obtiene:

- base de datos profesional  
- MERD completo  
- listo para implementación en Laravel  
- listo para migraciones  
- preparado para crecimiento  
- compatible con POS de alto rendimiento  

---

## SIGUIENTE PASO

Diseñar el núcleo del sistema con detalle técnico:

Módulo 1 — Seguridad y estructura  

Incluye:

- relaciones  
- claves foráneas  
- índices  
- restricciones  

Posteriormente:

Diseñar el modelo de inventario tipo ledger completo para garantizar precisión en stock y reportes.