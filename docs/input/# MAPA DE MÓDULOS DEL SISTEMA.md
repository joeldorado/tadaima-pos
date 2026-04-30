# MAPA DE MÓDULOS DEL SISTEMA
# POS MULTI-SUCURSAL

---

## OBJETIVO DEL DOCUMENTO

Definir todos los módulos del sistema POS, las pantallas que contiene cada módulo y cómo se conectan entre sí.

Este documento sirve como guía para:

- desarrollo del frontend  
- organización de navegación  
- definición de flujos del sistema  

---

## ESTRUCTURA GENERAL DEL SISTEMA

El sistema estará dividido en tres áreas principales:

- Área Operativa  
- Área Administrativa  
- Área de Configuración  

---

# ÁREA OPERATIVA

Uso diario del sistema por el cajero.

## Módulos:

- Caja POS  
- Ventas  
- Preventas  
- Clientes  
- Consulta rápida de productos  

---

## MÓDULO CAJA POS

Pantalla principal de ventas.

### Pantallas

- Caja principal  
- Búsqueda de productos  
- Carrito  
- Selección de cliente  
- Pago  
- Confirmación  
- Ticket  

### Funciones

- Agregar productos  
- Cambiar cantidades  
- Seleccionar precio (1–5)  
- Aplicar descuentos  
- Seleccionar cliente (Tadaima o manual)  
- Seleccionar método de pago  
- Seleccionar terminal  
- Confirmar venta  

### Características

- Hasta 5 ventas abiertas simultáneamente  
- Suspender ventas  
- Recuperar ventas  

### Restricción crítica

Si el producto no tiene costo:

- no se permite vender  
- mostrar mensaje:

"Este producto no está disponible para venta. Consulta con administrador."

---

## MÓDULO VENTAS

Consulta de ventas realizadas.

### Pantallas

- Listado  
- Detalle  
- Filtros  

### Funciones

- Buscar por fecha  
- Buscar por cliente  
- Ver productos  
- Ver pagos  
- Ver terminal utilizada  

---

## MÓDULO PREVENTAS (ACTUALIZADO)

Sistema completo de preventas.

### Pantallas

- Listado  
- Detalle  
- Crear preventa  
- Entrega de preventa  

---

### FASE 1 — CREACIÓN

Funciones:

- Crear preventa  
- Definir precios (1–5)  
- Definir anticipo  
- Definir límite de preventa  
- Asociar cliente  

Estado:

- live  

---

### FASE 2 — INVENTARIO DISPONIBLE

Funciones:

- Registrar llegada de producto  
- Asignar stock  
- Cambiar estado  

Estado:

- ready  

Control:

- stock disponible = stock - preventas  

---

### FASE 3 — ENTREGA

Funciones:

- Buscar por folio  
- Calcular restante  
- Convertir a venta  
- Agregar productos adicionales  

Estado final:

- completed  

---

### REGLAS

- Si preventas >= stock → no venta pública  
- Si expira → solo admin puede autorizar  

---

## MÓDULO CLIENTES

### Pantallas

- Listado  
- Crear  
- Editar  
- Detalle  

### Funciones

- Registrar cliente  
- Historial de compras  
- Historial de preventas  

### Integración

- ID externo (Tadaima)  

---

# ÁREA ADMINISTRATIVA

Gestión del sistema.

---

## MÓDULO PRODUCTOS

### Pantallas

- Listado  
- Crear  
- Editar  
- Detalle  

### Funciones

- Hasta 5 precios  
- Costo real (solo admin)  
- Métodos de pago permitidos  
- Activar/desactivar  

---

## MÓDULO MANGA (NUEVO)

Separado de productos.

### Pantallas

- Listado  
- Crear tomo  
- Agregar nuevo tomo (flujo rápido)  

### Campos

- Nombre  
- Número de tomo  
- Editorial  
- Código  
- Género  

### Lógica

- Precio público  
- Porcentaje de ganancia  
- Costo automático  

---

## MÓDULO INVENTARIO

### Pantallas

- Inventario por tienda  
- Movimientos  

### Funciones

- Entradas  
- Ajustes  
- Transferencias  
- Historial  

---

## MÓDULO SUCURSALES

### Pantallas

- Listado  
- Crear  
- Editar  

### Campos

- Nombre  
- Dirección  
- Teléfono  
- Estado  
- Configuración de pagos  

---

## MÓDULO TERMINALES (NUEVO)

### Pantallas

- Listado  
- Crear terminal  

### Campos

- Nombre  
- Comisión (%)  
- Tienda asignada  

---

## MÓDULO CAJA

### Pantallas

- Abrir caja  
- Cerrar caja  
- Historial  

### Funciones

- Movimientos  
- Corte de caja  

---

## MÓDULO MÉTODOS DE PAGO

### Pantallas

- Configuración  

### Funciones

- Activar/desactivar  
- Configurar por tienda  

---

## MÓDULO REPORTES

### Pantallas

- Ventas  
- Inventario  
- Preventas  
- Caja  
- Comisiones  

### Funciones

- Filtros  
- Exportación  

### Restricción

- costos visibles solo para admin  

---

## MÓDULO CATÁLOGO ONLINE

### Pantallas

- Configuración  
- Productos visibles  

### Funciones

- Mostrar precios  
- Mostrar stock  
- Ordenar productos  

---

## MÓDULO USUARIOS

### Pantallas

- Listado  
- Crear  
- Editar  

### Campos

- Nombre  
- Teléfono  
- Correo  
- Dirección  
- Rol  
- Tienda  
- Password autogenerado  

---

## MÓDULO ROLES Y PERMISOS

### Roles

- Admin  
- Gerente  
- Cajero  

### Funciones

- Control de accesos  
- Control de visibilidad de costos  

---

# ÁREA DE CONFIGURACIÓN

---

## MÓDULO CONFIGURACIÓN GENERAL

### Funciones

- Datos de empresa  
- Parámetros globales  
- Configuración del sistema  

---

# FLUJO GENERAL DEL SISTEMA

1. Login  
2. Selección de tienda  
3. Apertura de caja  
4. Venta / Preventa  