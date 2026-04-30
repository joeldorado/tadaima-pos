# ARQUITECTURA DE CAJA PROFESIONAL (TIPO OXXO / WALMART)
# EXTENSIÓN DEL SISTEMA POS MULTI-SUCURSAL

---

## OBJETIVO

Definir el flujo profesional de caja para permitir:

- múltiples ventas simultáneas  
- suspender y recuperar ventas  
- velocidad tipo retail  
- base para modo offline futuro  
- mejor experiencia para cajero  

Este diseño se integra con la base de datos existente sin romper la arquitectura actual.

---

## CONCEPTO CLAVE

El sistema NO trabaja directamente sobre la tabla `sales`.

Se introduce una capa intermedia:

- ventas en proceso (drafts)

---

## NUEVAS TABLAS

---

## 1. SALES_DRAFTS

Tabla: sales_drafts  

Representa una venta en proceso.

Campos:

- id  
- store_id  
- register_session_id  
- user_id  
- customer_id (nullable)  
- status (open / suspended / completed / cancelled)  
- subtotal  
- tax  
- discount  
- total  
- notes  
- created_at  
- updated_at  

---

## 2. SALES_DRAFT_ITEMS

Tabla: sales_draft_items  

Productos dentro del draft.

Campos:

- id  
- draft_id  
- product_id (nullable)  
- manga_id (nullable)  
- quantity  
- price  
- total  

---

## ESTADOS DEL DRAFT

- open → venta activa en caja  
- suspended → venta pausada  
- completed → ya convertida a venta  
- cancelled → cancelada  

---

## FLUJO COMPLETO DE CAJA

---

### 1. APERTURA DE CAJA

Se crea:

- `cash_register_sessions`

---

### 2. CREACIÓN DE VENTA (DRAFT)

Al iniciar una venta:

- se crea un registro en `sales_drafts`
- status = open  

El cajero puede tener múltiples drafts activos (ej. 5)

---

### 3. AGREGAR PRODUCTOS

Cada producto se guarda en:

- `sales_draft_items`

No se afecta inventario aún.

---

### 4. ACCIONES DEL CAJERO

El cajero puede:

- agregar productos  
- eliminar productos  
- cambiar cantidades  
- cambiar precio (1–5)  
- asignar cliente  
- aplicar descuento  

---

### 5. SUSPENDER VENTA

Se cambia:

status = suspended  

La venta queda guardada.

---

### 6. RECUPERAR VENTA

Se consulta:

- drafts con status = suspended  

Se vuelve a:

status = open  

---

### 7. VALIDACIONES ANTES DE PAGAR

Antes de confirmar:

- verificar stock disponible  
- verificar costo definido  
- validar métodos de pago  

---

### 8. CONFIRMAR VENTA

Proceso:

1. Crear registro en `sales`
2. Copiar items a `sale_items`
3. Registrar pagos en `payments`
4. Registrar comisiones de terminal
5. Generar movimientos en inventario
6. Cambiar draft:

status = completed  

---

### 9. ACTUALIZACIÓN DE INVENTARIO

Se registran movimientos:

- tipo = venta  

En:

- `inventory_movements`

---

### 10. CIERRE DE CAJA

Se cierra:

- `cash_register_sessions`

---

## RELACIÓN CON PREVENTAS

Si la venta proviene de preventa:

- el draft puede incluir referencia a `pre_sales`
- al confirmar:

→ se liquida preventa  
→ se convierte en venta  

---

## CONTROL DE STOCK

El stock NO se descuenta en draft.

Solo se descuenta en:

- confirmación de venta  

---

## SOPORTE PARA PREVENTAS

Cuando hay preventas:

```text
stock_disponible = stock - preventas