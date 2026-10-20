<?php

declare(strict_types=1);

namespace Tests\Feature\Concerns;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Inventory;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;

/**
 * Mundo mínimo para los tests de Paquetes: una empresa, dos tiendas (A y B)
 * con Exhibición + Bodega cada una, usuarios por rol y helpers para productos,
 * stock, paquetes y armados.
 */
trait BuildsBundleWorld
{
    protected Company $company;

    protected Store $storeA;

    protected Store $storeB;

    protected Warehouse $exhA;

    protected Warehouse $bodA;

    protected Warehouse $exhB;

    protected Warehouse $bodB;

    protected User $admin;

    protected User $gerenteA;

    protected User $cajeroA;

    protected function buildBundleWorld(): void
    {
        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->storeA = Store::create(['company_id' => $this->company->id, 'name' => 'Macro', 'active' => true]);
        $this->storeB = Store::create(['company_id' => $this->company->id, 'name' => 'Centro', 'active' => true]);

        [$this->exhA, $this->bodA] = $this->makeWarehouses($this->storeA);
        [$this->exhB, $this->bodB] = $this->makeWarehouses($this->storeB);

        $this->admin = $this->makeUser('admin@test.com', 'admin', null);
        $this->gerenteA = $this->makeUser('gerente.a@test.com', 'gerente', $this->storeA->id);
        $this->cajeroA = $this->makeUser('cajero.a@test.com', 'cajero', $this->storeA->id);
    }

    /** @return array{0: Warehouse, 1: Warehouse} [Exhibición, Bodega] */
    protected function makeWarehouses(Store $store): array
    {
        $exh = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $store->id,
            'name' => "Exhibición {$store->name}", 'type' => 'store', 'active' => true,
        ]);
        $bod = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $store->id,
            'name' => "Bodega {$store->name}", 'type' => 'bodega', 'active' => true,
        ]);

        return [$exh, $bod];
    }

    protected function makeUser(string $email, string $roleName, ?int $storeId): User
    {
        $user = User::create([
            'name' => $email, 'email' => $email, 'password' => bcrypt('password'),
            'company_id' => $this->company->id, 'store_id' => $storeId, 'active' => true,
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

    protected function makeProduct(string $name, ?float $cost = 40, float $price = 100, string $type = 'product'): Product
    {
        $product = Product::create([
            'name' => $name, 'sku' => 'SKU-'.strtoupper(uniqid()), 'cost' => $cost,
            'active' => true, 'product_type' => $type,
        ]);
        $product->price()->create(['price_1' => $price]);

        return $product;
    }

    protected function stock(Product $product, Warehouse $warehouse, float $qty): void
    {
        Inventory::updateOrCreate(
            ['product_id' => $product->id, 'warehouse_id' => $warehouse->id],
            ['quantity' => $qty],
        );
    }

    protected function qty(Product $product, Warehouse $warehouse): float
    {
        return (float) (Inventory::query()
            ->where('product_id', $product->id)
            ->where('warehouse_id', $warehouse->id)
            ->value('quantity') ?? 0);
    }

    /** @param list<array{product_id:int, quantity:int}> $components */
    protected function bundlePayload(array $components, float $price = 300, array $extra = []): array
    {
        return array_merge([
            'name' => 'Paquete Test',
            'prices' => ['price_1' => $price],
            'components' => $components,
        ], $extra);
    }

    /** Crea un paquete vía API como admin y devuelve el Product. */
    protected function createBundle(array $components, float $price = 300, array $extra = []): Product
    {
        $res = $this->actingAs($this->admin)->postJson('/api/v1/bundles', $this->bundlePayload($components, $price, $extra));
        $res->assertStatus(201);

        return Product::query()->findOrFail((int) $res->json('data.id'));
    }

    protected function assemble(Product $bundle, Store $store, int $quantity, array $extra = [], ?User $as = null): TestResponse
    {
        return $this->actingAs($as ?? $this->admin)->postJson("/api/v1/bundles/{$bundle->id}/assemble", array_merge([
            'store_id' => $store->id, 'quantity' => $quantity,
        ], $extra));
    }

    protected function disassemble(Product $bundle, Store $store, int $quantity, array $extra = [], ?User $as = null): TestResponse
    {
        return $this->actingAs($as ?? $this->admin)->postJson("/api/v1/bundles/{$bundle->id}/disassemble", array_merge([
            'store_id' => $store->id, 'quantity' => $quantity,
        ], $extra));
    }

    /** Caja abierta para cobrar en una tienda. */
    protected function openSession(User $user, Store $store): CashRegisterSession
    {
        // Una caja abierta por usuario (índice parcial en Postgres): se reutiliza.
        $open = CashRegisterSession::query()->where('user_id', $user->id)->where('status', 'open')->first();
        if ($open) {
            return $open;
        }
        $register = CashRegister::firstOrCreate(['store_id' => $store->id, 'name' => 'Caja 1'], ['active' => true]);

        return CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $user->id,
            'opening_cash' => 0, 'status' => 'open', 'opened_at' => now(),
        ]);
    }

    protected function cashMethod(): PaymentMethod
    {
        return PaymentMethod::firstOrCreate(['name' => 'Efectivo'], ['active' => true]);
    }

    protected static function ean13IsValid(string $code): bool
    {
        if (! preg_match('/^\d{13}$/', $code)) {
            return false;
        }
        $sum = 0;
        for ($i = 0; $i < 12; $i++) {
            $sum += (int) $code[$i] * ($i % 2 === 0 ? 1 : 3);
        }

        return (10 - ($sum % 10)) % 10 === (int) $code[12];
    }
}
