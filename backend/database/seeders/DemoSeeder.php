<?php

namespace Database\Seeders;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Inventory;
use App\Models\Payment;
use App\Models\PaymentMethod;
use App\Models\PreSaleCatalog;
use App\Models\PreSaleCatalogStoreLimit;
use App\Models\PreSaleOrder;
use App\Models\PreSaleOrderItem;
use App\Models\PreSaleOrderPayment;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\ProductPromotion;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Store;
use App\Models\Supplier;
use App\Models\Terminal;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Datos demo DETERMINISTAS para el pipeline de screenshots de documentación
 * (docs:seed → docs:capture) y para los e2e de Playwright.
 *
 * - Idempotente: correrlo 2 veces deja el mismo estado (updateOrCreate /
 *   firstOrCreate por claves naturales: sku, email, nombre, etc.).
 * - NUNCA corre en producción (guard duro abajo).
 * - NO está registrado en DatabaseSeeder — se invoca explícito:
 *       APP_ENV=sqlitelocal php artisan db:seed --class=DemoSeeder
 *
 * Credenciales (las MISMAS que asume la suite e2e en tests/e2e/helpers.ts):
 *   admin@tadaima.mx  / password     (admin, todas las tiendas)
 *   cajero@test.com   / password123  (cajero, Tienda 1)
 *   gerente@test.com  / password123  (gerente, Tienda 2)
 */
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        if (app()->environment('production')) {
            $this->command?->error('DemoSeeder NO corre en producción. Abortando.');

            return;
        }

        $company = Company::firstOrCreate(['name' => 'Tadaima']);

        // ── Roles (guard api, mismo patrón que DatabaseSeeder) ────────────────
        $roleIds = [];
        foreach (['admin', 'gerente', 'cajero'] as $name) {
            $id = DB::table('roles')->where('name', $name)->where('guard_name', 'api')->value('id');
            if (! $id) {
                $id = DB::table('roles')->insertGetId([
                    'name' => $name, 'guard_name' => 'api',
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
            $roleIds[$name] = $id;
        }

        // ── Métodos de pago ───────────────────────────────────────────────────
        $pm = [];
        foreach (['Efectivo', 'Tarjeta Débito', 'Tarjeta Crédito', 'Transferencia'] as $name) {
            $pm[$name] = PaymentMethod::firstOrCreate(['name' => $name], ['active' => true]);
        }

        // ── Tiendas + almacenes (Exhibición `store` + Bodega `bodega`) ────────
        $tienda1 = Store::firstOrCreate(
            ['company_id' => $company->id, 'name' => 'Tienda 1 — Centro'],
            ['address' => 'Centro', 'active' => true],
        );
        $tienda2 = Store::firstOrCreate(
            ['company_id' => $company->id, 'name' => 'Tienda 2 — Macroplaza'],
            ['address' => 'Macroplaza', 'active' => true],
        );

        $exhib1 = Warehouse::firstOrCreate(
            ['company_id' => $company->id, 'store_id' => $tienda1->id, 'type' => 'store'],
            ['name' => 'Tienda 1 — Centro', 'active' => true],
        );
        $exhib2 = Warehouse::firstOrCreate(
            ['company_id' => $company->id, 'store_id' => $tienda2->id, 'type' => 'store'],
            ['name' => 'Tienda 2 — Macroplaza', 'active' => true],
        );
        $bodega1 = Warehouse::firstOrCreate(
            ['company_id' => $company->id, 'store_id' => $tienda1->id, 'type' => 'bodega'],
            ['name' => 'Bodega — Tienda 1 Centro', 'active' => true],
        );
        Warehouse::firstOrCreate(
            ['company_id' => $company->id, 'store_id' => $tienda2->id, 'type' => 'bodega'],
            ['name' => 'Bodega — Tienda 2 Macro', 'active' => true],
        );

        // ── Cajas y terminales ────────────────────────────────────────────────
        $caja1 = CashRegister::firstOrCreate(
            ['store_id' => $tienda1->id, 'name' => 'Caja 1 — Tienda 1'],
            ['active' => true],
        );
        CashRegister::firstOrCreate(
            ['store_id' => $tienda2->id, 'name' => 'Caja 1 — Tienda 2'],
            ['active' => true],
        );

        $terminal1 = Terminal::firstOrCreate(
            ['store_id' => $tienda1->id, 'name' => 'Terminal Tienda 1'],
            ['commission_percent' => 3.5, 'active' => true],
        );
        Terminal::firstOrCreate(
            ['store_id' => $tienda2->id, 'name' => 'Terminal Tienda 2'],
            ['commission_percent' => 3.5, 'active' => true],
        );

        // ── Métodos de pago por tienda ────────────────────────────────────────
        foreach ([$tienda1->id, $tienda2->id] as $storeId) {
            foreach ($pm as $method) {
                $exists = DB::table('store_payment_methods')
                    ->where('store_id', $storeId)
                    ->where('payment_method_id', $method->id)
                    ->exists();
                if (! $exists) {
                    DB::table('store_payment_methods')->insert([
                        'store_id' => $storeId, 'payment_method_id' => $method->id,
                        'active' => true, 'created_at' => now(), 'updated_at' => now(),
                    ]);
                }
            }
        }

        // ── Configuración mínima ──────────────────────────────────────────────
        DB::table('system_settings')->updateOrInsert(
            ['company_id' => $company->id, 'key' => 'points_multiplier'],
            ['value' => '0.001'],
        );

        // ── Usuarios (credenciales EXACTAS de tests/e2e/helpers.ts) ───────────
        $admin = $this->ensureUser('admin@tadaima.mx', 'password', [
            'name' => 'Admin', 'company_id' => $company->id, 'store_id' => null,
            'active' => true, 'can_view_cost' => true,
        ], $roleIds['admin']);

        $cajero = $this->ensureUser('cajero@test.com', 'password123', [
            'name' => 'Juan Cajero', 'company_id' => $company->id, 'store_id' => $tienda1->id,
            'phone' => '5500000001', 'active' => true, 'can_view_cost' => false,
        ], $roleIds['cajero']);

        $this->ensureUser('gerente@test.com', 'password123', [
            'name' => 'María Gerente', 'company_id' => $company->id, 'store_id' => $tienda2->id,
            'active' => true, 'can_view_cost' => true,
        ], $roleIds['gerente']);

        // ── Categorías y proveedores ──────────────────────────────────────────
        $cats = [];
        foreach (['Electrónica', 'Accesorios', 'Figuras', 'Mangas', 'Coleccionables'] as $name) {
            $cats[$name] = ProductCategory::firstOrCreate(['name' => $name], ['active' => true]);
        }

        $sups = [];
        foreach (['Distribuidora Panini México', 'Bandai México', 'Importaciones Akiba', 'Tecnología BC'] as $name) {
            $sups[$name] = Supplier::firstOrCreate(['name' => $name], ['active' => true]);
        }

        // ── ~20 productos deterministas (sku = clave natural) ─────────────────
        // [sku, nombre, barcode, categoría, proveedor, costo, p1, p2, stock exhibición T1]
        $catalog = [
            ['DEMO-ELE-001', 'Audífonos Bluetooth Sony WH-CH520', '7501234500011', 'Electrónica', 'Tecnología BC', 850.00, 1299.00, 1199.00, 12],
            ['DEMO-ELE-002', 'Bocina JBL Go 4', '7501234500028', 'Electrónica', 'Tecnología BC', 690.00, 999.00, 949.00, 8],
            ['DEMO-ELE-003', 'Cargador rápido 20W USB-C', '7501234500035', 'Electrónica', 'Tecnología BC', 120.00, 249.00, 219.00, 30],
            ['DEMO-ELE-004', 'Cable USB-C trenzado 1 m', '7501234500042', 'Electrónica', 'Tecnología BC', 45.00, 129.00, 99.00, 40],
            ['DEMO-ELE-005', 'Power bank 10,000 mAh', '7501234500059', 'Electrónica', 'Tecnología BC', 210.00, 399.00, 359.00, 15],
            ['DEMO-ELE-006', 'Mouse inalámbrico Logitech M185', '7501234500066', 'Electrónica', 'Tecnología BC', 180.00, 329.00, 299.00, 10],
            ['DEMO-FIG-001', 'Figura Goku Super Saiyan Grandista', '7501234500073', 'Figuras', 'Bandai México', 620.00, 1099.00, 999.00, 6],
            ['DEMO-FIG-002', 'Figura Luffy Gear 5 Ichibansho', '7501234500080', 'Figuras', 'Bandai México', 780.00, 1399.00, 1299.00, 4],
            ['DEMO-FIG-003', 'Figura Nezuko Funko Pop! #1465', '7501234500097', 'Figuras', 'Importaciones Akiba', 250.00, 449.00, 399.00, 9],
            ['DEMO-FIG-004', 'Nendoroid Hatsune Miku', '7501234500103', 'Figuras', 'Importaciones Akiba', 900.00, 1599.00, 1499.00, 3],
            ['DEMO-MAN-001', 'Manga Chainsaw Man Tomo 1', '7501234500110', 'Mangas', 'Distribuidora Panini México', 89.00, 159.00, 145.00, 25],
            ['DEMO-MAN-002', 'Manga Jujutsu Kaisen Tomo 3', '7501234500127', 'Mangas', 'Distribuidora Panini México', 89.00, 159.00, 145.00, 18],
            ['DEMO-MAN-003', 'Manga One Piece Tomo 100', '7501234500134', 'Mangas', 'Distribuidora Panini México', 95.00, 169.00, 155.00, 12],
            ['DEMO-MAN-004', 'Manga Frieren Tomo 2', '7501234500141', 'Mangas', 'Distribuidora Panini México', 99.00, 179.00, 165.00, 10],
            ['DEMO-ACC-001', 'Playera Akatsuki talla M', '7501234500158', 'Accesorios', 'Importaciones Akiba', 140.00, 299.00, 269.00, 14],
            ['DEMO-ACC-002', 'Llavero Pikachu metálico', '7501234500165', 'Accesorios', 'Importaciones Akiba', 35.00, 89.00, 79.00, 50],
            ['DEMO-ACC-003', 'Taza Studio Ghibli Totoro', '7501234500172', 'Accesorios', 'Importaciones Akiba', 85.00, 189.00, 169.00, 20],
            ['DEMO-ACC-004', 'Mochila Kimetsu no Yaiba', '7501234500189', 'Accesorios', 'Importaciones Akiba', 320.00, 599.00, 549.00, 7],
            ['DEMO-COL-001', 'Álbum coleccionador TCG Pokémon', '7501234500196', 'Coleccionables', 'Importaciones Akiba', 150.00, 299.00, 279.00, 11],
            ['DEMO-COL-002', 'Protectores de cartas x100', '7501234500202', 'Coleccionables', 'Importaciones Akiba', 60.00, 129.00, 119.00, 35],
        ];

        $products = [];
        foreach ($catalog as [$sku, $name, $barcode, $cat, $sup, $cost, $p1, $p2, $stock]) {
            $product = Product::updateOrCreate(
                ['sku' => $sku],
                [
                    'name' => $name, 'barcode' => $barcode,
                    'category_id' => $cats[$cat]->id, 'supplier_id' => $sups[$sup]->id,
                    'cost' => $cost, 'active' => true, 'product_type' => 'product',
                ],
            );
            $product->syncCategories([$cats[$cat]->id]); // pivote (categorías múltiples)
            $product->price()->updateOrCreate([], ['price_1' => $p1, 'price_2' => $p2]);

            Inventory::updateOrCreate(
                ['product_id' => $product->id, 'warehouse_id' => $exhib1->id],
                ['quantity' => $stock],
            );

            $products[$sku] = $product;
        }

        // Backstock en Bodega T1 y algo de stock en Tienda 2 (deterministas).
        foreach (['DEMO-ELE-003' => 20, 'DEMO-ELE-004' => 25, 'DEMO-MAN-001' => 30, 'DEMO-ACC-002' => 40, 'DEMO-COL-002' => 15] as $sku => $qty) {
            Inventory::updateOrCreate(
                ['product_id' => $products[$sku]->id, 'warehouse_id' => $bodega1->id],
                ['quantity' => $qty],
            );
        }
        foreach (['DEMO-ELE-001' => 5, 'DEMO-ELE-005' => 6, 'DEMO-FIG-001' => 2, 'DEMO-FIG-003' => 4, 'DEMO-MAN-001' => 10, 'DEMO-MAN-002' => 8, 'DEMO-ACC-002' => 20, 'DEMO-ACC-003' => 9] as $sku => $qty) {
            Inventory::updateOrCreate(
                ['product_id' => $products[$sku]->id, 'warehouse_id' => $exhib2->id],
                ['quantity' => $qty],
            );
        }

        // ── 2 productos SIN costo (cost NULL) ─────────────────────────────────
        // Alimentan el modal "Productos sin Costo" de /products (docs). Regla
        // real del negocio: cost NULL = bloqueado para venta — NO usarlos en
        // escenas de Caja.
        $sinCosto = [
            ['DEMO-SIN-001', 'Póster Attack on Titan 60×90', '7501234500219', 'Coleccionables', 'Importaciones Akiba', 149.00, 129.00, 8],
            ['DEMO-SIN-002', 'Sticker pack Anime Mix x50', '7501234500226', 'Accesorios', 'Importaciones Akiba', 99.00, 89.00, 16],
        ];
        foreach ($sinCosto as [$sku, $name, $barcode, $cat, $sup, $p1, $p2, $stock]) {
            $product = Product::updateOrCreate(
                ['sku' => $sku],
                [
                    'name' => $name, 'barcode' => $barcode,
                    'category_id' => $cats[$cat]->id, 'supplier_id' => $sups[$sup]->id,
                    'cost' => null, 'active' => true, 'product_type' => 'product',
                ],
            );
            $product->syncCategories([$cats[$cat]->id]); // pivote (categorías múltiples)
            $product->price()->updateOrCreate([], ['price_1' => $p1, 'price_2' => $p2]);
            Inventory::updateOrCreate(
                ['product_id' => $product->id, 'warehouse_id' => $exhib1->id],
                ['quantity' => $stock],
            );
        }

        // ── Promociones: 2 NxM activas + 1 mayoreo ────────────────────────────
        ProductPromotion::updateOrCreate(
            ['product_id' => $products['DEMO-ACC-002']->id, 'name' => '2x1 Llaveros Pikachu'],
            [
                'type' => 'nxm', 'buy_n' => 2, 'pay_m' => 1,
                'status' => 'active', 'priority' => 0, 'store_id' => null,
            ],
        );
        ProductPromotion::updateOrCreate(
            ['product_id' => $products['DEMO-MAN-001']->id, 'name' => '3x2 Chainsaw Man'],
            [
                'type' => 'nxm', 'buy_n' => 3, 'pay_m' => 2,
                'status' => 'active', 'priority' => 0, 'store_id' => null,
            ],
        );
        ProductPromotion::updateOrCreate(
            ['product_id' => $products['DEMO-ELE-004']->id, 'name' => 'Mayoreo cables 5+'],
            [
                'type' => 'qty_discount', 'min_qty' => 5, 'discount_per_unit' => 20.00,
                'status' => 'active', 'priority' => 0, 'store_id' => null,
            ],
        );

        // ── Clientes (uno socio Tadaima con external_member_id ficticio) ──────
        $carlos = Customer::updateOrCreate(
            ['email' => 'carlos.demo@tadaima.mx'],
            ['name' => 'Carlos Mendoza', 'phone' => '6641112233', 'loyalty_tier' => 'Bronce'],
        );
        $ana = Customer::updateOrCreate(
            ['email' => 'ana.demo@tadaima.mx'],
            [
                'name' => 'Ana Sofía Rivera', 'phone' => '6642223344',
                'external_member_id' => 'TDM-DEMO-0001', 'loyalty_tier' => 'Oro',
                'member_status' => 'activo', 'member_level' => 'b',
            ],
        );
        Customer::updateOrCreate(
            ['email' => 'luis.demo@tadaima.mx'],
            ['name' => 'Luis Hernández', 'phone' => '6643334455'],
        );

        // ── Preventa: 1 catálogo publicado + 2 folios de ejemplo ──────────────
        $preCatalog = PreSaleCatalog::updateOrCreate(
            ['product_name' => 'Figura Vegeta Ultra Ego — Preventa Diciembre'],
            [
                'category_id' => $cats['Figuras']->id,
                'supplier_id' => $sups['Bandai México']->id,
                'created_by' => $admin->id,
                'cost' => 950.00, 'price_1' => 1699.00,
                'advance_payment' => 300.00,
                'preorder_limit' => 20, 'limit_per_customer' => 2,
                'arrival_date' => '2026-12-15', 'pickup_deadline' => '2026-12-31',
                'status' => 'published',
            ],
        );
        foreach ([$tienda1->id, $tienda2->id] as $storeId) {
            PreSaleCatalogStoreLimit::updateOrCreate(
                ['catalog_id' => $preCatalog->id, 'store_id' => $storeId],
                ['limit_qty' => 10],
            );
        }

        $folios = [
            ['DEMO-FOLIO-1', $carlos->id, 1],
            ['DEMO-FOLIO-2', $ana->id, 2],
        ];
        foreach ($folios as [$marker, $customerId, $qty]) {
            $order = PreSaleOrder::firstOrCreate(
                ['notes' => $marker],
                [
                    'code' => 'DEMO-TMP-'.$marker,
                    'store_id' => $tienda1->id, 'user_id' => $cajero->id,
                    'customer_id' => $customerId, 'status' => 'pending',
                    'pickup_deadline' => '2026-12-31',
                ],
            );
            if (str_starts_with($order->code, 'DEMO-TMP-')) {
                // Mismo formato que PreSaleOrderService: PREV-00001.
                $order->update(['code' => 'PREV-'.str_pad((string) $order->id, 5, '0', STR_PAD_LEFT)]);
            }
            if ($order->wasRecentlyCreated) {
                PreSaleOrderItem::create([
                    'pre_sale_order_id' => $order->id,
                    'pre_sale_catalog_id' => $preCatalog->id,
                    'quantity' => $qty, 'price_level' => 1,
                    'unit_price' => 1699.00, 'cost' => 950.00,
                    'status' => 'pending',
                ]);
                PreSaleOrderPayment::create([
                    'pre_sale_order_id' => $order->id,
                    'amount' => 300.00 * $qty,
                    'payment_method_id' => $pm['Efectivo']->id,
                    'cashier_id' => $cajero->id,
                    'notes' => 'Anticipo demo',
                ]);
            }
        }

        // ── Historial: 1 corte cerrado (2026-08-01) con 5 ventas ──────────────
        // Patrón lean de CashCutUsdSplitTest: Sale/SaleItem/Payment directos —
        // sin pasar por checkout (no toca inventario; el stock ya quedó fijado).
        $this->seedClosedSessionWithSales($caja1, $cajero, $tienda1, $terminal1, $pm, $products);
    }

    /**
     * Crea (una sola vez) un corte cerrado del 2026-08-01 con 5 ventas
     * deterministas. La clave natural es (register, user, opened_at).
     *
     * @param  array<string, PaymentMethod>  $pm
     * @param  array<string, Product>  $products
     */
    private function seedClosedSessionWithSales(
        CashRegister $register,
        User $cajero,
        Store $store,
        Terminal $terminal,
        array $pm,
        array $products,
    ): void {
        $session = CashRegisterSession::firstOrCreate(
            [
                'register_id' => $register->id,
                'user_id' => $cajero->id,
                'opened_at' => '2026-08-01 09:00:00',
            ],
            [
                'closed_at' => '2026-08-01 20:00:00', 'local_date' => '2026-08-01',
                'opening_cash' => 1000.00, 'closing_cash' => 3034.00,
                'status' => 'closed',
            ],
        );

        if (! $session->wasRecentlyCreated) {
            return; // Las 5 ventas ya existen — no duplicar.
        }

        // [hora, [[sku, qty, precio], …], método, terminal?]
        $history = [
            ['2026-08-01 10:15:00', [['DEMO-ELE-001', 1, 1299.00]], 'Efectivo', null],
            ['2026-08-01 11:40:00', [['DEMO-MAN-001', 3, 159.00]], 'Efectivo', null],
            ['2026-08-01 13:05:00', [['DEMO-FIG-003', 1, 449.00], ['DEMO-ACC-003', 1, 189.00]], 'Tarjeta Débito', $terminal],
            ['2026-08-01 16:20:00', [['DEMO-ELE-004', 2, 129.00]], 'Efectivo', null],
            ['2026-08-01 18:45:00', [['DEMO-ELE-005', 1, 399.00], ['DEMO-ELE-003', 1, 249.00]], 'Transferencia', null],
        ];

        foreach ($history as [$soldAt, $lines, $method, $saleTerminal]) {
            $subtotal = 0.0;
            foreach ($lines as [$sku, $qty, $price]) {
                $subtotal += $qty * $price;
            }

            $isCard = $saleTerminal !== null;
            $commission = $isCard
                ? round($subtotal * ((float) $saleTerminal->commission_percent) / 100, 2)
                : 0.0;

            $sale = new Sale([
                'store_id' => $store->id,
                'register_session_id' => $session->id,
                'user_id' => $cajero->id,
                'terminal_id' => $saleTerminal?->id,
                'subtotal' => $subtotal, 'discount' => 0, 'total' => $subtotal,
                'commission_amount' => $commission,
                'status' => 'completed',
            ]);
            $sale->sold_at = $soldAt;
            $sale->created_at = $soldAt;
            $sale->save();

            foreach ($lines as [$sku, $qty, $price]) {
                $product = $products[$sku];
                SaleItem::create([
                    'sale_id' => $sale->id,
                    'product_id' => $product->id,
                    'quantity' => $qty, 'price' => $price,
                    'total' => $qty * $price,
                    'cost' => $product->cost, // snapshot ADR-015
                    'discount_amount' => 0,
                ]);
            }

            Payment::create([
                'sale_id' => $sale->id,
                'payment_method_id' => $pm[$method]->id,
                'terminal_id' => $saleTerminal?->id,
                'amount' => $subtotal,
                'commission_amount' => $commission,
            ]);
        }
    }

    /**
     * Asegura un usuario con email+password EXACTOS y su rol (sync).
     * No re-hashea el password si ya es válido (idempotencia real).
     *
     * @param  array<string, mixed>  $attrs
     */
    private function ensureUser(string $email, string $plainPassword, array $attrs, int $roleId): User
    {
        $user = User::where('email', $email)->first();

        if (! $user) {
            $user = User::create(array_merge($attrs, [
                'email' => $email,
                'password' => $plainPassword, // cast 'hashed' del modelo
            ]));
        } else {
            $user->fill($attrs);
            if (! Hash::check($plainPassword, $user->password)) {
                $user->password = $plainPassword;
            }
            $user->save();
        }

        // Sync de rol (mismo modelo que User::getRolesAttribute — sin Spatie).
        DB::table('model_has_roles')
            ->where('model_type', 'App\Models\User')
            ->where('model_id', $user->id)
            ->delete();
        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => 'App\Models\User', 'model_id' => $user->id,
        ]);

        return $user;
    }
}
