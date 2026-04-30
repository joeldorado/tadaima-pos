# DATABASE FINAL — POS Multi-Sucursal
## Schema de Produccion para Laravel 13 + MySQL 8+

> **Fuente de verdad:** Este documento se genera a partir de `system-final-architecture.md` v1.0.
> **Fecha:** 2026-04-09
> **Convencion general:**
> - Todos los IDs: `bigint unsigned` (PK autoincrement / FK)
> - Dinero: `decimal(10,2)`
> - Flags booleanos: `tinyint(1)` con DEFAULT 0 o 1
> - Soft deletes donde aplica: columna `deleted_at timestamp NULL`
> - Timestamps: `created_at` y `updated_at` en todas las tablas que los requieren
> - Foreign keys con `ON DELETE RESTRICT` salvo indicacion contraria

---

## INDICE DE TABLAS (orden de dependencia)

1. [companies](#1-companies)
2. [roles](#2-roles)
3. [permissions](#3-permissions)
4. [model_has_roles](#4-model_has_roles)
5. [model_has_permissions](#5-model_has_permissions)
6. [stores](#6-stores)
7. [users](#7-users)
8. [warehouses](#8-warehouses)
9. [product_categories](#9-product_categories)
10. [products](#10-products)
11. [product_prices](#11-product_prices)
12. [product_store_prices](#12-product_store_prices)
13. [product_payment_methods](#13-product_payment_methods)
14. [product_images](#14-product_images)
15. [mangas](#15-mangas)
16. [payment_methods](#16-payment_methods)
17. [store_payment_methods](#17-store_payment_methods)
18. [terminals](#18-terminals)
19. [cash_registers](#19-cash_registers)
20. [customers](#20-customers)
21. [customer_credit](#21-customer_credit)
22. [inventory](#22-inventory)
23. [inventory_movements](#23-inventory_movements)
24. [transfers](#24-transfers)
25. [transfer_items](#25-transfer_items)
26. [cash_register_sessions](#26-cash_register_sessions)
27. [cash_movements](#27-cash_movements)
28. [sales_drafts](#28-sales_drafts)
29. [sales_draft_items](#29-sales_draft_items)
30. [sales](#30-sales)
31. [sale_items](#31-sale_items)
32. [payments](#32-payments)
33. [pre_sales](#33-pre_sales)
34. [pre_sale_items](#34-pre_sale_items)
35. [pre_sale_payments](#35-pre_sale_payments)
36. [pre_sale_logs](#36-pre_sale_logs)
37. [catalog_settings](#37-catalog_settings)
38. [catalog_products](#38-catalog_products)
39. [system_settings](#39-system_settings)
40. [system_logs](#40-system_logs)

---

## 1. companies

**Descripcion:** Tabla raiz de la jerarquia multi-empresa. Toda entidad del sistema pertenece a una company.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `name` | `varchar(255)` | NOT NULL |
| `rfc` | `varchar(20)` | NULL |
| `address` | `varchar(500)` | NULL |
| `phone` | `varchar(30)` | NULL |
| `email` | `varchar(255)` | NULL |
| `logo_path` | `varchar(500)` | NULL |
| `active` | `tinyint(1)` | NOT NULL, DEFAULT 1 |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `hasMany(Store::class)`
- `hasMany(User::class)`
- `hasMany(Warehouse::class)`
- `hasMany(SystemSetting::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `active` |

### Notas de negocio

- Tabla agregada: no estaba en el doc base pero es requerida para escalar a modo SaaS multi-empresa.
- `active = 0` desactiva toda la operacion de la empresa sin eliminar registros.
- Sin soft delete: la desactivacion se maneja con el campo `active`.

---

## 2. roles

**Descripcion:** Roles del sistema gestionados por Spatie Laravel Permission (compatible con Sanctum). Valores fijos del negocio: `admin`, `gerente`, `cajero`.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `name` | `varchar(125)` | NOT NULL |
| `guard_name` | `varchar(125)` | NOT NULL, DEFAULT 'web' |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsToMany(Permission::class, 'role_has_permissions')`
- `morphedByMany(User::class, 'model', 'model_has_roles')`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| UNIQUE | `(name, guard_name)` |

### Notas de negocio

- Tabla estandar de Spatie Permission — no modificar estructura.
- Los tres roles de negocio (`admin`, `gerente`, `cajero`) se insertan via seeders, no via UI.
- `guard_name` siempre `'web'` en este sistema (Sanctum usa guard web).

---

## 3. permissions

**Descripcion:** Permisos granulares gestionados por Spatie Laravel Permission.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `name` | `varchar(125)` | NOT NULL |
| `guard_name` | `varchar(125)` | NOT NULL, DEFAULT 'web' |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsToMany(Role::class, 'role_has_permissions')`
- `morphedByMany(User::class, 'model', 'model_has_permissions')`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| UNIQUE | `(name, guard_name)` |

### Notas de negocio

- Tabla estandar de Spatie Permission — no modificar estructura.
- Ejemplos de permisos del negocio: `view-costs`, `manage-products`, `manage-users`, `view-reports`, `open-cash`, `manage-transfers`.

---

## 4. model_has_roles

**Descripcion:** Tabla pivot poliformica de Spatie Permission. Asigna roles a cualquier modelo (tipicamente User).

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `role_id` | `bigint unsigned` | NOT NULL, FK → roles.id ON DELETE CASCADE |
| `model_type` | `varchar(255)` | NOT NULL |
| `model_id` | `bigint unsigned` | NOT NULL |

### Relaciones Eloquent

- Pivot gestionado internamente por Spatie Permission.

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `(role_id, model_id, model_type)` |
| INDEX | `(model_id, model_type)` |
| INDEX | `role_id` |

### Notas de negocio

- Tabla estandar de Spatie Permission — no modificar estructura.
- No tiene `created_at` / `updated_at` — es pure pivot.
- `model_type` tipicamente `'App\Models\User'`.

---

## 5. model_has_permissions

**Descripcion:** Tabla pivot poliformica de Spatie Permission. Asigna permisos directos a modelos (sin pasar por rol).

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `permission_id` | `bigint unsigned` | NOT NULL, FK → permissions.id ON DELETE CASCADE |
| `model_type` | `varchar(255)` | NOT NULL |
| `model_id` | `bigint unsigned` | NOT NULL |

### Relaciones Eloquent

- Pivot gestionado internamente por Spatie Permission.

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `(permission_id, model_id, model_type)` |
| INDEX | `(model_id, model_type)` |
| INDEX | `permission_id` |

### Notas de negocio

- Tabla estandar de Spatie Permission — no modificar estructura.
- Usar con cuidado: preferir asignacion via roles, no via permisos directos, para simplificar la gestion.

---

## 6. stores

**Descripcion:** Sucursales fisicas del negocio. Cada tienda pertenece a una company y puede tener un gerente responsable.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `company_id` | `bigint unsigned` | NOT NULL, FK → companies.id ON DELETE RESTRICT |
| `manager_id` | `bigint unsigned` | NULL, FK → users.id ON DELETE SET NULL |
| `name` | `varchar(255)` | NOT NULL |
| `address` | `varchar(500)` | NULL |
| `phone` | `varchar(30)` | NULL |
| `email` | `varchar(255)` | NULL |
| `active` | `tinyint(1)` | NOT NULL, DEFAULT 1 |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |
| `deleted_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(Company::class)`
- `belongsTo(User::class, 'manager_id')`
- `hasMany(User::class)`
- `hasMany(Warehouse::class)`
- `hasMany(Terminal::class)`
- `hasMany(CashRegister::class)`
- `hasMany(Sale::class)`
- `hasMany(PreSale::class)`
- `belongsToMany(PaymentMethod::class, 'store_payment_methods')`
- `hasOne(CatalogSetting::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `company_id` |
| INDEX | `manager_id` |
| INDEX | `active` |
| INDEX | `deleted_at` |

### Notas de negocio

- Soft delete habilitado: una tienda eliminada conserva su historial de ventas.
- `manager_id` es nullable porque puede no tener gerente asignado al crearse.
- `active = 0` oculta la tienda del POS sin eliminarla.

---

## 7. users

**Descripcion:** Empleados y administradores del sistema. Un usuario pertenece a una empresa y opcionalmente a una tienda fija.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `company_id` | `bigint unsigned` | NOT NULL, FK → companies.id ON DELETE RESTRICT |
| `store_id` | `bigint unsigned` | NULL, FK → stores.id ON DELETE SET NULL |
| `name` | `varchar(255)` | NOT NULL |
| `email` | `varchar(255)` | NOT NULL |
| `phone` | `varchar(30)` | NULL |
| `address` | `varchar(500)` | NULL |
| `password` | `varchar(255)` | NOT NULL |
| `active` | `tinyint(1)` | NOT NULL, DEFAULT 1 |
| `can_view_cost` | `tinyint(1)` | NOT NULL, DEFAULT 0 |
| `remember_token` | `varchar(100)` | NULL |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |
| `deleted_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(Company::class)`
- `belongsTo(Store::class)`
- `hasMany(Sale::class)`
- `hasMany(InventoryMovement::class)`
- `hasMany(Transfer::class)`
- `hasMany(CashRegisterSession::class)`
- `hasMany(PreSale::class)`
- `hasMany(PreSaleLog::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| UNIQUE | `email` |
| INDEX | `company_id` |
| INDEX | `store_id` |
| INDEX | `active` |
| INDEX | `deleted_at` |

### Notas de negocio

- Soft delete habilitado: nunca eliminar usuarios, solo desactivar con `active = 0` o soft delete.
- `store_id = NULL` indica usuario Admin sin tienda fija (puede operar en todas).
- `can_view_cost = 0` oculta el campo `cost` de productos/mangas en las respuestas API para ese usuario.
- `email` debe ser unico a nivel sistema (no solo por company).

---

## 8. warehouses

**Descripcion:** Bodegas o almacenes de inventario. Pueden ser centrales (sin tienda) o de tienda (asignadas a una sucursal).

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `company_id` | `bigint unsigned` | NOT NULL, FK → companies.id ON DELETE RESTRICT |
| `store_id` | `bigint unsigned` | NULL, FK → stores.id ON DELETE SET NULL |
| `name` | `varchar(255)` | NOT NULL |
| `type` | `enum('central','store')` | NOT NULL, DEFAULT 'store' |
| `description` | `text` | NULL |
| `active` | `tinyint(1)` | NOT NULL, DEFAULT 1 |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |
| `deleted_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(Company::class)`
- `belongsTo(Store::class)`
- `hasMany(Inventory::class)`
- `hasMany(InventoryMovement::class)`
- `hasMany(Transfer::class, 'from_warehouse_id')`
- `hasMany(Transfer::class, 'to_warehouse_id')`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `company_id` |
| INDEX | `store_id` |
| INDEX | `type` |
| INDEX | `deleted_at` |

### Notas de negocio

- Soft delete habilitado.
- `type = 'central'` → `store_id` debe ser NULL (bodega central de la empresa).
- `type = 'store'` → `store_id` debe ser NOT NULL (bodega asociada a una tienda).
- El inventario NUNCA se referencia directamente a una tienda — siempre via warehouse.

---

## 9. product_categories

**Descripcion:** Categorias de productos para clasificacion y filtrado en el POS.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `name` | `varchar(255)` | NOT NULL |
| `description` | `text` | NULL |
| `active` | `tinyint(1)` | NOT NULL, DEFAULT 1 |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `hasMany(Product::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `active` |

### Notas de negocio

- Sin soft delete: las categorias se desactivan con `active = 0`.
- Tabla formalizada: el frontend la usaba pero no estaba en el doc base de DB.
- No tiene `company_id` — las categorias son globales al sistema (compartidas entre empresas en caso de expansion SaaS).

---

## 10. products

**Descripcion:** Productos genericos del catalogo. Entidad central del POS.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `category_id` | `bigint unsigned` | NULL, FK → product_categories.id ON DELETE SET NULL |
| `name` | `varchar(255)` | NOT NULL |
| `sku` | `varchar(100)` | NULL |
| `barcode` | `varchar(100)` | NULL |
| `description` | `text` | NULL |
| `cost` | `decimal(10,2)` | NULL |
| `active` | `tinyint(1)` | NOT NULL, DEFAULT 1 |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |
| `deleted_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(ProductCategory::class, 'category_id')`
- `hasOne(ProductPrice::class)`
- `hasMany(ProductStorePrice::class)`
- `hasOne(ProductPaymentMethod::class)`
- `hasMany(ProductImage::class)`
- `hasMany(Inventory::class)`
- `hasMany(InventoryMovement::class)`
- `hasMany(SaleItem::class)`
- `hasMany(SalesDraftItem::class)`
- `hasMany(PreSaleItem::class)`
- `hasMany(CatalogProduct::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `category_id` |
| UNIQUE | `sku` |
| UNIQUE | `barcode` |
| INDEX | `active` |
| INDEX | `deleted_at` |
| INDEX | `name` |

### Notas de negocio

- Soft delete habilitado.
- **REGLA CRITICA:** `cost IS NULL` → el producto esta BLOQUEADO para la venta. El backend debe validar esto antes de permitir agregar un producto a un draft o venta.
- `sku` y `barcode` tienen UNIQUE index pero son nullable (no todos los productos tienen ambos).
- Los precios NO van en esta tabla — van en `product_prices` (base) y `product_store_prices` (por tienda).

---

## 11. product_prices

**Descripcion:** Precios base del producto. Hasta 5 niveles de precio (price_1 es el precio publico, price_5 el de mayoreo).

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `product_id` | `bigint unsigned` | NOT NULL, FK → products.id ON DELETE CASCADE |
| `price_1` | `decimal(10,2)` | NULL |
| `price_2` | `decimal(10,2)` | NULL |
| `price_3` | `decimal(10,2)` | NULL |
| `price_4` | `decimal(10,2)` | NULL |
| `price_5` | `decimal(10,2)` | NULL |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(Product::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| UNIQUE | `product_id` |

### Notas de negocio

- Relacion 1:1 con products (un registro de precios por producto).
- `ON DELETE CASCADE`: si se elimina el producto (hard delete), sus precios se eliminan tambien.
- Los precios son NULL cuando ese nivel no aplica al producto.
- `price_1` = precio publico (el mas comun en el POS).
- Para precios diferenciados por tienda, usar `product_store_prices`.

---

## 12. product_store_prices

**Descripcion:** Precios de un producto especificos para una tienda. Sobreescribe el precio base de `product_prices` para esa tienda.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `product_id` | `bigint unsigned` | NOT NULL, FK → products.id ON DELETE CASCADE |
| `store_id` | `bigint unsigned` | NOT NULL, FK → stores.id ON DELETE CASCADE |
| `price_level` | `tinyint unsigned` | NOT NULL |
| `price` | `decimal(10,2)` | NOT NULL |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(Product::class)`
- `belongsTo(Store::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| UNIQUE | `(product_id, store_id, price_level)` |
| INDEX | `product_id` |
| INDEX | `store_id` |

### Notas de negocio

- `price_level` debe ser entre 1 y 5 — validar en el backend (CHECK constraint logico).
- Si no existe registro para (product_id, store_id, price_level), el backend usa el precio base de `product_prices`.
- `ON DELETE CASCADE` en ambas FK: si el producto o la tienda se eliminan, estos precios se limpian.
- Adoptado del frontend — mejora UX para cadenas con precios diferenciados por sucursal.

---

## 13. product_payment_methods

**Descripcion:** Configura si un producto especifico puede pagarse con efectivo o tarjeta.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `product_id` | `bigint unsigned` | NOT NULL, FK → products.id ON DELETE CASCADE |
| `allow_cash` | `tinyint(1)` | NOT NULL, DEFAULT 1 |
| `allow_card` | `tinyint(1)` | NOT NULL, DEFAULT 1 |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(Product::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| UNIQUE | `product_id` |

### Notas de negocio

- Relacion 1:1 con products.
- `ON DELETE CASCADE`: si el producto se elimina (hard delete), esta config se elimina.
- Util para productos que solo pueden pagarse en efectivo (e.g., ciertos servicios).

---

## 14. product_images

**Descripcion:** Imagenes de producto almacenadas en Google Cloud Storage.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `product_id` | `bigint unsigned` | NOT NULL, FK → products.id ON DELETE CASCADE |
| `image_path` | `varchar(500)` | NOT NULL |
| `sort_order` | `int unsigned` | NOT NULL, DEFAULT 0 |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(Product::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `product_id` |
| INDEX | `(product_id, sort_order)` |

### Notas de negocio

- `image_path` contiene la ruta relativa en GCS (no la URL completa — construir en el backend).
- `sort_order` controla el orden de aparicion; la imagen con `sort_order = 0` es la imagen principal.
- `ON DELETE CASCADE`: al eliminar el producto, se eliminan los registros; el backend debe tambien eliminar los archivos de GCS.

---

## 15. mangas

**Descripcion:** Entidad separada de products para mangas/comics. Tiene logica de costo calculado automaticamente basada en precio publico y margen de ganancia.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `name` | `varchar(255)` | NOT NULL |
| `volume_number` | `int unsigned` | NULL |
| `editorial` | `varchar(255)` | NULL |
| `code` | `varchar(100)` | NULL |
| `genre` | `varchar(100)` | NULL |
| `public_price` | `decimal(10,2)` | NOT NULL |
| `profit_margin_percent` | `decimal(5,2)` | NOT NULL |
| `cost` | `decimal(10,2)` | NOT NULL |
| `active` | `tinyint(1)` | NOT NULL, DEFAULT 1 |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |
| `deleted_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `hasMany(SaleItem::class)`
- `hasMany(SalesDraftItem::class)`
- `hasMany(PreSaleItem::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `code` |
| INDEX | `active` |
| INDEX | `deleted_at` |
| INDEX | `name` |

### Notas de negocio

- Soft delete habilitado.
- **FORMULA CRITICA:** `cost = public_price * (1 - profit_margin_percent / 100)`. Esta formula la ejecuta el backend en cada `INSERT` y `UPDATE`. El valor calculado se almacena en la columna `cost` para rendimiento en queries.
- `profit_margin_percent` almacena el porcentaje (e.g., `30.00` para 30%).
- `cost` se almacena (no es columna calculada de MySQL) para facilidad de reportes y compatibilidad con Eloquent.
- Entidad separada de `products` porque: (1) tiene logica de costo distinta, (2) campos especificos (editorial, tomo, codigo), (3) puede cargarse masivamente por colecciones.

---

## 16. payment_methods

**Descripcion:** Metodos de pago disponibles en el sistema. Valores iniciales: `efectivo`, `tarjeta`, `transferencia`.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `name` | `varchar(100)` | NOT NULL |
| `active` | `tinyint(1)` | NOT NULL, DEFAULT 1 |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsToMany(Store::class, 'store_payment_methods')`
- `hasMany(Payment::class)`
- `hasMany(PreSalePayment::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| UNIQUE | `name` |
| INDEX | `active` |

### Notas de negocio

- Los metodos de pago son globales al sistema.
- Que metodos acepta cada tienda se controla en `store_payment_methods`.
- Los 3 valores iniciales se insertan via seeders.

---

## 17. store_payment_methods

**Descripcion:** Pivot que define que metodos de pago acepta cada tienda.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `store_id` | `bigint unsigned` | NOT NULL, FK → stores.id ON DELETE CASCADE |
| `payment_method_id` | `bigint unsigned` | NOT NULL, FK → payment_methods.id ON DELETE CASCADE |
| `active` | `tinyint(1)` | NOT NULL, DEFAULT 1 |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(Store::class)`
- `belongsTo(PaymentMethod::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| UNIQUE | `(store_id, payment_method_id)` |
| INDEX | `store_id` |
| INDEX | `payment_method_id` |

### Notas de negocio

- `ON DELETE CASCADE` en ambas FK.
- `active = 0` desactiva temporalmente ese metodo en esa tienda sin eliminar el registro.
- Adoptado del frontend — necesario para operaciones multi-sucursal donde distintas tiendas aceptan distintos metodos.

---

## 18. terminals

**Descripcion:** Terminales de pago con tarjeta. Cada terminal tiene un porcentaje de comision que se aplica a los pagos con tarjeta.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `store_id` | `bigint unsigned` | NOT NULL, FK → stores.id ON DELETE RESTRICT |
| `name` | `varchar(255)` | NOT NULL |
| `commission_percent` | `decimal(5,2)` | NOT NULL, DEFAULT 0.00 |
| `active` | `tinyint(1)` | NOT NULL, DEFAULT 1 |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(Store::class)`
- `hasMany(Sale::class)`
- `hasMany(Payment::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `store_id` |
| INDEX | `active` |

### Notas de negocio

- `commission_percent` almacena el porcentaje (e.g., `3.50` para 3.5%).
- La comision se calcula y almacena al momento de la venta en `sales.commission_amount` y `payments.commission_amount`.
- `ON DELETE RESTRICT`: no se puede eliminar una tienda si tiene terminales activas.

---

## 19. cash_registers

**Descripcion:** Cajas registradoras fisicas de cada tienda.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `store_id` | `bigint unsigned` | NOT NULL, FK → stores.id ON DELETE RESTRICT |
| `name` | `varchar(255)` | NOT NULL |
| `active` | `tinyint(1)` | NOT NULL, DEFAULT 1 |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(Store::class)`
- `hasMany(CashRegisterSession::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `store_id` |
| INDEX | `active` |

### Notas de negocio

- `ON DELETE RESTRICT`: no se puede eliminar una tienda con cajas asociadas.
- `active = 0` desactiva la caja sin eliminar su historial de sesiones.

---

## 20. customers

**Descripcion:** Clientes registrados. Pueden tener saldo a favor (customer_credit) y estar asociados a preventas y ventas.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `external_member_id` | `varchar(100)` | NULL |
| `name` | `varchar(255)` | NOT NULL |
| `phone` | `varchar(30)` | NULL |
| `email` | `varchar(255)` | NULL |
| `address` | `varchar(500)` | NULL |
| `notes` | `text` | NULL |
| `loyalty_tier` | `varchar(50)` | NULL |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |
| `deleted_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `hasMany(CustomerCredit::class)`
- `hasMany(Sale::class)`
- `hasMany(PreSale::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `phone` |
| INDEX | `email` |
| INDEX | `external_member_id` |
| INDEX | `deleted_at` |

### Notas de negocio

- Soft delete habilitado: nunca eliminar clientes, preservar historial de compras.
- Sin `company_id`: los clientes son globales. Si se requiere aislamiento por empresa en futuro, agregar `company_id`.
- `external_member_id` para integracion con sistemas de membresia o fidelidad externos.
- `loyalty_tier` es un campo libre (varchar) para flexibilidad (e.g., 'Bronce', 'Plata', 'Oro').
- El saldo a favor total se calcula sumando `customer_credit.amount` donde el customer_id coincide.

---

## 21. customer_credit

**Descripcion:** Registro de saldos a favor del cliente. Cada registro es un credito individual con su razon. El saldo total es la suma de todos los registros activos.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `customer_id` | `bigint unsigned` | NOT NULL, FK → customers.id ON DELETE RESTRICT |
| `amount` | `decimal(10,2)` | NOT NULL |
| `reason` | `varchar(255)` | NOT NULL |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(Customer::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `customer_id` |

### Notas de negocio

- **`amount` DEBE SER POSITIVO para creditos y NEGATIVO para debitos/usos del saldo.** El backend valida esto. El saldo disponible es `SUM(amount)` por customer.
- `reason` documenta el origen: `'devolucion'`, `'preventa_cancelada'`, `'ajuste_manual'`, etc.
- `ON DELETE RESTRICT`: no se puede eliminar un cliente con creditos registrados.
- Formalizado del frontend — permite historial completo de movimientos de credito.

---

## 22. inventory

**Descripcion:** Stock actual de cada producto en cada bodega. Es la tabla maestra de existencias.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `product_id` | `bigint unsigned` | NOT NULL, FK → products.id ON DELETE RESTRICT |
| `warehouse_id` | `bigint unsigned` | NOT NULL, FK → warehouses.id ON DELETE RESTRICT |
| `quantity` | `decimal(10,2)` | NOT NULL, DEFAULT 0.00 |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(Product::class)`
- `belongsTo(Warehouse::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| UNIQUE | `(product_id, warehouse_id)` |
| INDEX | `product_id` |
| INDEX | `warehouse_id` |

### Notas de negocio

- UNIQUE en `(product_id, warehouse_id)`: un solo registro de stock por producto por bodega.
- `quantity` es `decimal` para soportar productos vendidos por fraccion (e.g., tela por metro).
- `quantity` puede ser negativa solo si el negocio permite ventas en negativo — por defecto no.
- **Sin `store_id`**: el stock se referencia SIEMPRE a una `warehouse`. La relacion tienda se obtiene via `warehouses.store_id` (ADR-006).
- Las mutaciones de stock se registran en `inventory_movements` para trazabilidad completa.
- `ON DELETE RESTRICT` en ambas FK: no eliminar productos o bodegas con inventario activo.

---

## 23. inventory_movements

**Descripcion:** Registro inmutable de todos los movimientos de inventario. Permite trazabilidad completa del stock.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `product_id` | `bigint unsigned` | NOT NULL, FK → products.id ON DELETE RESTRICT |
| `warehouse_id` | `bigint unsigned` | NOT NULL, FK → warehouses.id ON DELETE RESTRICT |
| `user_id` | `bigint unsigned` | NOT NULL, FK → users.id ON DELETE RESTRICT |
| `type` | `enum('entrada','venta','ajuste','transferencia','devolucion','preventa','preventa_cancelada')` | NOT NULL |
| `quantity` | `decimal(10,2)` | NOT NULL |
| `reference` | `varchar(255)` | NULL |
| `notes` | `text` | NULL |
| `created_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(Product::class)`
- `belongsTo(Warehouse::class)`
- `belongsTo(User::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `product_id` |
| INDEX | `warehouse_id` |
| INDEX | `user_id` |
| INDEX | `type` |
| INDEX | `created_at` |
| INDEX | `reference` |

### Notas de negocio

- **Sin `updated_at`**: los movimientos son inmutables — nunca se editan, solo se agregan nuevos.
- `quantity` es positiva para entradas y negativa para salidas (venta, transferencia saliente).
- Tipos de movimiento y su semantica:
  - `entrada`: recepcion de mercancia
  - `venta`: descuento por venta completada
  - `ajuste`: correccion de inventario (positivo o negativo)
  - `transferencia`: movimiento entre bodegas
  - `devolucion`: regreso de producto a inventario
  - `preventa`: reserva de stock para una preventa
  - `preventa_cancelada`: liberacion de stock reservado por cancelacion de preventa
- `reference` almacena el ID del documento relacionado (e.g., `sale_id`, `transfer_id`, `pre_sale_id`) como varchar para flexibilidad.

---

## 24. transfers

**Descripcion:** Transferencias de inventario entre bodegas. Puede estar pendiente, completada o cancelada.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `from_warehouse_id` | `bigint unsigned` | NOT NULL, FK → warehouses.id ON DELETE RESTRICT |
| `to_warehouse_id` | `bigint unsigned` | NOT NULL, FK → warehouses.id ON DELETE RESTRICT |
| `user_id` | `bigint unsigned` | NOT NULL, FK → users.id ON DELETE RESTRICT |
| `status` | `enum('pending','completed','cancelled')` | NOT NULL, DEFAULT 'pending' |
| `notes` | `text` | NULL |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(Warehouse::class, 'from_warehouse_id')`
- `belongsTo(Warehouse::class, 'to_warehouse_id')`
- `belongsTo(User::class)`
- `hasMany(TransferItem::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `from_warehouse_id` |
| INDEX | `to_warehouse_id` |
| INDEX | `user_id` |
| INDEX | `status` |

### Notas de negocio

- `from_warehouse_id` y `to_warehouse_id` deben ser diferentes — validar en backend.
- El movimiento de inventario real ocurre solo cuando `status` cambia a `completed`.
- Al completar: se generan 2 `inventory_movements` (salida de `from_warehouse`, entrada a `to_warehouse`) y se actualiza `inventory` en ambas bodegas.
- Al cancelar un transfer `pending`: no hay movimiento de inventario que revertir.
- Adoptado del frontend — el frontend ya tenia la pantalla implementada.

---

## 25. transfer_items

**Descripcion:** Productos incluidos en una transferencia, con su cantidad.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `transfer_id` | `bigint unsigned` | NOT NULL, FK → transfers.id ON DELETE CASCADE |
| `product_id` | `bigint unsigned` | NOT NULL, FK → products.id ON DELETE RESTRICT |
| `quantity` | `decimal(10,2)` | NOT NULL |
| `created_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(Transfer::class)`
- `belongsTo(Product::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `transfer_id` |
| INDEX | `product_id` |

### Notas de negocio

- `ON DELETE CASCADE` en `transfer_id`: si se cancela y elimina un transfer, sus items se eliminan.
- `ON DELETE RESTRICT` en `product_id`: no eliminar productos con transferencias históricas.
- `quantity` debe ser positivo — validar en backend.
- Sin `updated_at`: los items no se editan, se elimina el transfer y se crea uno nuevo si hay error.

---

## 26. cash_register_sessions

**Descripcion:** Sesiones de apertura y cierre de caja. Un usuario abre la caja al iniciar turno y la cierra al finalizar.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `register_id` | `bigint unsigned` | NOT NULL, FK → cash_registers.id ON DELETE RESTRICT |
| `user_id` | `bigint unsigned` | NOT NULL, FK → users.id ON DELETE RESTRICT |
| `status` | `enum('open','closed')` | NOT NULL, DEFAULT 'open' |
| `opening_cash` | `decimal(10,2)` | NOT NULL, DEFAULT 0.00 |
| `closing_cash` | `decimal(10,2)` | NULL |
| `opened_at` | `timestamp` | NOT NULL |
| `closed_at` | `timestamp` | NULL |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(CashRegister::class, 'register_id')`
- `belongsTo(User::class)`
- `hasMany(CashMovement::class)`
- `hasMany(Sale::class)`
- `hasMany(SalesDraft::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `register_id` |
| INDEX | `user_id` |
| INDEX | `status` |
| INDEX | `opened_at` |

### Notas de negocio

- Una sola sesion `open` puede existir por caja en un momento dado — validar en backend.
- `closing_cash` y `closed_at` son NULL mientras la sesion esta abierta.
- `opening_cash` es el efectivo declarado por el cajero al abrir (fondo de caja).
- `closing_cash` es el efectivo contado al cierre — puede diferir del calculado (diferencia es el faltante/sobrante).
- Las ventas y drafts se linkean a esta sesion para el reporte de corte de caja.

---

## 27. cash_movements

**Descripcion:** Movimientos manuales de efectivo en caja (entradas y salidas de caja que no son ventas).

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `register_session_id` | `bigint unsigned` | NOT NULL, FK → cash_register_sessions.id ON DELETE RESTRICT |
| `type` | `enum('entrada','salida','ajuste')` | NOT NULL |
| `amount` | `decimal(10,2)` | NOT NULL |
| `description` | `varchar(500)` | NOT NULL |
| `created_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(CashRegisterSession::class, 'register_session_id')`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `register_session_id` |
| INDEX | `type` |

### Notas de negocio

- Sin `updated_at`: los movimientos son inmutables.
- `amount` siempre positivo; el `type` determina la direccion del flujo.
- Ejemplos: retiro para pago de proveedor (`salida`), deposito de efectivo inicial (`entrada`), correccion de diferencia (`ajuste`).
- Solo aplica para movimientos manuales — las ventas en efectivo afectan la caja pero se registran en `payments`, no aqui.

---

## 28. sales_drafts

**Descripcion:** Ventas en borrador (carrito). Permite hasta 5 ventas simultaneas en el POS. Un draft pasa a `completed` cuando se confirma como venta.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `store_id` | `bigint unsigned` | NOT NULL, FK → stores.id ON DELETE RESTRICT |
| `register_session_id` | `bigint unsigned` | NOT NULL, FK → cash_register_sessions.id ON DELETE RESTRICT |
| `user_id` | `bigint unsigned` | NOT NULL, FK → users.id ON DELETE RESTRICT |
| `customer_id` | `bigint unsigned` | NULL, FK → customers.id ON DELETE SET NULL |
| `status` | `enum('open','suspended','completed','cancelled')` | NOT NULL, DEFAULT 'open' |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(Store::class)`
- `belongsTo(CashRegisterSession::class, 'register_session_id')`
- `belongsTo(User::class)`
- `belongsTo(Customer::class)`
- `hasMany(SalesDraftItem::class)`
- `hasOne(Sale::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `store_id` |
| INDEX | `register_session_id` |
| INDEX | `user_id` |
| INDEX | `customer_id` |
| INDEX | `status` |

### Notas de negocio

- Estados del draft:
  - `open`: en uso activo (hasta 5 por sesion)
  - `suspended`: pausado temporalmente para atender otro cliente
  - `completed`: convertido en venta via checkout
  - `cancelled`: descartado sin venta
- Un draft `completed` genera un registro en `sales`.
- Los items del draft se consolidan en `sale_items` al hacer checkout.
- El POS limita a 5 drafts `open` o `suspended` simultaneos — validar en backend.
- Agregado a la DB definitiva segun ADR-003.

---

## 29. sales_draft_items

**Descripcion:** Productos o mangas agregados a un draft de venta (carrito).

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `draft_id` | `bigint unsigned` | NOT NULL, FK → sales_drafts.id ON DELETE CASCADE |
| `product_id` | `bigint unsigned` | NULL, FK → products.id ON DELETE RESTRICT |
| `manga_id` | `bigint unsigned` | NULL, FK → mangas.id ON DELETE RESTRICT |
| `quantity` | `decimal(10,2)` | NOT NULL |
| `price` | `decimal(10,2)` | NOT NULL |
| `total` | `decimal(10,2)` | NOT NULL |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(SalesDraft::class, 'draft_id')`
- `belongsTo(Product::class)`
- `belongsTo(Manga::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `draft_id` |
| INDEX | `product_id` |
| INDEX | `manga_id` |

### Notas de negocio

- Exactamente uno de `product_id` o `manga_id` debe ser NOT NULL — validar en backend (CHECK constraint logico).
- `price` es el precio al que se agrego el item (capturado en el momento, puede ser cualquier nivel 1-5).
- `total = quantity * price` — calculado por el backend, almacenado para rendimiento.
- `ON DELETE CASCADE` en `draft_id`: al cancelar/eliminar un draft, sus items se eliminan.

---

## 30. sales

**Descripcion:** Ventas completadas. Registro definitivo e inmutable de la transaccion comercial.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `store_id` | `bigint unsigned` | NOT NULL, FK → stores.id ON DELETE RESTRICT |
| `register_session_id` | `bigint unsigned` | NOT NULL, FK → cash_register_sessions.id ON DELETE RESTRICT |
| `user_id` | `bigint unsigned` | NOT NULL, FK → users.id ON DELETE RESTRICT |
| `customer_id` | `bigint unsigned` | NULL, FK → customers.id ON DELETE SET NULL |
| `terminal_id` | `bigint unsigned` | NULL, FK → terminals.id ON DELETE SET NULL |
| `draft_id` | `bigint unsigned` | NULL, FK → sales_drafts.id ON DELETE SET NULL |
| `subtotal` | `decimal(10,2)` | NOT NULL |
| `discount` | `decimal(10,2)` | NOT NULL, DEFAULT 0.00 |
| `total` | `decimal(10,2)` | NOT NULL |
| `commission_amount` | `decimal(10,2)` | NOT NULL, DEFAULT 0.00 |
| `status` | `enum('completed','cancelled','returned')` | NOT NULL, DEFAULT 'completed' |
| `sold_at` | `timestamp` | NOT NULL |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(Store::class)`
- `belongsTo(CashRegisterSession::class, 'register_session_id')`
- `belongsTo(User::class)`
- `belongsTo(Customer::class)`
- `belongsTo(Terminal::class)`
- `belongsTo(SalesDraft::class, 'draft_id')`
- `hasMany(SaleItem::class)`
- `hasMany(Payment::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `store_id` |
| INDEX | `register_session_id` |
| INDEX | `user_id` |
| INDEX | `customer_id` |
| INDEX | `terminal_id` |
| INDEX | `draft_id` |
| INDEX | `status` |
| INDEX | `sold_at` |

### Notas de negocio

- Sin soft delete: las ventas nunca se eliminan. Se cancelan o se marcan como `returned`.
- `sold_at` es el timestamp de confirmacion del pago (puede diferir de `created_at` por latencia de red).
- `commission_amount` = suma de comisiones de todos los pagos con tarjeta de esta venta.
- `terminal_id` es NULL si la venta es solo en efectivo.
- `draft_id` es NULL si la venta se creo directamente (sin pasar por draft — caso legacy).
- Las devoluciones cambian `status` a `returned` y generan nuevos `inventory_movements` de tipo `devolucion`.

---

## 31. sale_items

**Descripcion:** Lineas de producto de una venta completada. Snapshot inmutable al momento de la venta.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `sale_id` | `bigint unsigned` | NOT NULL, FK → sales.id ON DELETE RESTRICT |
| `product_id` | `bigint unsigned` | NULL, FK → products.id ON DELETE SET NULL |
| `manga_id` | `bigint unsigned` | NULL, FK → mangas.id ON DELETE SET NULL |
| `quantity` | `decimal(10,2)` | NOT NULL |
| `price` | `decimal(10,2)` | NOT NULL |
| `total` | `decimal(10,2)` | NOT NULL |
| `created_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(Sale::class)`
- `belongsTo(Product::class)`
- `belongsTo(Manga::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `sale_id` |
| INDEX | `product_id` |
| INDEX | `manga_id` |

### Notas de negocio

- Exactamente uno de `product_id` o `manga_id` debe ser NOT NULL — validar en backend.
- `ON DELETE SET NULL` en `product_id` y `manga_id`: si el producto/manga se elimina, el item historico se preserva con FK null (el precio y total quedan como referencia historica).
- `ON DELETE RESTRICT` en `sale_id`: no eliminar ventas con items.
- `price` es el precio al que se vendio — snapshot del momento, no cambia si el precio base cambia.
- Sin `updated_at`: los items de venta son inmutables.

---

## 32. payments

**Descripcion:** Pagos realizados. Puede ser pago de una venta (`sale_id`) o pago anticipado de una preventa (`pre_sale_id`). Uno de los dos debe estar presente.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `sale_id` | `bigint unsigned` | NULL, FK → sales.id ON DELETE RESTRICT |
| `pre_sale_id` | `bigint unsigned` | NULL, FK → pre_sales.id ON DELETE RESTRICT |
| `payment_method_id` | `bigint unsigned` | NOT NULL, FK → payment_methods.id ON DELETE RESTRICT |
| `terminal_id` | `bigint unsigned` | NULL, FK → terminals.id ON DELETE SET NULL |
| `amount` | `decimal(10,2)` | NOT NULL |
| `commission_amount` | `decimal(10,2)` | NOT NULL, DEFAULT 0.00 |
| `created_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(Sale::class)`
- `belongsTo(PreSale::class)`
- `belongsTo(PaymentMethod::class)`
- `belongsTo(Terminal::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `sale_id` |
| INDEX | `pre_sale_id` |
| INDEX | `payment_method_id` |
| INDEX | `terminal_id` |

### Notas de negocio

- **REGLA CRITICA:** Exactamente uno de `sale_id` o `pre_sale_id` debe ser NOT NULL. El otro debe ser NULL. Validar en backend con regla de negocio. Comentar en migracion: `-- CHECK: (sale_id IS NOT NULL) XOR (pre_sale_id IS NOT NULL)`.
- `terminal_id` solo aplica cuando `payment_method_id` corresponde a `tarjeta`.
- `commission_amount` = `amount * terminal.commission_percent / 100`. Se calcula y almacena al momento del pago.
- Sin `updated_at`: los pagos son inmutables.
- Una venta puede tener multiples pagos (pago mixto: parte efectivo + parte tarjeta).

---

## 33. pre_sales

**Descripcion:** Preventas o preordenes. Permite reservar productos antes de que lleguen al inventario, con pago de anticipo.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `store_id` | `bigint unsigned` | NOT NULL, FK → stores.id ON DELETE RESTRICT |
| `user_id` | `bigint unsigned` | NOT NULL, FK → users.id ON DELETE RESTRICT |
| `customer_id` | `bigint unsigned` | NULL, FK → customers.id ON DELETE SET NULL |
| `code` | `varchar(50)` | NOT NULL |
| `product_name` | `varchar(255)` | NOT NULL |
| `advance_payment` | `decimal(10,2)` | NOT NULL, DEFAULT 0.00 |
| `preorder_limit` | `int unsigned` | NOT NULL, DEFAULT 0 |
| `reserved_quantity` | `int unsigned` | NOT NULL, DEFAULT 0 |
| `pickup_deadline` | `date` | NULL |
| `status` | `enum('live','ready','expired','completed','cancelled')` | NOT NULL, DEFAULT 'live' |
| `cost` | `decimal(10,2)` | NULL |
| `margin_percent` | `decimal(5,2)` | NULL |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(Store::class)`
- `belongsTo(User::class)`
- `belongsTo(Customer::class)`
- `hasMany(PreSaleItem::class)`
- `hasMany(PreSalePayment::class)`
- `hasMany(PreSaleLog::class)`
- `hasMany(Payment::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| UNIQUE | `code` |
| INDEX | `store_id` |
| INDEX | `user_id` |
| INDEX | `customer_id` |
| INDEX | `status` |
| INDEX | `pickup_deadline` |

### Notas de negocio

- `code` es un folio unico generado por el backend (e.g., `PRE-2026-00123`).
- **Estados del ciclo de vida (ADR-002):**
  - `live`: preventa activa, aceptando anticipos
  - `ready`: producto disponible, listo para entrega al cliente
  - `expired`: paso la fecha limite sin completarse
  - `completed`: entregado al cliente y convertido a venta
  - `cancelled`: cancelado; si hay anticipo pagado, se genera `customer_credit`
- `product_name` es texto libre (el producto puede no estar en el catalogo al crear la preventa).
- `advance_payment` es el monto de anticipo acordado (no el pagado — eso es la suma de `pre_sale_payments`).
- `cost` y `margin_percent` son opcionales para calcular rentabilidad de la preventa.
- Al completar (`completed`): se crea una `sale` y los `pre_sale_payments` se migran o se aplican como descuento.
- **El frontend usaba `pending/entregado/cancelado` — debe adaptarse a estos estados (ADR-002).**

---

## 34. pre_sale_items

**Descripcion:** Productos o mangas especificos asociados a una preventa.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `pre_sale_id` | `bigint unsigned` | NOT NULL, FK → pre_sales.id ON DELETE CASCADE |
| `product_id` | `bigint unsigned` | NULL, FK → products.id ON DELETE SET NULL |
| `manga_id` | `bigint unsigned` | NULL, FK → mangas.id ON DELETE SET NULL |
| `quantity` | `decimal(10,2)` | NOT NULL |
| `price_level` | `tinyint unsigned` | NOT NULL, DEFAULT 1 |
| `price` | `decimal(10,2)` | NOT NULL |
| `created_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(PreSale::class)`
- `belongsTo(Product::class)`
- `belongsTo(Manga::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `pre_sale_id` |
| INDEX | `product_id` |
| INDEX | `manga_id` |

### Notas de negocio

- `product_id` y `manga_id` son ambos nullable: una preventa puede ser de un producto no catalogado (solo `product_name` en `pre_sales`).
- `price_level` entre 1 y 5 — validar en backend.
- `price` es el precio acordado al momento de la preventa — snapshot.
- `ON DELETE CASCADE` en `pre_sale_id`: si se elimina la preventa, sus items se eliminan.

---

## 35. pre_sale_payments

**Descripcion:** Pagos de anticipo de una preventa. Separados de la tabla `payments` porque son anticipos previos al cierre como venta.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `pre_sale_id` | `bigint unsigned` | NOT NULL, FK → pre_sales.id ON DELETE RESTRICT |
| `payment_method_id` | `bigint unsigned` | NULL, FK → payment_methods.id ON DELETE SET NULL |
| `amount` | `decimal(10,2)` | NOT NULL |
| `notes` | `varchar(255)` | NULL |
| `created_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(PreSale::class)`
- `belongsTo(PaymentMethod::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `pre_sale_id` |
| INDEX | `payment_method_id` |

### Notas de negocio

- Tabla separada de `payments` para anticipos de preventa (antes de que se convierta en venta).
- `amount` debe ser positivo — validar en backend.
- `ON DELETE RESTRICT` en `pre_sale_id`: no eliminar preventa con pagos registrados (integridad financiera).
- `payment_method_id` es nullable: en casos de pago en especie o acuerdo informal puede no tener metodo.
- Al completar la preventa, estos anticipos se consideran en el calculo del saldo pendiente de la venta final.

---

## 36. pre_sale_logs

**Descripcion:** Historial de acciones realizadas sobre una preventa. Trazabilidad de cambios de estado y operaciones.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `pre_sale_id` | `bigint unsigned` | NOT NULL, FK → pre_sales.id ON DELETE CASCADE |
| `user_id` | `bigint unsigned` | NOT NULL, FK → users.id ON DELETE RESTRICT |
| `action` | `varchar(100)` | NOT NULL |
| `notes` | `text` | NULL |
| `created_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(PreSale::class)`
- `belongsTo(User::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `pre_sale_id` |
| INDEX | `user_id` |
| INDEX | `created_at` |

### Notas de negocio

- Sin `updated_at`: los logs son inmutables.
- `action` es texto libre que describe la operacion (e.g., `'status_change:live->ready'`, `'payment_added'`, `'cancelled'`).
- `ON DELETE CASCADE` en `pre_sale_id`: si la preventa se elimina (excepcional), sus logs se eliminan.
- Todo cambio de estado de una preventa debe generar un registro aqui.

---

## 37. catalog_settings

**Descripcion:** Configuracion del catalogo online publico de cada tienda.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `store_id` | `bigint unsigned` | NOT NULL, FK → stores.id ON DELETE CASCADE |
| `catalog_url` | `varchar(255)` | NULL |
| `show_price` | `tinyint(1)` | NOT NULL, DEFAULT 1 |
| `show_stock` | `tinyint(1)` | NOT NULL, DEFAULT 0 |
| `created_at` | `timestamp` | NULL |
| `updated_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(Store::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| UNIQUE | `store_id` |

### Notas de negocio

- Relacion 1:1 con stores (UNIQUE en `store_id`).
- `catalog_url` es la URL slug del catalogo publico (e.g., `'tienda-centro'`).
- `show_price = 0` oculta precios en el catalogo publico.
- `show_stock = 0` oculta disponibilidad en el catalogo publico.
- El endpoint `GET /catalog/{storeId}` es publico (sin auth) y respeta estas configuraciones.

---

## 38. catalog_products

**Descripcion:** Productos visibles en el catalogo online de una tienda. Pivot que controla visibilidad por tienda.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `product_id` | `bigint unsigned` | NOT NULL, FK → products.id ON DELETE CASCADE |
| `store_id` | `bigint unsigned` | NOT NULL, FK → stores.id ON DELETE CASCADE |
| `visible` | `tinyint(1)` | NOT NULL, DEFAULT 1 |
| `created_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(Product::class)`
- `belongsTo(Store::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| UNIQUE | `(product_id, store_id)` |
| INDEX | `product_id` |
| INDEX | `store_id` |
| INDEX | `visible` |

### Notas de negocio

- UNIQUE en `(product_id, store_id)`: un producto aparece una vez por tienda en el catalogo.
- `visible = 0` oculta el producto del catalogo sin quitarlo de la tabla.
- `ON DELETE CASCADE` en ambas FK: si el producto o tienda se eliminan, se limpia el catalogo.
- Sin `updated_at`: la visibilidad se controla con `visible`, no con timestamps.

---

## 39. system_settings

**Descripcion:** Configuraciones clave-valor por empresa. Permite configurar comportamientos del sistema sin codigo.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `company_id` | `bigint unsigned` | NOT NULL, FK → companies.id ON DELETE CASCADE |
| `key` | `varchar(100)` | NOT NULL |
| `value` | `text` | NULL |

### Relaciones Eloquent

- `belongsTo(Company::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| UNIQUE | `(company_id, key)` |
| INDEX | `company_id` |

### Notas de negocio

- Sin timestamps: las settings se actualizan directamente.
- UNIQUE en `(company_id, key)`: una sola configuracion por clave por empresa.
- Ejemplos de keys: `'max_draft_sales'`, `'default_price_level'`, `'tax_percent'`, `'currency'`.
- `value` es `text` para soportar valores complejos (JSON, textos largos).

---

## 40. system_logs

**Descripcion:** Registro de auditoría de acciones del sistema. Trazabilidad de operaciones criticas.

### Campos

| Campo | Tipo MySQL | Constraints |
|-------|-----------|-------------|
| `id` | `bigint unsigned` | PK, NOT NULL, AUTO_INCREMENT |
| `user_id` | `bigint unsigned` | NULL, FK → users.id ON DELETE SET NULL |
| `action` | `varchar(100)` | NOT NULL |
| `description` | `text` | NULL |
| `created_at` | `timestamp` | NULL |

### Relaciones Eloquent

- `belongsTo(User::class)`

### Indexes

| Tipo | Columnas |
|------|----------|
| PRIMARY | `id` |
| INDEX | `user_id` |
| INDEX | `action` |
| INDEX | `created_at` |

### Notas de negocio

- Sin `updated_at`: los logs son inmutables.
- `user_id` es nullable para acciones del sistema sin usuario (jobs, comandos artisan, etc.).
- `ON DELETE SET NULL` en `user_id`: si el usuario se elimina (hard delete), el log se preserva con user_id null.
- `action` es un codigo corto (e.g., `'login'`, `'sale.created'`, `'product.deleted'`, `'cash.closed'`).
- Esta tabla puede crecer rapidamente — considerar particionado por fecha o archivado periodico en produccion.

---

## RESUMEN DE TABLAS

| # | Tabla | PK Tipo | Soft Delete | Timestamps | FKs principales |
|---|-------|---------|-------------|------------|-----------------|
| 1 | companies | bigint unsigned | No | Si | — |
| 2 | roles | bigint unsigned | No | Si | — |
| 3 | permissions | bigint unsigned | No | Si | — |
| 4 | model_has_roles | PK compuesto | No | No | roles |
| 5 | model_has_permissions | PK compuesto | No | No | permissions |
| 6 | stores | bigint unsigned | **Si** | Si | companies, users |
| 7 | users | bigint unsigned | **Si** | Si | companies, stores |
| 8 | warehouses | bigint unsigned | **Si** | Si | companies, stores |
| 9 | product_categories | bigint unsigned | No | Si | — |
| 10 | products | bigint unsigned | **Si** | Si | product_categories |
| 11 | product_prices | bigint unsigned | No | Si | products |
| 12 | product_store_prices | bigint unsigned | No | Si | products, stores |
| 13 | product_payment_methods | bigint unsigned | No | Si | products |
| 14 | product_images | bigint unsigned | No | Si | products |
| 15 | mangas | bigint unsigned | **Si** | Si | — |
| 16 | payment_methods | bigint unsigned | No | Si | — |
| 17 | store_payment_methods | bigint unsigned | No | Si | stores, payment_methods |
| 18 | terminals | bigint unsigned | No | Si | stores |
| 19 | cash_registers | bigint unsigned | No | Si | stores |
| 20 | customers | bigint unsigned | **Si** | Si | — |
| 21 | customer_credit | bigint unsigned | No | Si | customers |
| 22 | inventory | bigint unsigned | No | Si | products, warehouses |
| 23 | inventory_movements | bigint unsigned | No | created_at only | products, warehouses, users |
| 24 | transfers | bigint unsigned | No | Si | warehouses (x2), users |
| 25 | transfer_items | bigint unsigned | No | created_at only | transfers, products |
| 26 | cash_register_sessions | bigint unsigned | No | Si | cash_registers, users |
| 27 | cash_movements | bigint unsigned | No | created_at only | cash_register_sessions |
| 28 | sales_drafts | bigint unsigned | No | Si | stores, cash_register_sessions, users, customers |
| 29 | sales_draft_items | bigint unsigned | No | Si | sales_drafts, products, mangas |
| 30 | sales | bigint unsigned | No | Si | stores, cash_register_sessions, users, customers, terminals, sales_drafts |
| 31 | sale_items | bigint unsigned | No | created_at only | sales, products, mangas |
| 32 | payments | bigint unsigned | No | created_at only | sales, pre_sales, payment_methods, terminals |
| 33 | pre_sales | bigint unsigned | No | Si | stores, users, customers |
| 34 | pre_sale_items | bigint unsigned | No | created_at only | pre_sales, products, mangas |
| 35 | pre_sale_payments | bigint unsigned | No | created_at only | pre_sales, payment_methods |
| 36 | pre_sale_logs | bigint unsigned | No | created_at only | pre_sales, users |
| 37 | catalog_settings | bigint unsigned | No | Si | stores |
| 38 | catalog_products | bigint unsigned | No | created_at only | products, stores |
| 39 | system_settings | bigint unsigned | No | No | companies |
| 40 | system_logs | bigint unsigned | No | created_at only | users |

**Total: 40 tablas** (37 del sistema + roles + permissions + model_has_roles + model_has_permissions como tablas independientes del framework)

---

## REGLAS DE NEGOCIO CRITICAS — RESUMEN

| Regla | Tabla afectada | Implementacion |
|-------|---------------|----------------|
| `cost IS NULL` bloquea venta | `products` | Validacion en backend antes de agregar a draft |
| `cost = public_price * (1 - margin/100)` | `mangas` | Calculo en backend en create/update |
| `(sale_id XOR pre_sale_id) IS NOT NULL` | `payments` | Validacion en backend; comentar CHECK en migracion |
| `customer_credit.amount` positivo para credito | `customer_credit` | Validacion en backend (negativo para debito) |
| `warehouse_id` siempre presente en inventario | `inventory`, `inventory_movements` | Sin `store_id` directo (ADR-006) |
| max 5 drafts simultaneos por sesion | `sales_drafts` | Validacion en backend |
| `transfer.from_warehouse_id != to_warehouse_id` | `transfers` | Validacion en backend |
| Un solo registro `open` por caja | `cash_register_sessions` | Validacion en backend |
| Pre-sale estados: `live→ready→completed` | `pre_sales` | State machine en backend |
| `pre_sale_payments.amount` positivo | `pre_sale_payments` | Validacion en backend |

---

## ORDEN DE MIGRACION RECOMENDADO

```
1.  companies
2.  roles                         (Spatie)
3.  permissions                   (Spatie)
4.  model_has_roles               (Spatie)
5.  model_has_permissions         (Spatie)
6.  stores                        (depende de companies)
7.  users                         (depende de companies, stores)
8.  warehouses                    (depende de companies, stores)
9.  product_categories
10. products                      (depende de product_categories)
11. product_prices                (depende de products)
12. product_store_prices          (depende de products, stores)
13. product_payment_methods       (depende de products)
14. product_images                (depende de products)
15. mangas
16. payment_methods
17. store_payment_methods         (depende de stores, payment_methods)
18. terminals                     (depende de stores)
19. cash_registers                (depende de stores)
20. customers
21. customer_credit               (depende de customers)
22. inventory                     (depende de products, warehouses)
23. inventory_movements           (depende de products, warehouses, users)
24. transfers                     (depende de warehouses, users)
25. transfer_items                (depende de transfers, products)
26. cash_register_sessions        (depende de cash_registers, users)
27. cash_movements                (depende de cash_register_sessions)
28. sales_drafts                  (depende de stores, cash_register_sessions, users, customers)
29. sales_draft_items             (depende de sales_drafts, products, mangas)
30. sales                         (depende de stores, cash_register_sessions, users, customers, terminals, sales_drafts)
31. sale_items                    (depende de sales, products, mangas)
32. pre_sales                     (depende de stores, users, customers)
33. pre_sale_items                (depende de pre_sales, products, mangas)
34. pre_sale_payments             (depende de pre_sales, payment_methods)
35. pre_sale_logs                 (depende de pre_sales, users)
36. payments                      (depende de sales, pre_sales, payment_methods, terminals)
37. catalog_settings              (depende de stores)
38. catalog_products              (depende de products, stores)
39. system_settings               (depende de companies)
40. system_logs                   (depende de users)
```

---

*Documento generado el 2026-04-09. Fuente: `system-final-architecture.md` v1.0.*
*Usar directamente para generar migraciones Laravel con `php artisan make:migration`.*
