<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Inventory;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Guard anti "caja abierta por días" (2026-07-16): POST /sales rechaza el
 * checkout cuando la sesión de caja está cerrada (CASH_SESSION_CLOSED) o
 * quedó abierta de un día-negocio anterior Y lleva 12h+ (CASH_SESSION_STALE).
 * La regla doble protege turnos que cruzan medianoche.
 */
class CashSessionGuardTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Store $store;
    private CashRegister $register;
    private PaymentMethod $cashMethod;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Test Co']);
        $this->store = Store::create(['company_id' => $company->id, 'name' => 'Test Store']);
        $this->user = User::create([
            'name' => 'Cajero', 'email' => 'cajero@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $this->store->id,
        ]);
        Warehouse::create([
            'company_id' => $company->id, 'store_id' => $this->store->id,
            'name' => 'Exhibición', 'type' => 'store', 'active' => true,
        ]);
        $this->register = CashRegister::create(['store_id' => $this->store->id, 'name' => 'Caja 1', 'active' => true]);
        $this->cashMethod = PaymentMethod::firstOrCreate(['name' => 'Efectivo'], ['active' => true]);
    }

    private function makeSession(\DateTimeInterface|string $openedAt, string $status = 'open'): CashRegisterSession
    {
        return CashRegisterSession::create([
            'register_id' => $this->register->id, 'user_id' => $this->user->id,
            'opening_cash' => 0, 'status' => $status, 'opened_at' => $openedAt,
        ]);
    }

    private function checkout(CashRegisterSession $session): \Illuminate\Testing\TestResponse
    {
        $warehouse = Warehouse::where('store_id', $this->store->id)->first();
        $product = Product::create([
            'company_id' => $this->store->company_id,
            'name' => 'Producto ' . uniqid(), 'sku' => 'SKU-' . uniqid(),
            'cost' => 50, 'active' => true,
        ]);
        $product->price()->create(['price_1' => 100.0]);
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'quantity' => 100]);

        return $this->actingAs($this->user)->postJson('/api/v1/sales', [
            'store_id'            => $this->store->id,
            'register_session_id' => $session->id,
            'items'               => [['product_id' => $product->id, 'quantity' => 1, 'price' => 100.0]],
            'payments'            => [['payment_method_id' => $this->cashMethod->id, 'amount' => 100.0]],
        ]);
    }

    public function test_checkout_ok_with_fresh_open_session(): void
    {
        $session = $this->makeSession(now()->subHours(2));

        $this->checkout($session)->assertStatus(201);
    }

    public function test_checkout_rejected_on_closed_session(): void
    {
        $session = $this->makeSession(now()->subHours(2), 'closed');

        $this->checkout($session)
            ->assertStatus(422)
            ->assertJsonPath('errors.code.0', 'CASH_SESSION_CLOSED');
    }

    public function test_checkout_rejected_on_stale_session_from_previous_day(): void
    {
        // Abierta ayer hace 30h (día-negocio anterior en Tijuana Y >= 12h).
        $session = $this->makeSession(now()->subHours(30));

        $this->checkout($session)
            ->assertStatus(422)
            ->assertJsonPath('errors.code.0', 'CASH_SESSION_STALE');
    }

    public function test_checkout_ok_on_midnight_crossing_shift(): void
    {
        // Turno que cruza medianoche (determinista, reloj congelado): "ahora"
        // es hoy 01:00 local Tijuana y la caja abrió AYER 20:00 local (hace 5h).
        // Día-negocio anterior, pero NO lleva 12h → se permite vender.
        $tz = config('app.business_timezone', 'America/Tijuana');
        $nowLocal = \Carbon\Carbon::now($tz)->startOfDay()->addHour(); // hoy 01:00 local
        \Carbon\Carbon::setTestNow($nowLocal->copy()->utc());

        $openedAt = $nowLocal->copy()->subHours(5)->utc(); // ayer 20:00 local
        $session = $this->makeSession($openedAt);

        $this->checkout($session)->assertStatus(201);
    }
}
