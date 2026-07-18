# PENDIENTE (decisión del dueño) — Tarjeta de "efectivo disponible − insumos" en Reportes

> Estado: **abierto**. Requiere pauta del dueño del software antes de implementar.
> Fecha: 2026-07 · Área: `landing/src/pages/ReportsPage.tsx` (Reporte de Ventas).

## Qué se pidió
En el Reporte de Ventas se quiere una tarjeta con **un número que represente el
efectivo con el que se cuenta ese día (o rango) menos los insumos** — es decir,
"cuánto efectivo queda realmente después de los gastos de insumos".

## Por qué quedó pendiente
El número tiene **varios matices** que necesitan definición de negocio:

1. **¿Qué es "lo que se tiene en efectivo ese día"?**
   - ¿El **efectivo cobrado** en el periodo (`paymentBreakdown.cash`, lo que ya
     mostramos como "Pago en efectivo")?
   - ¿O el **efectivo disponible en el cajón** = apertura + ventas en efectivo −
     salidas (que es el `expected_cash` del **Corte**, no del reporte de ventas)?
   Son cosas distintas: una es *ingreso*, la otra es *saldo de caja*.

2. **Doble conteo con el corte.** Los insumos con origen **`caja`** YA se
   descuentan del corte (crean una `cash_movements salida`). Si además los
   restamos aquí, dependería de cuál de los dos números de arriba usemos para no
   contar doble.

3. **¿Por día o por rango?** Si el rango abarca varios días/cortes, "el efectivo
   que se tiene" cambia por día; habría que definir si es un acumulado o el saldo
   final.

## Lo que YA existe (referencia para cuando se decida)
- **"Pago en efectivo"** (tarjeta KPI arriba) = `paymentBreakdown.cash`. Su
  subtítulo ya muestra `− insumos de caja $X = $Y`.
- **Sección "Egresos — Insumos de operación"**: total + desglose por origen
  (caja / caja_chica / propio) con quién registró cada compra y la tienda.
- `cajaInsumosTotal` (solo insumos de origen `caja`) ya está calculado en
  `ReportsPage.tsx` y sería el candidato a restar del efectivo.

## Decisión requerida
Definir con el dueño: (a) qué "efectivo" usar (cobrado vs saldo de caja), (b) si
es por día o por rango, y (c) dónde va la tarjeta. Con eso se implementa sin
riesgo de descuadre.
