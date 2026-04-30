# DOCUMENTO 5 — MAPEO UI ↔ BASE DE DATOS  
Sistema POS Multi-Sucursal  

---

## 1. OBJETIVO DEL DOCUMENTO  

Este documento define la relación entre las pantallas del sistema (UI) y las tablas de la base de datos.  

El objetivo es que cada acción de la interfaz tenga claro qué tablas consulta o modifica.  

Este documento sirve para:  

- Desarrollo frontend  
- Desarrollo backend  
- Evitar errores de integración  
- Entender el flujo de datos del sistema  

---

## 2. ESTRUCTURA DEL DOCUMENTO  

Cada módulo incluye:  

- Pantalla  
- Acción  
- Tablas involucradas  
- Campos utilizados  
- Tipo de operación (SELECT / INSERT / UPDATE)  

---

# 3. MÓDULO: CAJA POS (DRAFTS)

## Pantalla: Caja principal  
### Acción: Buscar producto  

**Tablas:**  
- products  
- product_prices  
- inventory  

**Campos:**  
- products.id  
- products.name  
- products.barcode  
- product_prices.price_1 a price_5  
- inventory.quantity  

**Operación:**  
SELECT  

**Resultado:**  
El producto se muestra y puede agregarse al draft.  

---

## Pantalla: Caja principal  
### Acción: Crear venta (draft)  

**Tabla:**  
- sales_drafts  

**Campos:**  
- store_id  
- register_session_id  
- user_id  
- status  

**Operación:**  
INSERT  

---

## Pantalla: Caja principal  
### Acción: Agregar producto al carrito  

**Tabla:**  
- sales_draft_items  

**Campos:**  
- draft_id  
- product_id / manga_id  
- quantity  
- price  
- total  

**Operación:**  
INSERT  

---

## Pantalla: Caja principal  
### Acción: Suspender venta  

**Tabla:**  
- sales_drafts  

**Campos:**  
- status = suspended  

**Operación:**  
UPDATE  

---

## Pantalla: Caja principal  
### Acción: Recuperar venta  

**Tabla:**  
- sales_drafts  

**Campos:**  
- status = open  

**Operación:**  
UPDATE  

---

# 4. MÓDULO: CAJA POS — CONFIRMAR VENTA  

## Pantalla: Confirmar venta  

**Tablas involucradas:**  
- sales  
- sale_items  
- payments  
- inventory_movements  
- sales_drafts  

**Campos principales:**  

**sales**  
- store_id  
- register_session_id  
- user_id  
- customer_id  
- subtotal  
- tax  
- discount  
- total  
- terminal_id  

**sale_items**  
- sale_id  
- product_id / manga_id  
- quantity  
- price  
- total  

**payments**  
- sale_id  
- payment_method_id  
- terminal_id  
- amount  
- commission_amount  

**inventory_movements**  
- product_id  
- warehouse_id  
- type = venta  
- quantity  

**sales_drafts**  
- status = completed  

**Operación:**  
- INSERT sales  
- INSERT sale_items  
- INSERT payments  
- INSERT inventory_movements  
- UPDATE sales_drafts  

---

# 5. MÓDULO: CLIENTES  

## Pantalla: Crear cliente  

**Tabla:**  
- customers  

**Campos:**  
- name  
- phone  
- email  
- address  
- external_member_id  

**Operación:**  
INSERT  

---

# 6. MÓDULO: PRODUCTOS  

## Pantalla: Crear producto  

**Tablas:**  
- products  
- product_prices  

**Campos:**  

**products**  
- category_id  
- name  
- sku  
- barcode  
- description  
- cost  

**product_prices**  
- price_1 a price_5  

**Operación:**  
- INSERT products  
- INSERT product_prices  

---

# 7. MÓDULO: MANGA  

## Pantalla: Crear manga  

**Tabla:**  
- mangas  

**Campos:**  
- name  
- volume_number  
- editorial  
- public_price  
- profit_margin_percentage  
- calculated_cost  

**Operación:**  
INSERT  

---

# 8. MÓDULO: INVENTARIO  

## Pantalla: Ajuste de inventario  

**Tabla:**  
- inventory_movements  

**Campos:**  
- product_id / manga_id  
- warehouse_id  
- type  
- quantity  
- reference  

**Operación:**  
INSERT  

---

# 9. MÓDULO: PREVENTAS  

## Pantalla: Crear preventa  

**Tablas:**  
- pre_sales  
- pre_sale_items  

**Campos:**  

**pre_sales**  
- store_id  
- user_id  
- customer_id  
- status (live)  

**pre_sale_items**  
- pre_sale_id  
- product_id / manga_id  
- quantity  
- price  

**Operación:**  
- INSERT pre_sales  
- INSERT pre_sale_items  

---

## Pantalla: Pago de preventa  

**Tabla:**  
- pre_sale_payments  

**Campos:**  
- pre_sale_id  
- amount  

**Operación:**  
INSERT  

---

## Pantalla: Completar preventa  

**Tablas:**  
- sales  
- pre_sales  

**Operación:**  
- INSERT sale  
- UPDATE pre_sales (completed)  

---

# 10. MÓDULO: CAJA  

## Pantalla: Abrir caja  

**Tabla:**  
- cash_register_sessions  

**Campos:**  
- register_id  
- user_id  
- opened_at  
- opening_cash  
- status  

**Operación:**  
INSERT  

---

## Pantalla: Cerrar caja  

**Campos:**  
- closed_at  
- closing_cash  
- status  

**Operación:**  
UPDATE  

---

# 11. MÓDULO: TERMINALES  

## Pantalla: Crear terminal  

**Tabla:**  
- terminals  

**Campos:**  
- store_id  
- name  
- commission_percentage  

**Operación:**  
INSERT  

---

# 12. MÓDULO: REPORTES  

## Pantalla: Reporte de ventas  

**Tablas:**  
- sales  
- sale_items  
- products  

**Campos:**  
- sales.total  
- sales.sold_at  
- sale_items.quantity  
- products.name  

**Operación:**  
SELECT  

---

# 13. MÓDULO: CATÁLOGO ONLINE  

## Pantalla: Configuración  

**Tabla:**  
- catalog_settings  

**Campos:**  
- store_id  
- catalog_url  
- show_price  
- show_stock  

**Operación:**  
INSERT / UPDATE  

---

# 14. RESULTADO  

Este documento conecta la interfaz con la base de datos.  

Permite entender exactamente qué tablas utiliza cada módulo del sistema.  

Con este documento ya es posible:  

- diseñar frontend  
- crear endpoints API  
- generar lógica backend  
- implementar el sistema sin ambigüedad  