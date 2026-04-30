# POS Multi-Sucursal — Especificación Actualizada

## 1. ROLES DEL SISTEMA

### Admin
- Acceso total
- Control de costos
- Configuración global

### Gerente
- Acceso solo a su tienda
- Puede ver inventario global (sin costos)
- Puede ver reportes limitados

### Cajero
- No puede ver costos reales
- Puede:
  - Vender
  - Hacer corte de caja
  - Crear productos
- No accede a reportes financieros

---

## 2. CONFIGURACIÓN INICIAL

### Tiendas
Campos:
- name
- address
- phone
- email
- manager_id
- active

### Almacén
- Un almacén general
- No vende directamente

---

## 3. USUARIOS

Campos:
- name
- phone
- email
- address
- password (auto)
- role_id
- store_id

---

## 4. PRODUCTOS

Campos:
- name
- category_id
- barcode
- description
- cost (solo admin)
- active

Precios:
- price_1
- price_2
- price_3
- price_4
- price_5

Restricción:
- No se puede vender si cost = NULL

Mensaje para cajero:
"Este producto no está disponible para venta. Contacta al administrador."

---

## 5. INVENTARIO

Asignación:
- store_id
- warehouse_id

Control:
- stock manual (+ botón)
- movimientos

---

## 6. MÉTODOS DE PAGO POR PRODUCTO

- cash_enabled
- card_enabled

---

## 7. MÓDULO MANGA

Tabla: mangas

Campos:
- name
- volume_number
- editorial
- code
- genre
- public_price
- profit_margin_percent
- calculated_cost

Fórmula:
cost = public_price * (1 - profit_margin_percent/100)

---

## 8. TERMINALES DE PAGO

Tabla: terminals

Campos:
- name
- commission_percent
- store_id

Uso:
- afecta reportes

---

## 9. PREVENTAS

### Tabla: pre_sales

Campos:
- product_name
- price_1 ... price_5
- cost / margin
- advance_payment
- preorder_limit
- status (live, ready, expired, completed)
- pickup_deadline
- code

---

### Flujo

Fase 1:
- Crear preventa
- Cliente paga anticipo

Fase 2:
- Producto llega
- Se asigna stock
- Estado: ready

Fase 3:
- Cliente liquida
- Se convierte en venta

---

## 10. CONTROL INVENTARIO PREVENTA

Regla:

available_stock = total_stock - pre_sales_reserved

---

## 11. REPORTES

- ventas
- preventas
- métodos de pago
- comisiones
- por tienda

---

## 12. PERMISOS AVANZADOS

- control dinámico de visibilidad
- acceso temporal a costos

---

## 13. RESTRICCIONES CRÍTICAS

- No venta sin costo
- No acceso a costos para cajero
- No acceso global para gerente