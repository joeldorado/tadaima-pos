# DOCUMENTO 3
# DISEÑO TÉCNICO DEL SISTEMA
# POS MULTI-SUCURSAL

---

## OBJETIVO DEL DOCUMENTO

Definir cómo se implementará técnicamente el sistema POS a nivel de código, incluyendo arquitectura, estructura del backend, API, reglas de negocio, seguridad y flujo de datos.

Este documento sirve como guía directa para desarrollo.

---

## TECNOLOGÍAS PRINCIPALES

### Backend
- Laravel
- PHP 8.x
- API REST
- Laravel Sanctum (auth)

### Base de Datos
- MySQL 8+

### Frontend Web POS
- HTML5
- CSS3
- JavaScript
- Framework recomendado: React (preferido) o Vue

### App Administrativa
- React Native (Expo)

### Servidor
- Linux
- Nginx

### Control de versiones
- Git
- GitHub

---

## ARQUITECTURA GENERAL

Arquitectura de 3 capas:

### Capa 1 — Presentación
- POS Web (cajeros)
- App móvil (admin / gerente)

### Capa 2 — API (Laravel)
Responsable de:
- Autenticación
- Control de acceso
- Lógica de negocio
- Validaciones críticas
- Integraciones externas

### Capa 3 — Base de Datos
- Persistencia
- Relaciones
- Optimización de consultas

---

## ESTRUCTURA DEL BACKEND

Arquitectura modular por dominio.

### Módulos principales

- Auth
- Users
- Roles / Permissions
- Companies
- Stores
- Warehouses
- Products
- ProductPrices
- Inventory
- Sales
- PreSales
- Terminals
- Payments
- Customers
- Manga
- Reports
- Catalog
- Settings

---

### Estructura por módulo

Cada módulo tendrá:

- Controller
- Service (lógica de negocio)
- Model (Eloquent)
- Repository (opcional para queries complejas)

---

## ESTRUCTURA DE LA API

Base:
/api/v1/

---

### Auth
POST /login  
POST /logout  
GET /me  

---

### Usuarios
GET /users  
POST /users  

---

### Productos
GET /products  
POST /products  
PUT /products/{id}  

---

### Inventario
GET /inventory  
POST /inventory/movement  

---

### Ventas
POST /sales  
GET /sales/{id}  

---

### Preventas
POST /pre-sales  
GET /pre-sales  
POST /pre-sales/pay-advance  
POST /pre-sales/complete  

---

### Terminales
GET /terminals  
POST /terminals  

---

### Manga
GET /mangas  
POST /mangas  

---

### Clientes
GET /customers  
POST /customers  

---

## FLUJO DE VENTA (ACTUALIZADO)

1. Cajero inicia sesión
2. Se abre sesión de caja
3. Se agregan productos
4. Validación crítica:
   - SI producto no tiene costo → BLOQUEAR venta
5. Se selecciona cliente (Tadaima o manual)
6. Se calcula total
7. Se selecciona método de pago
8. Se selecciona terminal (si aplica)
9. Se registra venta
10. Se descuenta inventario
11. Se calcula comisión
12. Se registra pago
13. Se genera ticket

---

## REGLA CRÍTICA DE NEGOCIO

NO permitir venta si:

- cost IS NULL

Mensaje para cajero:

"Este producto no está disponible para venta. Consulta con el administrador."

---

## INVENTARIO

Sistema basado en movimientos.

Tabla clave:
inventory_movements

Tipos:
- entrada
- venta
- ajuste
- transferencia
- devolución

Regla:
El stock SIEMPRE se calcula desde movimientos.

---

## MANEJO DE CAJA

Flujo:

- abrir caja
- registrar ventas
- registrar movimientos
- cerrar caja

Tablas:
- cash_register_sessions
- cash_movements

---

## PREVENTAS (REDISEÑO)

Sistema independiente con estados:

- live
- ready
- expired
- completed

---

### FASE 1 — CREACIÓN

- Se crea preventa
- Se define:
  - precios (1–5)
  - costo / margen
  - límite de preventa

---

### FASE 2 — ANTICIPO

- Cliente paga anticipo
- Se genera folio
- Se incrementa reserved_quantity

---

### FASE 3 — INVENTARIO

- Producto llega
- Se asigna stock
- Estado → ready

---

### FASE 4 — ENTREGA

- Cliente liquida
- Se convierte en venta
- Estado → completed

---

### CONTROL DE STOCK

available_stock = stock - reserved_quantity

Regla:
- No vender si available_stock = 0

---

## MÓDULO MANGA

Entidad separada por lógica distinta.

Campos:
- public_price
- profit_margin_percent
- cost (calculado automáticamente)

Fórmula:

cost = public_price * (1 - margin/100)

---

## TERMINALES DE PAGO

Cada venta puede tener:

- terminal_id
- commission_percent
- commission_amount

Impacto:
- reportes financieros

---

## SEGURIDAD

### Autenticación
- Laravel Sanctum

### Protección
- Validación de inputs
- SQL Injection protection
- CSRF

---

## CONTROL DE ACCESO (CRÍTICO)

Roles:

### Admin
- Acceso total
- Ve costos

### Gerente
- Acceso solo a su tienda
- No ve costos

### Cajero
- No ve costos
- Puede vender
- Puede crear productos

---

### Control dinámico

Campo:
users.can_view_cost

Permite:
- habilitar acceso temporal

---

## REPORTES

- ventas
- preventas
- métodos de pago
- comisiones por terminal
- por tienda

---

## CATÁLOGO ONLINE

Configuración por tienda:

- mostrar precio
- mostrar stock
- productos visibles

Salida:
- integración con WhatsApp

---

## ESCALABILIDAD

Preparado para:

- múltiples sucursales
- múltiples almacenes
- nuevos módulos
- modo SaaS

---

## CONTROL DE VERSIONES

- main
- develop
- feature/*

---

## DESPLIEGUE

Pasos:

1. clonar repo
2. configurar .env
3. php artisan migrate
4. php artisan optimize
5. configurar nginx
6. SSL

---

## RESPALDOS

- backups diarios
- retención mínima 7 días

---

## MONITOREO

- logs Laravel
- system_logs
- logs servidor

---

## FUTURAS EXPANSIONES

- facturación SAT
- compras / proveedores
- devoluciones
- SaaS multiempresa
- integración hardware POS

---

## RESULTADO

El sistema queda completamente definido en:

Documento 1 — Funcional  
Documento 2 — Arquitectura / DB  
Documento 3 — Diseño Técnico  

Listo para desarrollo.