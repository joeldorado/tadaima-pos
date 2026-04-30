# ARQUITECTURA TÉCNICA DEL SISTEMA
# SISTEMA PUNTO DE VENTA MULTI-SUCURSAL

---

## 1. OBJETIVO DEL DOCUMENTO

Este documento describe la arquitectura técnica del sistema de Punto de Venta (POS) que se desarrollará para la gestión de:

- ventas  
- inventario  
- preventas  
- catálogo online  
- reportes financieros  

El objetivo es definir de manera clara la estructura del sistema, los módulos principales, la organización de la base de datos y los roles de usuario, con el fin de facilitar el desarrollo, mantenimiento y escalabilidad futura.

Este documento está dirigido a:

- desarrolladores del sistema  
- administradores técnicos  
- integradores externos  
- futuros mantenimientos del software  

---

## 2. ARQUITECTURA GENERAL DEL SISTEMA

El sistema está diseñado con una arquitectura modular basada en:

- una API central que gestiona la lógica del negocio  
- una base de datos relacional optimizada para operaciones de punto de venta  

---

### COMPONENTES DEL SISTEMA

### POS Web
Interfaz utilizada por los cajeros para realizar ventas, registrar pagos y consultar productos.

### Panel Administrativo
Interfaz utilizada por administradores y gerentes para gestionar productos, inventario, usuarios, terminales, preventas y reportes.

### Aplicación Móvil Administrativa
Aplicación móvil destinada a administradores y gerentes para consulta operativa del negocio.

### API Backend
Servidor central que gestiona toda la lógica del sistema, incluyendo:

- ventas  
- inventario  
- caja  
- preventas  
- terminales  
- catálogo online  
- reportes  
- integraciones externas  

### Base de Datos
Sistema relacional que almacena toda la información del sistema.

### Integraciones Externas

- Tarjeta digital Tadaima  
- WhatsApp (catálogo y pedidos)  

---

## 3. MÓDULOS DEL SISTEMA

El sistema estará dividido en módulos independientes.

---

### 3.1 MÓDULO DE USUARIOS Y SEGURIDAD

Controla autenticación, roles y permisos.

Permite:

- crear usuarios  
- asignar roles  
- restringir acceso por tienda  
- controlar acceso a información financiera  
- controlar visibilidad de costos  

#### Roles del sistema

**Administrador**
- acceso total  
- control de costos  
- configuración global  

**Gerente**
- acceso solo a su tienda  
- no puede ver costos  

**Cajero**
- no puede ver costos  
- puede vender  
- puede crear productos  

#### Control adicional

- acceso dinámico a costos mediante campo configurable (`can_view_cost`)  
- restricción estricta de información sensible  

---

### 3.2 MÓDULO DE PRODUCTOS

Gestiona el catálogo maestro.

Permite:

- crear productos  
- editar productos  
- asignar categorías  
- registrar hasta 5 precios  
- registrar costo real (solo admin)  
- cargar imágenes  
- configurar métodos de pago por producto  

#### Restricción crítica

No se permite vender productos sin costo definido.

---

### 3.3 MÓDULO DE INVENTARIO

Controla el stock de productos.

Características:

- inventario por tienda y almacén  
- asignación manual de stock  
- control mediante movimientos  
- historial completo  
- alertas de bajo inventario  

El inventario se gestiona mediante movimientos para garantizar trazabilidad completa.

---

### 3.4 MÓDULO DE VENTAS Y CAJA

Gestiona operaciones de venta.

Incluye:

- apertura de caja  
- registro de ventas  
- selección de precios (1–5)  
- selección de métodos de pago  
- uso de terminales  
- aplicación de descuentos  
- cierre de caja  
- corte de caja  
- diferencias de efectivo  

Cada caja puede manejar múltiples ventas simultáneas.

---

### 3.5 MÓDULO DE TERMINALES DE PAGO

Permite:

- registrar terminales por tienda  
- definir porcentaje de comisión  
- asociar terminal a ventas  

Impacto:

- cálculo automático de comisiones  
- reportes financieros más precisos  

---

### 3.6 MÓDULO DE PREVENTAS (AVANZADO)

Sistema independiente con control completo.

#### Estados

- live  
- ready  
- expired  
- completed  

#### Flujo

**Creación**
- registro de preventa  
- precios (1–5)  
- límite de preventa  
- anticipo  

**Anticipo**
- pago parcial  
- generación de folio  

**Inventario**
- ingreso de producto  
- asignación de stock  
- estado → ready  

**Entrega**
- liquidación  
- conversión a venta  

#### Control clave

- stock disponible = stock - preventas  
- bloqueo de venta si no hay disponibilidad  

---

### 3.7 MÓDULO MANGA

Módulo especializado separado.

Campos específicos:

- precio público  
- porcentaje de ganancia  
- costo calculado automáticamente  

#### Fórmula
