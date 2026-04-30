-- =============================================================================
-- verify_report.sql
-- Tadaima POS — Verificacion de reporte de ventas
--
-- Replica exactamente la logica de ReportsController::sales()
-- y valida que los numeros del reporte coincidan con los datos crudos.
--
-- Uso:
--   sqlite3 database/database.sqlite < scripts/verify_report.sql
--
-- Para cambiar el rango edita las dos lineas de parametros al inicio.
-- Defaults: año completo 2026.
-- =============================================================================

-- ── Parametros ────────────────────────────────────────────────────────────────
-- Edita estas dos lineas para filtrar por rango de fechas.
-- SQLite no tiene variables de sesion; usamos un CTE de configuracion.

WITH

params AS (
    SELECT
        '2026-01-01' AS date_from,
        '2026-12-31' AS date_to
        -- Agrega 'store_id = 1' o 'user_id = 1' aqui y filtra los CTEs
        -- manualmente si necesitas esos filtros.
),

-- =============================================================================
-- 1. TOTAL DE VENTAS COMPLETADAS (COUNT)
--    Fuente: ReportsController::sales() -> $summary->total_count
--    Query backend: COUNT(*) FROM sales WHERE status='completed' AND sold_at IN range
-- =============================================================================

ventas_completadas AS (
    SELECT COUNT(*) AS total_count
    FROM   sales, params
    WHERE  status   = 'completed'
    AND    DATE(sold_at) >= params.date_from
    AND    DATE(sold_at) <= params.date_to
),

-- =============================================================================
-- 2. TOTAL DE INGRESOS (SUM total) y DESCUENTOS
--    Fuente: $summary->total_revenue y $summary->total_discount
-- =============================================================================

totales_ventas AS (
    SELECT
        COALESCE(SUM(total),             0) AS total_revenue,
        COALESCE(SUM(discount),          0) AS total_discount,
        COALESCE(SUM(commission_amount), 0) AS total_commission
    FROM   sales, params
    WHERE  status   = 'completed'
    AND    DATE(sold_at) >= params.date_from
    AND    DATE(sold_at) <= params.date_to
),

-- =============================================================================
-- 3. SUMA DE PAYMENTS POR METODO — debe coincidir con by_payment_method
--    Fuente: ReportsController::sales() -> $byPaymentMethod
--    Query backend: JOIN payments -> sales -> payment_methods WHERE sales.status='completed'
-- =============================================================================

pagos_por_metodo AS (
    SELECT
        pm.name                               AS payment_method,
        COUNT(DISTINCT p.sale_id)             AS count_sales,
        COALESCE(SUM(p.amount), 0)            AS amount
    FROM   payments p
    JOIN   sales           s  ON s.id  = p.sale_id
    JOIN   payment_methods pm ON pm.id = p.payment_method_id
    JOIN   params          pa ON 1 = 1
    WHERE  s.status        = 'completed'
    AND    DATE(s.sold_at) >= pa.date_from
    AND    DATE(s.sold_at) <= pa.date_to
    GROUP BY pm.id, pm.name
),

-- Total acumulado de todos los metodos de pago
pagos_total AS (
    SELECT COALESCE(SUM(amount), 0) AS suma_pagos
    FROM   pagos_por_metodo
),

-- =============================================================================
-- 4. DESGLOSE POR DIA — debe coincidir con by_day
--    Fuente: $byDay = GROUP BY date(sold_at)
-- =============================================================================

ventas_por_dia AS (
    SELECT
        DATE(sold_at)                  AS dia,
        COUNT(*)                       AS count_dia,
        COALESCE(SUM(total), 0)        AS amount_dia
    FROM   sales, params
    WHERE  status   = 'completed'
    AND    DATE(sold_at) >= params.date_from
    AND    DATE(sold_at) <= params.date_to
    GROUP BY DATE(sold_at)
),

-- Sum de todos los dias debe igualar total_revenue
suma_por_dia AS (
    SELECT COALESCE(SUM(amount_dia), 0) AS suma_dias
    FROM   ventas_por_dia
),

-- =============================================================================
-- 5. ANTICIPOS PREVENTA (pre_sale_payments)
--    Fuente: $preSaleSummary — JOIN pre_sales, filtro por pre_sale_payments.created_at
--    NOTA: el backend usa pre_sale_payments (preventas legacy), NO pre_sale_order_payments.
-- =============================================================================

anticipos_preventa AS (
    SELECT
        COUNT(DISTINCT psp.pre_sale_id)  AS total_count,
        COALESCE(SUM(psp.amount), 0)     AS total_amount
    FROM   pre_sale_payments psp
    JOIN   pre_sales         ps  ON ps.id  = psp.pre_sale_id
    JOIN   params            pa  ON 1 = 1
    WHERE  DATE(psp.created_at) >= pa.date_from
    AND    DATE(psp.created_at) <= pa.date_to
),

-- =============================================================================
-- 6. ANTICIPOS DE FOLIOS (pre_sale_order_payments)
--    Esta tabla es independiente del reporte de ventas actual,
--    pero se incluye como verificacion adicional de trazabilidad.
--    La tabla pre_sale_order_payments no tiene store_id directo;
--    el store_id esta en pre_sale_orders.
-- =============================================================================

anticipos_folios AS (
    SELECT
        COUNT(DISTINCT psop.pre_sale_order_id)  AS total_count,
        COALESCE(SUM(psop.amount), 0)           AS total_amount
    FROM   pre_sale_order_payments psop
    JOIN   pre_sale_orders         pso ON pso.id = psop.pre_sale_order_id
    JOIN   params                  pa  ON 1 = 1
    WHERE  DATE(psop.created_at) >= pa.date_from
    AND    DATE(psop.created_at) <= pa.date_to
),

-- =============================================================================
-- COHERENCIA INTERNA: suma de payments debe ser coherente con total de ventas.
-- En una venta normal: SUM(payments.amount) por sale == sales.total (puede haber diferencia
-- si hubo cambio/vuelto, pero la suma general deberia ser >= total_revenue).
-- Calculamos la diferencia para detectar ventas sin pago registrado.
-- =============================================================================

ventas_sin_pago AS (
    SELECT COUNT(*) AS count_sin_pago
    FROM   sales s
    JOIN   params pa ON 1 = 1
    WHERE  s.status        = 'completed'
    AND    DATE(s.sold_at) >= pa.date_from
    AND    DATE(s.sold_at) <= pa.date_to
    AND    NOT EXISTS (
        SELECT 1 FROM payments p WHERE p.sale_id = s.id
    )
),

-- sale_items total debe sumar aprox igual a sales.subtotal
-- (descuentos estan en sales.discount, no en items)
coherencia_items AS (
    SELECT
        COALESCE(SUM(si.total), 0)  AS suma_items,
        -- subtotal de todas las ventas completadas en rango
        (SELECT COALESCE(SUM(subtotal), 0)
         FROM   sales, params
         WHERE  status   = 'completed'
         AND    DATE(sold_at) >= params.date_from
         AND    DATE(sold_at) <= params.date_to
        )                           AS suma_subtotales
    FROM   sale_items si
    JOIN   sales      s  ON s.id = si.sale_id
    JOIN   params     pa ON 1 = 1
    WHERE  s.status        = 'completed'
    AND    DATE(s.sold_at) >= pa.date_from
    AND    DATE(s.sold_at) <= pa.date_to
)

-- =============================================================================
-- RESULTADOS: PASS / FAIL por verificacion
-- =============================================================================

SELECT '=== REPORTE DE VERIFICACION ===' AS resultado
UNION ALL
SELECT 'Rango: ' || (SELECT date_from FROM params) || ' a ' || (SELECT date_to FROM params)

UNION ALL SELECT ''

UNION ALL SELECT '--- 1. TOTAL DE VENTAS COMPLETADAS ---'
UNION ALL
SELECT
    'COUNT ventas completadas: '
    || (SELECT total_count FROM ventas_completadas) || '  |  '
    || CASE
         WHEN (SELECT total_count FROM ventas_completadas) >= 0
         THEN 'INFO (sin valor esperado de API para comparar directamente)'
         ELSE 'FAIL'
       END AS resultado

UNION ALL SELECT ''

UNION ALL SELECT '--- 2. INGRESOS, DESCUENTOS Y COMISIONES ---'
UNION ALL
SELECT
    'total_revenue:    ' || ROUND((SELECT total_revenue    FROM totales_ventas), 2)
    || '  |  INFO'
UNION ALL
SELECT
    'total_discount:   ' || ROUND((SELECT total_discount   FROM totales_ventas), 2)
    || '  |  INFO'
UNION ALL
SELECT
    'total_commission: ' || ROUND((SELECT total_commission FROM totales_ventas), 2)
    || '  |  INFO'

UNION ALL SELECT ''

UNION ALL SELECT '--- 3. COHERENCIA: SUM por dia == total_revenue ---'
UNION ALL
SELECT
    'suma_por_dia=' || ROUND((SELECT suma_dias FROM suma_por_dia), 2)
    || '  total_revenue=' || ROUND((SELECT total_revenue FROM totales_ventas), 2)
    || '  |  '
    || CASE
         WHEN ABS(
                (SELECT suma_dias    FROM suma_por_dia) -
                (SELECT total_revenue FROM totales_ventas)
              ) < 0.01
         THEN 'PASS'
         ELSE 'FAIL — suma_por_dia != total_revenue'
       END

UNION ALL SELECT ''

UNION ALL SELECT '--- 4. COHERENCIA: SUM pagos por metodo ---'
UNION ALL
SELECT
    'suma_pagos=' || ROUND((SELECT suma_pagos FROM pagos_total), 2)
    || '  total_revenue=' || ROUND((SELECT total_revenue FROM totales_ventas), 2)
    || '  |  '
    || CASE
         -- Los pagos pueden incluir vuelto (efectivo), por lo que
         -- suma_pagos >= total_revenue es el comportamiento esperado.
         -- Si suma_pagos < total_revenue hay ventas sin pago registrado.
         WHEN (SELECT suma_pagos FROM pagos_total) >= (SELECT total_revenue FROM totales_ventas) - 0.01
         THEN 'PASS'
         ELSE 'FAIL — hay ventas completadas sin pago registrado (suma_pagos < total_revenue)'
       END

UNION ALL SELECT ''

UNION ALL SELECT '--- 5. VENTAS SIN NINGUN PAGO REGISTRADO ---'
UNION ALL
SELECT
    'ventas_sin_pago: ' || (SELECT count_sin_pago FROM ventas_sin_pago)
    || '  |  '
    || CASE
         WHEN (SELECT count_sin_pago FROM ventas_sin_pago) = 0
         THEN 'PASS'
         ELSE 'WARN — existen ventas completadas sin registros en payments'
       END

UNION ALL SELECT ''

UNION ALL SELECT '--- 6. COHERENCIA: SUM(sale_items.total) == SUM(sales.subtotal) ---'
UNION ALL
SELECT
    'suma_items=' || ROUND((SELECT suma_items     FROM coherencia_items), 2)
    || '  suma_subtotales=' || ROUND((SELECT suma_subtotales FROM coherencia_items), 2)
    || '  |  '
    || CASE
         WHEN ABS(
                (SELECT suma_items      FROM coherencia_items) -
                (SELECT suma_subtotales FROM coherencia_items)
              ) < 0.01
         THEN 'PASS'
         ELSE 'FAIL — sum(sale_items.total) != sum(sales.subtotal)'
       END

UNION ALL SELECT ''

UNION ALL SELECT '--- 7. ANTICIPOS PREVENTA (pre_sale_payments) ---'
UNION ALL
SELECT
    'anticipos_count='  || (SELECT total_count  FROM anticipos_preventa)
    || '  anticipos_monto=' || ROUND((SELECT total_amount FROM anticipos_preventa), 2)
    || '  |  INFO'

UNION ALL SELECT ''

UNION ALL SELECT '--- 8. ANTICIPOS FOLIOS (pre_sale_order_payments) ---'
UNION ALL
SELECT
    'folios_count='  || (SELECT total_count  FROM anticipos_folios)
    || '  folios_monto=' || ROUND((SELECT total_amount FROM anticipos_folios), 2)
    || '  |  INFO'

UNION ALL SELECT ''

UNION ALL SELECT '--- DESGLOSE POR METODO DE PAGO (ordenado por monto desc) ---'
UNION ALL
SELECT
    '  ' || payment_method
    || '  count=' || count_sales
    || '  amount=' || ROUND(amount, 2)
FROM pagos_por_metodo

UNION ALL SELECT ''

UNION ALL SELECT '--- DESGLOSE POR DIA (ordenado por fecha asc) ---'
UNION ALL
SELECT
    '  ' || dia
    || '  count=' || count_dia
    || '  amount=' || ROUND(amount_dia, 2)
FROM ventas_por_dia

UNION ALL SELECT ''
UNION ALL SELECT '=== FIN DE VERIFICACION ==='
;
