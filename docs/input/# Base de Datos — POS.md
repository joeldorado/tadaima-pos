# Base de Datos — POS Multi-Sucursal (Estructura Actualizada)

---

## 1. USERS

Tabla: users

- id
- company_id
- store_id
- name
- email
- phone
- address
- password
- active
- can_view_cost (boolean)
- created_at
- updated_at

---

## 2. STORES

Tabla: stores

- id
- company_id
- name
- address
- phone
- email
- manager_id
- active
- created_at
- updated_at

---

## 3. WAREHOUSES

Tabla: warehouses

- id
- company_id
- name
- type (central / store)
- description
- active
- created_at
- updated_at

---

## 4. PRODUCTS

Tabla: products

- id
- category_id
- name
- barcode
- description
- cost (solo admin)
- active
- created_at
- updated_at

---

## 5. PRODUCT_PRICES

Tabla: product_prices

- id
- product_id
- price_1
- price_2
- price_3
- price_4
- price_5
- created_at
- updated_at

---

## 6. PRODUCT_PAYMENT_METHODS

Tabla: product_payment_methods

- id
- product_id
- allow_cash (boolean)
- allow_card (boolean)
- created_at
- updated_at

---

## 7. PRODUCT_IMAGES

Tabla: product_images

- id
- product_id
- image_path
- sort_order
- created_at
- updated_at

---

## 8. INVENTORY

Tabla: inventory

- id
- product_id
- store_id (nullable)
- warehouse_id (nullable)
- quantity
- created_at
- updated_at

---

## 9. INVENTORY_MOVEMENTS

Tabla: inventory_movements

- id
- product_id
- warehouse_id
- store_id (nullable)
- type (entrada, venta, ajuste, transferencia, devolución)
- quantity
- reference
- created_at

---

## 10. TERMINALS

Tabla: terminals

- id
- store_id
- name
- commission_percent
- active
- created_at
- updated_at

---

## 11. SALES

Tabla: sales

- id
- store_id
- register_session_id
- user_id
- customer_id
- terminal_id (nullable)
- subtotal
- discount
- total
- commission_amount
- status
- sold_at
- created_at

---

## 12. SALE_ITEMS

Tabla: sale_items

- id
- sale_id
- product_id
- quantity
- price
- total
- created_at

---

## 13. PAYMENTS

Tabla: payments

- id
- sale_id
- payment_method_id
- amount
- created_at

---

## 14. PAYMENT_METHODS

Tabla: payment_methods

- id
- name (efectivo, tarjeta, etc)
- active

---

## 15. CASH_REGISTERS

Tabla: cash_registers

- id
- store_id
- name
- active

---

## 16. CASH_REGISTER_SESSIONS

Tabla: cash_register_sessions

- id
- register_id
- user_id
- opened_at
- closed_at
- opening_cash
- closing_cash
- status

---

## 17. CASH_MOVEMENTS

Tabla: cash_movements

- id
- register_session_id
- type (entrada, salida, ajuste)
- amount
- description
- created_at

---

## 18. CUSTOMERS

Tabla: customers

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

## 19. MANGAS

Tabla: mangas

- id
- name
- volume_number
- editorial
- code
- genre
- public_price
- profit_margin_percent
- cost (calculado)
- created_at
- updated_at

---

## 20. PRE_SALES

Tabla: pre_sales

- id
- product_name
- customer_id
- price_1
- price_2
- price_3
- price_4
- price_5
- cost
- margin_percent
- advance_payment
- preorder_limit
- reserved_quantity
- status (live, ready, expired, completed)
- pickup_deadline
- code
- created_at
- updated_at

---

## 21. PRE_SALE_ITEMS

Tabla: pre_sale_items

- id
- pre_sale_id
- product_id (nullable)
- quantity
- price
- created_at

---

## 22. PRE_SALE_LOGS

Tabla: pre_sale_logs

- id
- pre_sale_id
- action
- user_id
- created_at

---

## 23. CATALOG_SETTINGS

Tabla: catalog_settings

- id
- store_id
- catalog_url
- show_price
- show_stock
- created_at
- updated_at

---

## 24. CATALOG_PRODUCTS

Tabla: catalog_products

- id
- product_id
- store_id
- visible
- created_at

---

## 25. SYSTEM_SETTINGS

Tabla: system_settings

- id
- company_id
- key
- value

---

## 26. SYSTEM_LOGS

Tabla: system_logs

- id
- user_id
- action
- description
- created_at