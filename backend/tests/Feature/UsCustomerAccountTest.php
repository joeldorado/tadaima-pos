<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\Store;
use App\Models\UsCustomer;
use App\Models\UsListing;
use App\Models\UsOrder;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * TadaimaUS — cuentas de CLIENTE de la tienda (guard `us`):
 *
 *  Checkout:  la cuenta se crea CON el pedido (misma transacción, password
 *             obligatoria); email registrado → 422 code account_exists;
 *             logueado → liga la orden sin password y actualiza la dirección.
 *  Login:     email O teléfono + contraseña (throttle us-auth).
 *  Panel:     /us/account/* solo con token de UsCustomer; pedidos SCOPED.
 *  Guards:    token de cliente NO pasa rutas POS y viceversa (providers
 *             explícitos en config/auth.php — el fix de seguridad).
 */
class UsCustomerAccountTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private Warehouse $warehouse;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->store = Store::create([
            'company_id' => $this->company->id, 'name' => 'Tienda A', 'active' => true,
        ]);
        $this->warehouse = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->store->id,
            'name' => 'Exhibición A', 'type' => 'store', 'active' => true,
        ]);

        $this->admin = $this->makeUser('admin@test.com', 'admin');
    }

    // ── Checkout crea la cuenta ───────────────────────────────────────────────

    public function test_checkout_guest_crea_cuenta_y_orden_atomico(): void
    {
        $listing = $this->makeListing($this->makeProduct('Funko', 'FIG-001'), ['price_usd' => 25]);

        $resp = $this->postJson('/api/v1/us/orders', $this->orderPayload([
            'items' => [['listing_id' => $listing->id, 'quantity' => 2]],
        ]))->assertCreated();

        // Cuenta creada con email lowercase y teléfono normalizado.
        $this->assertDatabaseCount('us_customers', 1);
        $customer = UsCustomer::firstOrFail();
        $this->assertSame('john@example.com', $customer->email);
        $this->assertSame('16195550100', $customer->phone);
        $this->assertSame('742 Evergreen Terrace', $customer->address);

        // Orden ligada + snapshot de dirección.
        $order = UsOrder::firstOrFail();
        $this->assertSame($customer->id, $order->us_customer_id);
        $this->assertSame('742 Evergreen Terrace', $order->shipping_address);
        $this->assertSame('San Diego', $order->shipping_city);

        // Respuesta enriquecida: shipping + customer + token de AUTO-LOGIN.
        $resp->assertJsonPath('data.shipping.city', 'San Diego');
        $resp->assertJsonPath('data.customer.email', 'john@example.com');
        $token = $resp->json('data.token');
        $this->assertNotEmpty($token);

        // El token sirve de inmediato en el panel del cliente.
        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/us/account/me')
            ->assertOk()
            ->assertJsonPath('data.email', 'john@example.com');
    }

    public function test_checkout_con_email_registrado_regresa_account_exists(): void
    {
        UsCustomer::factory()->create(['email' => 'john@example.com']);
        $listing = $this->makeListing($this->makeProduct('Funko', 'FIG-001'));

        $this->postJson('/api/v1/us/orders', $this->orderPayload([
            'email' => 'John@Example.com', // case-insensitive
            'items' => [['listing_id' => $listing->id, 'quantity' => 1]],
        ]))->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'account_exists')
            ->assertJsonStructure(['errors' => ['email']]);

        $this->assertDatabaseCount('us_orders', 0);
        $this->assertDatabaseCount('us_customers', 1);
    }

    public function test_checkout_con_sold_out_no_deja_cuenta_fantasma(): void
    {
        // Atomicidad: la cuenta nace en la MISMA transacción que el pedido —
        // si el pedido truena (item agotado), la cuenta tampoco queda.
        $agotado = $this->makeListing($this->makeProduct('Funko', 'FIG-001'), [
            'name' => 'Rengoku Figure', 'sold_out' => true,
        ]);

        $this->postJson('/api/v1/us/orders', $this->orderPayload([
            'items' => [['listing_id' => $agotado->id, 'quantity' => 1]],
        ]))->assertStatus(422);

        $this->assertDatabaseCount('us_orders', 0);
        $this->assertDatabaseCount('us_customers', 0);
    }

    public function test_checkout_logueado_liga_orden_sin_password_y_actualiza_direccion(): void
    {
        $customer = UsCustomer::factory()->create([
            'email' => 'john@example.com', 'address' => 'Old Street 1', 'city' => 'Chula Vista',
        ]);
        $token = $customer->createToken('us-customer')->plainTextToken;
        $listing = $this->makeListing($this->makeProduct('Funko', 'FIG-001'), ['price_usd' => 10]);

        $payload = $this->orderPayload([
            'items' => [['listing_id' => $listing->id, 'quantity' => 1]],
        ]);
        unset($payload['password']); // logueado NO manda contraseña

        $resp = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/us/orders', $payload)
            ->assertCreated();

        // No se creó cuenta nueva NI token nuevo en la respuesta.
        $this->assertDatabaseCount('us_customers', 1);
        $this->assertNull($resp->json('data.token'));

        $order = UsOrder::firstOrFail();
        $this->assertSame($customer->id, $order->us_customer_id);

        // La dirección capturada es la nueva default de la cuenta.
        $customer->refresh();
        $this->assertSame('742 Evergreen Terrace', $customer->address);
        $this->assertSame('San Diego', $customer->city);
    }

    // ── Login ─────────────────────────────────────────────────────────────────

    public function test_login_con_email(): void
    {
        UsCustomer::factory()->create(['email' => 'john@example.com', 'password' => 'super-secret-1']);

        $resp = $this->postJson('/api/v1/us/auth/login', [
            'identifier' => 'John@Example.com', 'password' => 'super-secret-1',
        ])->assertOk();

        $this->assertNotEmpty($resp->json('data.token'));
        $resp->assertJsonPath('data.customer.email', 'john@example.com');
    }

    public function test_login_con_telefono_formateado(): void
    {
        UsCustomer::factory()->create(['phone' => '6195550100', 'password' => 'super-secret-1']);

        $this->postJson('/api/v1/us/auth/login', [
            'identifier' => '(619) 555-0100', 'password' => 'super-secret-1',
        ])->assertOk();
    }

    public function test_login_password_mala_401_generico(): void
    {
        UsCustomer::factory()->create(['email' => 'john@example.com', 'password' => 'super-secret-1']);

        // Cuenta existente con password mala Y cuenta inexistente: MISMO
        // mensaje (no filtra existencia).
        $bad = $this->postJson('/api/v1/us/auth/login', [
            'identifier' => 'john@example.com', 'password' => 'wrong',
        ])->assertStatus(401);
        $ghost = $this->postJson('/api/v1/us/auth/login', [
            'identifier' => 'ghost@example.com', 'password' => 'wrong',
        ])->assertStatus(401);
        $this->assertSame($bad->json('error'), $ghost->json('error'));
    }

    public function test_login_throttle_429_al_sexto_intento(): void
    {
        UsCustomer::factory()->create(['email' => 'john@example.com', 'password' => 'super-secret-1']);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/us/auth/login', [
                'identifier' => 'john@example.com', 'password' => 'wrong',
            ])->assertStatus(401);
        }

        $this->postJson('/api/v1/us/auth/login', [
            'identifier' => 'john@example.com', 'password' => 'wrong',
        ])->assertStatus(429);
    }

    // ── Panel del cliente ─────────────────────────────────────────────────────

    public function test_orders_scoped_al_dueno(): void
    {
        $a = UsCustomer::factory()->create();
        $b = UsCustomer::factory()->create();
        $this->makeOrderFor($a, 'TUS-000001');
        $this->makeOrderFor($b, 'TUS-000002');

        $tokenA = $a->createToken('us-customer')->plainTextToken;

        $resp = $this->withHeader('Authorization', "Bearer {$tokenA}")
            ->getJson('/api/v1/us/account/orders')
            ->assertOk();

        $resp->assertJsonCount(1, 'data');
        $resp->assertJsonPath('data.0.order_number', 'TUS-000001');
        $resp->assertJsonPath('data.0.shipping.city', 'San Diego');
        $resp->assertJsonPath('data.0.items.0.name', 'Rengoku Figure');
    }

    public function test_cambio_de_password_exige_actual_y_revoca_otros_tokens(): void
    {
        $customer = UsCustomer::factory()->create(['password' => 'super-secret-1']);
        $token = $customer->createToken('us-customer')->plainTextToken;
        $otherToken = $customer->createToken('us-customer')->plainTextToken;

        // Actual incorrecta → 422.
        $this->withHeader('Authorization', "Bearer {$token}")
            ->putJson('/api/v1/us/account/password', [
                'current_password' => 'wrong', 'password' => 'new-secret-99',
            ])->assertStatus(422)
            ->assertJsonStructure(['errors' => ['current_password']]);

        // Correcta → cambia y el OTRO token muere; el actual sigue vivo.
        $this->withHeader('Authorization', "Bearer {$token}")
            ->putJson('/api/v1/us/account/password', [
                'current_password' => 'super-secret-1', 'password' => 'new-secret-99',
            ])->assertOk();

        $this->assertTrue(Hash::check('new-secret-99', $customer->fresh()->password));

        // forgetGuards: dentro de UN test los guards cachean al usuario
        // autenticado entre requests (RequestGuard) — sin esto el token
        // revocado "parece" seguir vivo aunque ya no existe en BD.
        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', "Bearer {$otherToken}")
            ->getJson('/api/v1/us/account/me')->assertStatus(401);

        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/us/account/me')->assertOk();
    }

    public function test_update_profile_cambia_direccion_default(): void
    {
        $customer = UsCustomer::factory()->create(['address' => 'Old Street 1']);
        $token = $customer->createToken('us-customer')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$token}")
            ->putJson('/api/v1/us/account/profile', [
                'name' => 'Johnny D', 'phone' => '(619) 555-0199',
                'address' => 'New Ave 42', 'city' => 'La Mesa',
                'state' => 'CA', 'zip' => '91941', 'country' => 'United States',
            ])->assertOk()
            ->assertJsonPath('data.address', 'New Ave 42');

        $customer->refresh();
        $this->assertSame('Johnny D', $customer->name);
        $this->assertSame('6195550199', $customer->phone); // normalizado
    }

    // ── Blindaje de guards (el fix de seguridad) ──────────────────────────────

    public function test_token_de_cliente_rechazado_en_rutas_pos(): void
    {
        $customer = UsCustomer::factory()->create();
        $token = $customer->createToken('us-customer')->plainTextToken;

        // Bandeja admin de la tienda US (auth:sanctum) y perfil del POS:
        // guard sanctum con provider users → 401, ni siquiera 403.
        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/us/orders')->assertStatus(401);
        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/auth/me')->assertStatus(401);
        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/products')->assertStatus(401);
    }

    public function test_token_del_pos_rechazado_en_rutas_de_cliente(): void
    {
        $token = $this->admin->createToken('pos-token')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/us/account/me')->assertStatus(401);
        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/us/account/orders')->assertStatus(401);
    }

    public function test_bandeja_admin_lista_orden_legacy_sin_direccion(): void
    {
        // Pedido anterior a las cuentas: sin us_customer_id ni shipping_*.
        UsOrder::create([
            'order_number' => 'TUS-000001', 'customer_name' => 'Old Guy',
            'customer_email' => 'old@example.com', 'customer_phone' => '5550000',
            'total_usd' => 10, 'status' => 'new',
        ]);

        $resp = $this->actingAs($this->admin)->getJson('/api/v1/us/orders')->assertOk();

        $resp->assertJsonCount(1, 'data');
        $resp->assertJsonPath('data.0.us_customer_id', null);
        $resp->assertJsonPath('data.0.shipping.address', null);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function orderPayload(array $overrides = []): array
    {
        return $overrides + [
            'name'     => 'John Doe',
            'email'    => 'john@example.com',
            'phone'    => '+1 619 555 0100',
            'address'  => '742 Evergreen Terrace',
            'city'     => 'San Diego',
            'state'    => 'CA',
            'zip'      => '92101',
            'country'  => 'United States',
            'password' => 'super-secret-1',
        ];
    }

    private function makeProduct(string $name, string $sku, int $stock = 5): Product
    {
        $p = Product::create(['name' => $name, 'sku' => $sku, 'active' => true]);
        $p->price()->create(['price_1' => 100]);

        if ($stock > 0) {
            Inventory::create([
                'product_id' => $p->id, 'warehouse_id' => $this->warehouse->id, 'quantity' => $stock,
            ]);
        }

        return $p;
    }

    private function makeListing(Product $product, array $attrs = []): UsListing
    {
        return UsListing::create($attrs + [
            'product_id' => $product->id,
            'name'       => $product->name,
            'price_usd'  => 10,
            'category'   => 'other',
            'visible'    => true,
        ]);
    }

    private function makeOrderFor(UsCustomer $customer, string $orderNumber): UsOrder
    {
        $order = UsOrder::create([
            'us_customer_id'   => $customer->id,
            'order_number'     => $orderNumber,
            'customer_name'    => $customer->name,
            'customer_email'   => $customer->email,
            'customer_phone'   => $customer->phone,
            'shipping_address' => '742 Evergreen Terrace',
            'shipping_city'    => 'San Diego',
            'shipping_state'   => 'CA',
            'shipping_zip'     => '92101',
            'shipping_country' => 'United States',
            'total_usd'        => 25,
            'status'           => 'new',
        ]);
        $order->items()->create([
            'name' => 'Rengoku Figure', 'price_usd' => 25, 'quantity' => 1, 'line_total_usd' => 25,
        ]);

        return $order;
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
