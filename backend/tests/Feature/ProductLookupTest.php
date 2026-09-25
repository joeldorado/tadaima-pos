<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * GET /products/lookup (Joel 2026-09-25): al dar de alta un producto, avisar
 * CUÁL producto ya tiene ese código (como el "Ya existe artículo con código X,
 * ¿desea modificarlo?" del sistema viejo) + 422 de SKU duplicado en español.
 */
class ProductLookupTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private User $admin;
    private User $cajero;
    private Product $porSku;
    private Product $porBarcode;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->admin = $this->makeUser('admin@test.com', 'admin');
        $this->cajero = $this->makeUser('cajero@test.com', 'cajero');

        $this->porSku = $this->makeProduct('Funko Goku', 'ABC-196214', null, 55.0);
        $this->porBarcode = $this->makeProduct('Tomo One Piece 1', 'OP-001', '196214108417', 80.0, false);
    }

    public function test_encuentra_por_sku_sin_distinguir_mayusculas_ni_espacios(): void
    {
        $data = $this->lookup($this->admin, '  abc-196214 ');
        $this->assertCount(1, $data);
        $this->assertSame($this->porSku->id, $data[0]['id']);
        $this->assertSame('Funko Goku', $data[0]['name']);
    }

    public function test_encuentra_por_barcode_aunque_este_inactivo(): void
    {
        $data = $this->lookup($this->admin, '196214108417');
        $this->assertSame([$this->porBarcode->id], array_column($data, 'id'));
    }

    public function test_primero_el_match_por_sku(): void
    {
        $otro = $this->makeProduct('Otro', 'X-1', 'DUP-CODE');
        $sku = $this->makeProduct('Dueño del SKU', 'DUP-CODE', null);

        $this->assertSame([$sku->id, $otro->id], array_column($this->lookup($this->admin, 'dup-code'), 'id'));
    }

    public function test_exact_match_no_substring(): void
    {
        $this->assertSame([], $this->lookup($this->admin, '196214'));
    }

    public function test_exclude_id_para_modo_edicion(): void
    {
        $this->assertSame([], $this->lookup($this->admin, 'ABC-196214', $this->porSku->id));
    }

    public function test_codigo_corto_regresa_vacio(): void
    {
        $this->assertSame([], $this->lookup($this->admin, 'AB'));
    }

    public function test_cajero_no_ve_costo(): void
    {
        $data = $this->lookup($this->cajero, 'ABC-196214');
        $this->assertSame($this->porSku->id, $data[0]['id']);
        $this->assertNull($data[0]['cost'] ?? null);

        $this->assertEquals(55.0, $this->lookup($this->admin, 'ABC-196214')[0]['cost']);
    }

    public function test_sku_duplicado_en_alta_responde_en_espanol(): void
    {
        $this->actingAs($this->admin)
            ->postJson('/api/v1/products', ['name' => 'Repetido', 'sku' => 'ABC-196214'])
            ->assertStatus(422)
            ->assertJsonPath('errors.sku.0', 'Ese SKU / código ya lo tiene otro producto.');
    }

    public function test_ruta_lookup_no_colisiona_con_show(): void
    {
        $this->actingAs($this->admin)
            ->getJson('/api/v1/products/lookup?code=ABC-196214')
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    private function lookup(User $user, string $code, ?int $excludeId = null): array
    {
        $qs = http_build_query(array_filter(['code' => $code, 'exclude_id' => $excludeId]));

        return $this->actingAs($user)
            ->getJson("/api/v1/products/lookup?{$qs}")
            ->assertOk()->json('data');
    }

    private function makeProduct(string $name, string $sku, ?string $barcode, ?float $cost = null, bool $active = true): Product
    {
        $p = Product::create([
            'company_id' => $this->company->id,
            'name' => $name, 'sku' => $sku, 'barcode' => $barcode, 'active' => $active, 'cost' => $cost,
        ]);
        $p->price()->create(['price_1' => 100]);

        return $p;
    }

    private function makeUser(string $email, string $roleName): User
    {
        $user = User::create([
            'name' => $email, 'email' => $email, 'password' => bcrypt('password'),
            'company_id' => $this->company->id, 'store_id' => null, 'active' => true,
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
