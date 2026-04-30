# ESPECIFICACIÓN DE API
# POS MULTI-SUCURSAL

---

## BASE URL

/api/v1

---

# 1. AUTHENTICATION

## LOGIN
POST /auth/login

Descripción:  
Autentica un usuario en el sistema.

Body:

- email  
- password  

Response:

- token  
- user_id  
- name  
- role  
- store_id  
- can_view_cost  

---

## LOGOUT
POST /auth/logout  

Headers:

Authorization: Bearer token  

---

## CURRENT USER
GET /auth/me  

Response:

- user  
- role  
- store  
- permissions  

---

# 2. USERS

GET /users  
POST /users  
PUT /users/{id}  
DELETE /users/{id}  

Campos adicionales:

- phone  
- address  
- can_view_cost  

---

# 3. ROLES

GET /roles  
POST /roles  
PUT /roles/{id}  

---

# 4. STORES

GET /stores  
POST /stores  
PUT /stores/{id}  

---

# 5. WAREHOUSES

GET /warehouses  
POST /warehouses  
PUT /warehouses/{id}  

---

# 6. PRODUCTS

GET /products  
GET /products/{id}  
POST /products  
PUT /products/{id}  
DELETE /products/{id}  

Nuevos campos:

- price_1 a price_5  
- allow_sale_without_cost  

---

## PRODUCT SEARCH (POS)
GET /products/search  

Response optimizado:

- id  
- name  
- price_1 a price_5  
- stock  
- barcode  

---

# 7. MANGA (NUEVO)

GET /mangas  
POST /mangas  
PUT /mangas/{id}  

Campos:

- name  
- volume_number  
- public_price  
- profit_margin_percentage  
- calculated_cost  

---

# 8. INVENTORY

GET /inventory  

POST /inventory/movement  

Tipos:

- entrada  
- venta  
- ajuste  
- transferencia  
- preventa  
- devolución  

---

## TRANSFERENCIA

POST /inventory/transfer  

---

# 9. CUSTOMERS

GET /customers  
POST /customers  
PUT /customers/{id}  
GET /customers/{id}  

---

# 10. SALES DRAFTS (NUEVO - CORE POS)

## CREATE DRAFT
POST /sales-drafts  

## GET DRAFTS
GET /sales-drafts  

Query:

- status (open / suspended)  

---

## GET DRAFT
GET /sales-drafts/{id}  

---

## ADD ITEM
POST /sales-drafts/{id}/items  

---

## UPDATE ITEM
PUT /sales-drafts/{id}/items/{item_id}  

---

## REMOVE ITEM
DELETE /sales-drafts/{id}/items/{item_id}  

---

## SUSPEND DRAFT
PUT /sales-drafts/{id}/suspend  

---

## RESUME DRAFT
PUT /sales-drafts/{id}/resume  

---

## CANCEL DRAFT
PUT /sales-drafts/{id}/cancel  

---

## COMPLETE DRAFT (CONFIRM SALE)
POST /sales-drafts/{id}/checkout  

Resultado:

- crea sale  
- registra pagos  
- descuenta inventario  

---

# 11. SALES

GET /sales/{id}  
GET /sales  

---

# 12. PAYMENTS

GET /payment-methods  
POST /payment-methods  

---

# 13. TERMINALS (NUEVO)

GET /terminals  
POST /terminals  
PUT /terminals/{id}  

---

# 14. PRE SALES (AVANZADO)

POST /pre-sales  
GET /pre-sales  
GET /pre-sales/{id}  

---

## ADD PAYMENT
POST /pre-sales/{id}/payments  

---

## MARK READY
PUT /pre-sales/{id}/ready  

---

## COMPLETE (CONVERT TO SALE)
POST /pre-sales/{id}/complete  

---

## CANCEL
PUT /pre-sales/{id}/cancel  

---

# 15. CASH REGISTER

## OPEN
POST /cash/open  

## CLOSE
POST /cash/close  

## CURRENT SESSION
GET /cash/session  

---

# 16. REPORTS

GET /reports/sales  
GET /reports/products  
GET /reports/inventory  
GET /reports/cash  
GET /reports/commissions  

---

# 17. CATALOG ONLINE

GET /catalog/{store_id}  

PUT /catalog/settings/{store_id}  

---

# 18. TAXES (NUEVO)

GET /taxes  
POST /taxes  

---

# 19. DISCOUNTS (NUEVO)

GET /discounts  
POST /discounts  

---

# 20. PURCHASES (NUEVO)

GET /purchase-orders  
POST /purchase-orders  

---

# 21. RETURNS (NUEVO)

POST /sales/{id}/return  

---

# RESULTADO

Esta API permite operar completamente el sistema POS profesional.

Incluye:

- autenticación  
- usuarios y roles  
- productos y manga  
- inventario  
- clientes  
- ventas (draft + final)  
- preventas  
- caja  
- pagos y terminales  
- reportes  
- catálogo online  
- compras  
- devoluciones  

---

# TOTAL ENDPOINTS ESTIMADOS

Entre 70 y 90 endpoints.

---

# NIVEL DEL SISTEMA

Con esta API el sistema es:

- POS profesional tipo retail  
- escalable  
- modular  
- listo para app móvil  
- preparado para modo offline futuro  
