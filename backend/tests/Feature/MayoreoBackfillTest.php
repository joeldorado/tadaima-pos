<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\ProductPromotion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Conversión de las promos viejas por GRUPOS al modelo de MAYOREO por pieza
 * (migración 2026_07_23_000002). Corre sola en prod en cada deploy, así que
 * conviene tenerla cubierta: toca dinero de promos vivas.
 */
class MayoreoBackfillTest extends TestCase
{
    use RefreshDatabase;

    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Test Co']);
        $this->product = Product::create([
            'company_id' => $company->id, 'name' => 'Funko', 'sku' => 'FUN-1', 'active' => true,
        ]);
    }

    /** Inserta una promo legacy saltándose el modelo (`tiers` ya no es fillable). */
    private function legacyPromo(string $name, array $tiers, string $status = 'active'): int
    {
        return (int) DB::table('product_promotions')->insertGetId([
            'product_id' => $this->product->id,
            'name'       => $name,
            'type'       => ProductPromotion::TYPE_QTY_DISCOUNT,
            'tiers'      => json_encode($tiers),
            'status'     => $status,
            'priority'   => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** Re-corre solo el backfill (las migraciones ya corrieron en el setUp). */
    private function runBackfill(): void
    {
        (require database_path('migrations/2026_07_23_000002_backfill_mayoreo_from_tiers.php'))->up();
    }

    public function test_un_solo_escalon_se_convierte_cobrando_igual_en_esa_cantidad(): void
    {
        // "Buen Fin 2026" de prod: −$100 por cada par → desde 2 pzas, −$50 c/u.
        // A 2 piezas el descuento es IDÉNTICO (2 × 50 = 100).
        $id = $this->legacyPromo('Buen Fin 2026', [['qty' => 2, 'amount' => 100]]);

        $this->runBackfill();

        $promo = ProductPromotion::findOrFail($id);
        $this->assertSame(2, $promo->min_qty);
        $this->assertEqualsWithDelta(50.0, (float) $promo->discount_per_unit, 0.001);
        $this->assertSame('active', $promo->status, 'Una promo de un solo escalón no debe pausarse.');
        $this->assertEqualsWithDelta(100.0, $promo->min_qty * (float) $promo->discount_per_unit, 0.001);
    }

    public function test_escalon_no_divisible_redondea_a_centavos(): void
    {
        // "Promo 3 x 2" de prod: $100 ÷ 3 = 33.333… → 33.33 (un centavo abajo
        // en el escalón). Documentado: conviene rehacerla con número redondo.
        $id = $this->legacyPromo('Promo 3 x 2', [['qty' => 3, 'amount' => 100]]);

        $this->runBackfill();

        $promo = ProductPromotion::findOrFail($id);
        $this->assertSame(3, $promo->min_qty);
        $this->assertEqualsWithDelta(33.33, (float) $promo->discount_per_unit, 0.001);
    }

    public function test_multi_escalon_se_pausa_en_vez_de_convertirse_mal(): void
    {
        // No hay conversión honesta de varios escalones a uno: tomar el menor
        // parte el descuento del escalón alto, tomar el mayor lo dispara.
        $id = $this->legacyPromo('Escalonada', [
            ['qty' => 2, 'amount' => 100],
            ['qty' => 3, 'amount' => 400],
        ]);

        $this->runBackfill();

        $promo = ProductPromotion::findOrFail($id);
        $this->assertSame('paused', $promo->status);
        $this->assertNull($promo->min_qty, 'Sin convertir: la UI la marca "Sin configurar".');
        $this->assertNotNull($promo->tiers, 'Los tiers se conservan como rastro para reconfigurarla.');
    }

    public function test_es_idempotente(): void
    {
        $id = $this->legacyPromo('Buen Fin 2026', [['qty' => 2, 'amount' => 100]]);

        $this->runBackfill();
        // Alguien ajusta el descuento a mano después del deploy…
        ProductPromotion::where('id', $id)->update(['discount_per_unit' => 60]);
        // …y la migración vuelve a correr (otro deploy).
        $this->runBackfill();

        $this->assertEqualsWithDelta(
            60.0,
            (float) ProductPromotion::findOrFail($id)->discount_per_unit,
            0.001,
            'Re-correr el backfill no debe pisar un valor ya ajustado.'
        );
    }

    public function test_no_toca_las_promos_nxm(): void
    {
        $nxm = ProductPromotion::create([
            'product_id' => $this->product->id, 'name' => '2x1', 'buy_n' => 2, 'pay_m' => 1,
        ]);

        $this->runBackfill();

        $fresh = $nxm->fresh();
        $this->assertSame('active', $fresh->status);
        $this->assertNull($fresh->min_qty);
        $this->assertSame(2, $fresh->buy_n);
    }
}
