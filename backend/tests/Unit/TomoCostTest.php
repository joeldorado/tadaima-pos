<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\TomoCost;
use PHPUnit\Framework\TestCase;

/**
 * Regla del costo de tomos (Joel 2026-10-03): costo = precio A × 0.70
 * (margen 30%). Ejemplo del equipo: Tomo 19 MHA, precio A 159 → costo 111.30.
 */
class TomoCostTest extends TestCase
{
    public function test_costo_desde_precio_con_el_margen_default(): void
    {
        $this->assertSame(111.30, TomoCost::desdePrecio(159.0));
        $this->assertSame(125.30, TomoCost::desdePrecio(179.0));
        $this->assertSame(111.65, TomoCost::desdePrecio(159.50));
    }

    public function test_costo_desde_precio_con_otro_margen(): void
    {
        $this->assertSame(100.0, TomoCost::desdePrecio(200.0, 50.0));
    }

    public function test_margen_utilizable_solo_entre_cero_y_cien(): void
    {
        $this->assertSame(30.0, TomoCost::margenUtilizable(30));
        $this->assertSame(30.5, TomoCost::margenUtilizable('30.5'));
        $this->assertNull(TomoCost::margenUtilizable(0), 'margen 0 = campo vacío en la edición');
        $this->assertNull(TomoCost::margenUtilizable(100));
        $this->assertNull(TomoCost::margenUtilizable(-5));
        $this->assertNull(TomoCost::margenUtilizable(null));
        $this->assertNull(TomoCost::margenUtilizable('abc'));
    }

    public function test_margen_vigente_se_deriva_de_costo_y_precio(): void
    {
        $this->assertEqualsWithDelta(30.0, TomoCost::margenVigente(111.30, 159.0), 0.0001);
        $this->assertEqualsWithDelta(0.0, TomoCost::margenVigente(159.0, 159.0), 0.0001);
    }

    public function test_margen_vigente_es_null_sin_costo_o_sin_precio(): void
    {
        $this->assertNull(TomoCost::margenVigente(null, 159.0));
        $this->assertNull(TomoCost::margenVigente(0.0, 159.0));
        $this->assertNull(TomoCost::margenVigente(111.30, null));
        $this->assertNull(TomoCost::margenVigente(111.30, 0.0));
    }
}
