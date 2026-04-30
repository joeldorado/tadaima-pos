# LISTA DE TABLAS CON CAMPOS OPTIMIZADOS
# SISTEMA POS MULTI-SUCURSAL

---

## 1. EMPRESAS

**Tabla:** companies

Campos:

- id
- name
- legal_name
- rfc
- email
- phone
- website
- active
- created_at
- updated_at

---

## 2. SUCURSALES

**Tabla:** stores

Campos:

- id
- company_id
- name
- code
- address
- phone
- email
- active
- created_at
- updated_at

---

## 3. ALMACENES

**Tabla:** warehouses

Campos:

- id
- company_id
- name
- type (general / interno)
- description
- active
- created_at
- updated_at

---

## 4. RELACIÓN SUCURSAL - ALMACÉN

**Tabla:** store_warehouses

Campos:

- id
- store_id
- warehouse_id

---

# USUARIOS Y SEGURIDAD

## 5. USUARIOS

**Tabla:** users

Campos:

- id
- company_id
- store_id (nullable para admin)
- name
- phone
- email
- address
- password
- can_view_cost (boolean)
- active
- created_at
- updated_at

---

## 6. ROLES

**Tabla:** roles

Campos:

- id
- name (admin / gerente / cajero)
- description

---

## 7. RELACIÓN USUARIO - ROL

**Tabla:** user_roles

Campos:

- id
- user_id
- role_id

---

## 8. PERMISOS

**Tabla:** permissions

Campos:

- id
- name
- description

---

## 9. RELACIÓN ROL - PERMISO

**Tabla:** role_permissions

Campos:

- id
- role_id
- permission_id

---

# CLIENTES

## 10. CLIENTES

**Tabla:** customers

Campos:

- id
- external_member_id
- name
- phone
- email
- address
- notes
- created_at
- updated_at

---

# PRODUCTOS

## 11. CATEGORÍAS

**Tabla:** product_categories

Campos:

- id
- name
- description

---

## 12. PRODUCTOS

**Tabla:** products

Campos:

- id
- category_id
- name
- sku
- barcode
- description
- cost
- allow_sale_without_cost (boolean default false)
- active
- created_at
- updated_at

---

## 13. PRECIOS DE PRODUCTO

**Tabla:** product_prices

Campos:

- id
- product_id
- price_1
- price_2
- price_3
- price_4
- price_5

---

## 14. MÉTODOS DE PAGO POR PRODUCTO

**Tabla:** product_payment_methods

Campos:

- id
- product_id
- payment_method_id

---

## 15. IMÁGENES DE PRODUCTO

**Tabla:** product_images

Campos:

- id
- product_id
- image_path
- sort_order

---

# MÓDULO MANGA

## 16. MANGA

**Tabla:** mangas

Campos:

- id
- name
- volume_number
- editorial
- code
- genre
- public_price
- profit_margin_percentage
- calculated_cost
- active
- created_at
- updated_at

---

## 17. PRECIOS DE MANGA

**Tabla:** manga_prices

Campos:

- id
- manga_id
- price_1
- price_2
- price_3
- price_4
- price_5

---

# INVENTARIO

## 18. INVENTARIO

**Tabla:** inventory

Campos:

- id
- product_id (nullable)
- manga_id (nullable)
- warehouse_id
- quantity

---

## 19. MOVIMIENTOS DE INVENTARIO

**Tabla:** inventory_movements

Campos:

- id
- product_id
- manga_id
- warehouse_id
- type
- quantity
- reference
- reference_id
- created_at

Tipos:

- entrada
- venta
- ajuste
- transferencia
- preventa
- devolución

---

## 20. TRANSFERENCIAS

**Tabla:** inventory_transfers

Campos:

- id
- from_warehouse_id
- to_warehouse_id
- status
- created_at

---

## 21. ITEMS DE TRANSFERENCIA

**Tabla:** inventory_transfer_items

Campos:

- id
- transfer_id
- product_id
- manga_id
- quantity

---

# CAJA

## 22. CAJAS

**Tabla:** cash_registers

Campos:

- id
- store_id
- name
- active

---

## 23. SESIONES DE CAJA

**Tabla:** cash_register_sessions

Campos:

- id
- register_id
- user_id
- opened_at
- closed_at
- opening_cash
- closing_cash
- status

---

## 24. MOVIMIENTOS DE CAJA

**Tabla:** cash_movements

Campos:

- id
- register_session_id
- type
- amount
- description
- created_at

Tipos:

- entrada
- salida
- ajuste

---

# VENTAS

## 25. VENTAS

**Tabla:** sales

Campos:

- id
- store_id
- register_session_id
- user_id
- customer_id
- subtotal
- tax
- discount
- total
- terminal_id
- status
- sold_at

---

## 26. ITEMS DE VENTA

**Tabla:** sale_items

Campos:

- id
- sale_id
- product_id
- manga_id
- quantity
- price
- total

---

# PAGOS

## 27. MÉTODOS DE PAGO

**Tabla:** payment_methods

Campos:

- id
- name
- active

---

## 28. MÉTODOS POR TIENDA

**Tabla:** store_payment_methods

Campos:

- id
- store_id
- payment_method_id

---

## 29. PAGOS

**Tabla:** payments

Campos:

- id
- sale_id
- payment_method_id
- terminal_id
- amount
- commission_amount
- paid_at

---

## 30. TERMINALES

**Tabla:** terminals

Campos:

- id
- store_id
- name
- commission_percentage
- active

---

# PREVENTAS

## 31. PREVENTAS

**Tabla:** pre_sales

Campos:

- id
- store_id
- user_id
- customer_id
- status (live / ready / expired / completed)
- total
- advance_amount
- remaining_amount
- limit_quantity
- expires_at
- created_at

---

## 32. ITEMS DE PREVENTA

**Tabla:** pre_sale_items

Campos:

- id
- pre_sale_id
- product_id
- manga_id
- quantity
- price

---

## 33. PAGOS DE PREVENTA

**Tabla:** pre_sale_payments

Campos:

- id
- pre_sale_id
- amount
- paid_at

---

# CATÁLOGO ONLINE

## 34. CONFIGURACIÓN DE CATÁLOGO

**Tabla:** catalog_settings

Campos:

- id
- store_id
- catalog_url
- show_price
- show_stock

---

## 35. PRODUCTOS EN CATÁLOGO

**Tabla:** catalog_products

Campos:

- id
- product_id
- manga_id
- store_id
- visible
- sort_order

---

# CONFIGURACIÓN

## 36. CONFIGURACIÓN DEL SISTEMA

**Tabla:** system_settings

Campos:

- id
- company_id
- key
- value

---

## 37. LOGS DEL SISTEMA

**Tabla:** system_logs

Campos:

- id
- user_id
- action
- description
- created_at

---

# RESULTADO

Base de datos:

- modular
- escalable
- segura
- multi-sucursal
- preparada para preventas avanzadas
- con control estricto de costos

Lista para implementación en MySQL y Laravel.