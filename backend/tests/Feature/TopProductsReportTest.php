<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Inventory;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * GET /reports/top-products para la pantalla Estadística (Ruben 2026-10-21).
 * Un renglón por producto + precio + costo (a propósito: socio vs normal, costo
 * real de cada compra). Aquí blindamos lo que se corrigió en el release:
 * - 2 fotos empatadas en sort_order no duplican unidades ni total;
 * - el costo solo va a admin o a quien tiene can_view_cost;
 * - ordenar por utilidad no truena (en Postgres un alias no se puede usar
 *   dentro de una expresión del ORDER BY).
 */
class TopProductsReportTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private User $cajero;
    private CashRegisterSession $session;
    private PaymentMethod $cash;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Test Co']);
        $this->store = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda A']);
        $this->cajero = $this->makeUser('cajero@test.com', 'cajero');
        Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->store->id,
            'name' => 'Exhibición', 'type' => 'store', 'active' => true,
        ]);
        $register = CashRegister::create(['store_id' => $this->store->id, 'name' => 'Caja 1', 'active' => true]);
        $this->session = CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $this->cajero->id,
            'opening_cash' => 0, 'status' => 'open', 'opened_at' => now(),
        ]);
        $this->cash = PaymentMethod::firstOrCreate(['name' => 'Efectivo'], ['active' => true]);
    }

    public function test_dos_fotos_empatadas_no_duplican_unidades_ni_total(): void
    {
        $product = $this->makeProduct(100, 40);
        // Subir foto siempre guarda sort_order 0 → dos fotos empatadas.
        ProductImage::create(['product_id' => $product->id, 'image_path' => 'products/a.jpg', 'sort_order' => 0]);
        ProductImage::create(['product_id' => $product->id, 'image_path' => 'products/b.jpg', 'sort_order' => 0]);

        $this->sell($product, 3, 100);

        $row = $this->rowsFor($this->makeUser('admin@test.com', 'admin'))->firstWhere('id', $product->id);

        $this->assertNotNull($row);
        $this->assertSame(3.0, (float) $row['total_quantity']);
        $this->assertSame(300.0, (float) $row['total_revenue']);
        $this->assertStringContainsString('products/a.jpg', $row['image_url']);
    }

    public function test_precio_distinto_va_en_renglon_aparte(): void
    {
        $product = $this->makeProduct(100, 40, 90);

        $this->sell($product, 1, 100);
        $this->sell($product, 2, 90);

        $rows = $this->rowsFor($this->makeUser('admin@test.com', 'admin'))->where('id', $product->id);

        $this->assertCount(2, $rows);
        $this->assertEqualsCanonicalizing([100.0, 90.0], $rows->pluck('unit_price')->map(fn ($v) => (float) $v)->all());
    }

    public function test_costo_solo_para_admin_o_can_view_cost(): void
    {
        $product = $this->makeProduct(100, 40);
        $this->sell($product, 1, 100);

        $admin = $this->rowsFor($this->makeUser('admin@test.com', 'admin'))->firstWhere('id', $product->id);
        $this->assertSame(40.0, (float) $admin['unit_cost']);

        $conFlag = $this->rowsFor($this->makeUser('gerente.flag@test.com', 'gerente', true))->firstWhere('id', $product->id);
        $this->assertSame(40.0, (float) $conFlag['unit_cost']);

        $gerente = $this->rowsFor($this->makeUser('gerente@test.com', 'gerente'))->firstWhere('id', $product->id);
        $this->assertNotNull($gerente);
        $this->assertArrayNotHasKey('unit_cost', $gerente);

        $cajero = $this->rowsFor($this->cajero)->firstWhere('id', $product->id);
        $this->assertNotNull($cajero);
        $this->assertArrayNotHasKey('unit_cost', $cajero);
    }

    public function test_ordenar_por_utilidad(): void
    {
        $pocaUtilidad = $this->makeProduct(100, 90);
        $muchaUtilidad = $this->makeProduct(100, 10);
        $this->sell($pocaUtilidad, 1, 100);
        $this->sell($muchaUtilidad, 1, 100);

        $ids = $this->rowsFor($this->makeUser('admin@test.com', 'admin'), 'sort_by=utilidad&sort_dir=desc')
            ->pluck('id')->all();

        $this->assertSame([$muchaUtilidad->id, $pocaUtilidad->id], $ids);
    }

    public function test_busqueda_sin_distinguir_mayusculas(): void
    {
        $buscado = $this->makeProduct(100, 40);
        $buscado->update(['name' => 'Funko PIKACHU']);
        $otro = $this->makeProduct(100, 40);
        $this->sell($buscado, 1, 100);
        $this->sell($otro, 1, 100);

        $ids = $this->rowsFor($this->makeUser('admin@test.com', 'admin'), 'search=pikachu')->pluck('id')->all();

        $this->assertSame([$buscado->id], $ids);
    }

    private function rowsFor(User $user, string $extra = ''): \Illuminate\Support\Collection
    {
        $range = 'from=' . now()->subDay()->toDateString() . '&to=' . now()->addDay()->toDateString();

        return collect($this->actingAs($user)
            ->getJson("/api/v1/reports/top-products?{$range}&{$extra}")
            ->assertOk()
            ->json('data.data'));
    }

    private function sell(Product $product, int $qty, float $price): void
    {
        $this->actingAs($this->cajero)
            ->postJson('/api/v1/sales', [
                'store_id' => $this->store->id,
                'register_session_id' => $this->session->id,
                'items' => [['product_id' => $product->id, 'quantity' => $qty, 'price' => $price]],
                'payments' => [['payment_method_id' => $this->cash->id, 'amount' => $qty * $price]],
            ])
            ->assertStatus(201);
    }

    private function makeProduct(float $price, float $cost, ?float $price2 = null): Product
    {
        $warehouse = Warehouse::where('store_id', $this->store->id)->first();
        $product = Product::create([
            'company_id' => $this->company->id,
            'name' => 'Producto ' . uniqid(), 'sku' => 'SKU-' . uniqid(),
            'cost' => $cost, 'active' => true,
        ]);
        $product->price()->create(array_filter(['price_1' => $price, 'price_2' => $price2]));
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'quantity' => 100]);

        return $product;
    }

    private function makeUser(string $email, string $roleName, bool $canViewCost = false): User
    {
        $user = User::create([
            'name' => $email, 'email' => $email, 'password' => bcrypt('password'),
            'company_id' => $this->company->id, 'store_id' => $this->store->id, 'active' => true,
            'can_view_cost' => $canViewCost,
        ]);

        $roleId = DB::table('roles')->where('name', $roleName)->value('id')
            ?? DB::table('roles')->insertGetId([
                'name' => $roleName, 'guard_name' => 'api',
                'created_at' => now(), 'updated_at' => now(),
            ]);

        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id,
        ]);

        return $user;
    }
}
