<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ExternalCardController;
use App\Http\Controllers\Api\LoyaltyController;
use App\Http\Controllers\Api\NotificationsController;
use App\Http\Controllers\Api\CashRegisterController;
use App\Http\Controllers\Api\CatalogController;
use App\Http\Controllers\Api\CompanyController;
use App\Http\Controllers\Api\SystemLogController;
use App\Http\Controllers\Api\SystemSettingController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\MangaController;
use App\Http\Controllers\Api\MangaInventoryController;
use App\Http\Controllers\Api\ReportsController;
use App\Http\Controllers\Api\TransferController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\LayawayController;
use App\Http\Controllers\Api\PaymentMethodController;
use App\Http\Controllers\Api\PreSaleCatalogsController;
use App\Http\Controllers\Api\PreSaleOrdersController;
use App\Http\Controllers\Api\ProductCategoryController;
use App\Http\Controllers\Api\SuppliersController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\ProductPromotionsController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\SalesDraftController;
use App\Http\Controllers\Api\SaleCancellationsController;
use App\Http\Controllers\Api\SalesController;
use App\Http\Controllers\Api\StoreController;
use App\Http\Controllers\Api\SuppliesController;
use App\Http\Controllers\Api\TerminalController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\WarehouseController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes — Tadaima POS
| Base URL: /api/v1  (configurado en bootstrap/app.php)
|--------------------------------------------------------------------------
*/

// ── Auth (públicas — sin middleware) ──────────────────────────────────────────
Route::prefix('auth')->group(function () {
    Route::post('login',  [AuthController::class, 'login']);
    Route::post('logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');
    Route::get('me',      [AuthController::class, 'me'])->middleware('auth:sanctum');
    Route::post('password', [AuthController::class, 'changePassword'])->middleware('auth:sanctum');
});

// ── Catálogo público (sin auth) ───────────────────────────────────────────────
Route::get('public/catalog', [CatalogController::class, 'publicCatalogGlobal']);
Route::get('public/catalog/{catalogUrl}', [CatalogController::class, 'publicCatalog']);

// ── Rutas protegidas ──────────────────────────────────────────────────────────
// Rate limit por usuario (120 req/min) — amortigua polling/abuso sin estorbar al
// cajero (el carrito es client-side, ADR-014; el polling real ronda ~25/min/usuario).
Route::middleware(['auth:sanctum', 'throttle:120,1'])->group(function () {

    // ── Users ─────────────────────────────────────────────────────────────────
    Route::get('users/online',                  [UserController::class, 'online']);
    Route::apiResource('users', UserController::class);
    Route::post('users/{user}/roles',           [UserController::class, 'assignRole']);
    Route::delete('users/{user}/roles/{roleId}', [UserController::class, 'removeRole']);
    Route::post('users/{user}/avatar',          [UserController::class, 'uploadAvatar']);
    Route::put('users/{user}/avatar/external',  [UserController::class, 'setExternalAvatar']);
    Route::delete('users/{user}/avatar',        [UserController::class, 'removeAvatar']);

    // ── Roles & Permissions ───────────────────────────────────────────────────
    Route::get('permissions',                        [RoleController::class, 'permissions']);
    Route::get('roles',                              [RoleController::class, 'index']);
    Route::post('roles',                             [RoleController::class, 'store']);
    Route::put('roles/{role}',                       [RoleController::class, 'update']);
    Route::post('roles/{role}/permissions',          [RoleController::class, 'assignPermissions']);

    // ── Cash Register ─────────────────────────────────────────────────────────
    Route::prefix('cash')->group(function () {
        Route::get('registers',       [CashRegisterController::class, 'registers']);
        Route::get('session',         [CashRegisterController::class, 'session']);
        Route::get('active-sessions', [CashRegisterController::class, 'activeSessions']);
        Route::post('open',           [CashRegisterController::class, 'open']);
        Route::post('close',          [CashRegisterController::class, 'close']);
        Route::post('movements',      [CashRegisterController::class, 'addMovement']);
        Route::get('movements',       [CashRegisterController::class, 'movements']);
        // Solo admin: cierra una sesión colgada de OTRO usuario.
        Route::post('sessions/{session}/force-close', [CashRegisterController::class, 'forceClose']);
    });

    // ── Transfers ─────────────────────────────────────────────────────────────
    Route::prefix('transfers')->group(function () {
        Route::get('/',                        [TransferController::class, 'index']);
        Route::post('/',                       [TransferController::class, 'store']);
        Route::get('{transfer}',               [TransferController::class, 'show']);
        Route::get('{transfer}/items',         [TransferController::class, 'items']);
        Route::put('{transfer}/complete',      [TransferController::class, 'complete']);
        Route::put('{transfer}/cancel',        [TransferController::class, 'cancel']);
    });

    // ── Products ──────────────────────────────────────────────────────────────
    Route::apiResource('products', ProductController::class)->only([
        'index', 'show', 'store', 'update', 'destroy',
    ]);

    Route::prefix('products/{product}')->group(function () {
        Route::delete('force',                   [ProductController::class, 'forceDestroy']);
        // Images
        Route::post('images/upload',             [ProductController::class, 'uploadImage']);
        Route::post('images',                    [ProductController::class, 'addImage']);
        Route::delete('images/{image}',          [ProductController::class, 'removeImage']);
        Route::put('images/reorder',             [ProductController::class, 'reorderImages']);
        // Primera imagen en base64 (banner de promo: canvas necesita bytes
        // same-origin — la URL pública de GCS taintéa el canvas sin CORS).
        Route::get('image-base64',               [ProductController::class, 'imageBase64']);
        // Store prices
        Route::get('store-prices',               [ProductController::class, 'storePrices']);
        Route::put('store-prices/{store}',       [ProductController::class, 'updateStorePrices']);
        Route::delete('store-prices/{store}',    [ProductController::class, 'removeStorePrices']);
        // Promociones NxM (Descuentos v2 — Fase 3)
        Route::get('promotions',                 [ProductPromotionsController::class, 'index']);
        Route::post('promotions',                [ProductPromotionsController::class, 'store']);
        Route::put('promotions/{promotion}',     [ProductPromotionsController::class, 'update']);
        Route::delete('promotions/{promotion}',  [ProductPromotionsController::class, 'destroy']);
    });

    // ── Customers ─────────────────────────────────────────────────────────────
    Route::apiResource('customers', CustomerController::class);

    Route::prefix('customers/{customer}')->group(function () {
        Route::get('credit',  [CustomerController::class, 'credit']);
        Route::post('credit', [CustomerController::class, 'addCredit']);
        // Refresca el snapshot de socio Tadaima desde Supabase (solo lectura).
        Route::post('refresh-member', [CustomerController::class, 'refreshMember']);
    });

    // ── Sales Drafts ──────────────────────────────────────────────────────────
    Route::prefix('sales-drafts')->group(function () {
        Route::get('/',  [SalesDraftController::class, 'index']);
        Route::post('/', [SalesDraftController::class, 'store']);

        // ADR-014: client-authoritative cart. Endpoints de drafts en vivo
        // (reserved-stock, expiring, extend) quedan comentados. Solo se conserva
        // show/cancel para inspección admin y compat con código legacy. addItem/
        // updateItem/removeItem también comentados — el carrito vive en frontend.
        // Route::get('reserved-stock', [SalesDraftController::class, 'reservedStock']);
        // Route::get('expiring',       [SalesDraftController::class, 'expiring']);

        Route::prefix('{salesDraft}')->group(function () {
            Route::get('/',    [SalesDraftController::class, 'show']);
            Route::delete('/', [SalesDraftController::class, 'cancel']);
            // Route::post('extend', [SalesDraftController::class, 'extend']);
            // Route::post('items',                    [SalesDraftController::class, 'addItem']);
            // Route::put('items/{salesDraftItem}',    [SalesDraftController::class, 'updateItem']);
            // Route::delete('items/{salesDraftItem}', [SalesDraftController::class, 'removeItem']);
        });
    });

    // ── Pre-Sale Catalogs (nuevo esquema) ────────────────────────────────────
    Route::prefix('pre-sale-catalogs')->group(function () {
        Route::get('/',    [PreSaleCatalogsController::class, 'index']);
        Route::post('/',   [PreSaleCatalogsController::class, 'store']);

        Route::prefix('{id}')->group(function () {
            Route::get('/',              [PreSaleCatalogsController::class, 'show']);
            Route::get('customer-usage', [PreSaleCatalogsController::class, 'customerUsage']);
            Route::patch('/',            [PreSaleCatalogsController::class, 'update']);
            Route::patch('status',       [PreSaleCatalogsController::class, 'updateStatus']);
            Route::post('image',         [PreSaleCatalogsController::class, 'uploadImage']);
            Route::delete('image',       [PreSaleCatalogsController::class, 'removeImage']);
        });
    });

    // ── Pre-Sale Orders / Folios (nuevo esquema) ──────────────────────────────
    Route::prefix('pre-sale-orders')->group(function () {
        Route::get('/',    [PreSaleOrdersController::class, 'index']);
        Route::post('/',   [PreSaleOrdersController::class, 'store']);

        Route::prefix('{id}')->group(function () {
            Route::get('/',         [PreSaleOrdersController::class, 'show']);
            Route::post('payments', [PreSaleOrdersController::class, 'addPayment']);
            Route::patch('status',  [PreSaleOrdersController::class, 'updateStatus']);
            Route::patch('items/{itemId}/deliver', [PreSaleOrdersController::class, 'deliverItem']);
            // ADR-016
            Route::post('cancel',   [PreSaleOrdersController::class, 'cancel']);
        });
    });

    // ── Loyalty ───────────────────────────────────────────────────────────────
    Route::post('loyalty/award',                           [LoyaltyController::class, 'award']);
    Route::get('loyalty/customers/{customerId}/history',   [LoyaltyController::class, 'history']);

    // ── External card stub (replace with real Tadaima loyalty API) ───────────
    Route::get('external/card/{code}',  [ExternalCardController::class, 'lookup']);
    Route::get('external/customers',    [ExternalCardController::class, 'search']);
    Route::post('external/customer',    [ExternalCardController::class, 'register']);

    // ── Notifications ─────────────────────────────────────────────────────────
    Route::get('notifications',                    [NotificationsController::class, 'index']);
    Route::post('notifications/stock-alert',       [NotificationsController::class, 'storeStockAlert']);
    Route::post('notifications/presale-assign-alert', [NotificationsController::class, 'storePreSaleAssignAlert']);
    Route::patch('notifications/{id}/read',        [NotificationsController::class, 'markRead']);
    Route::delete('notifications/{id}',            [NotificationsController::class, 'destroy']);

    // ── Layaways (Apartados) ──────────────────────────────────────────────────
    Route::prefix('layaways')->group(function () {
        Route::get('/',  [LayawayController::class, 'index']);
        Route::post('/', [LayawayController::class, 'store']);
        Route::get('by-product/{productId}', [LayawayController::class, 'byProduct']);

        Route::prefix('{layaway}')->group(function () {
            Route::get('/',         [LayawayController::class, 'show']);
            Route::patch('/',       [LayawayController::class, 'update']);
            Route::patch('status',  [LayawayController::class, 'updateStatus']);
            Route::post('payments', [LayawayController::class, 'addPayment']);
            Route::get('payments',  [LayawayController::class, 'payments']);
        });
    });

    // ── Sales ─────────────────────────────────────────────────────────────────
    Route::apiResource('sales', SalesController::class)->only(['index', 'show', 'store']);
    Route::post('sales/{sale}/return', [SalesController::class, 'return']);
    // ADR-016 — cancelación con log + reverso a cash_movements
    Route::post('sales/{sale}/cancel', [SalesController::class, 'cancel']);
    // ADR-016 Fase 4 — lectura del log de cancelaciones
    Route::get('sale-cancellations', [SaleCancellationsController::class, 'index']);

    // ── Inventory ─────────────────────────────────────────────────────────────
    // IMPORTANTE: rutas fijas antes del patrón wildcard {productId}/{warehouseId}
    Route::prefix('inventory')->group(function () {
        Route::get('/',                         [InventoryController::class, 'index']);
        Route::get('movements',                 [InventoryController::class, 'movements']);
        Route::post('movements',                [InventoryController::class, 'storeMovement']);
        Route::post('move',                     [InventoryController::class, 'move']);
        Route::put('{productId}/{warehouseId}', [InventoryController::class, 'update']);
    });

    // ── Terminals ─────────────────────────────────────────────────────────────
    Route::apiResource('terminals', TerminalController::class)->only(['index', 'store', 'update', 'destroy']);

    // ── Payment Methods ───────────────────────────────────────────────────────
    Route::apiResource('payment-methods', PaymentMethodController::class)->only(['index', 'store', 'update']);

    // ── Stores ────────────────────────────────────────────────────────────────
    Route::apiResource('stores', StoreController::class)->only(['index', 'store', 'update']);
    Route::get('stores/{store}/payment-methods',  [StoreController::class, 'paymentMethods']);
    Route::post('stores/{store}/payment-methods', [StoreController::class, 'addPaymentMethod']);

    // ── Warehouses ────────────────────────────────────────────────────────────
    Route::apiResource('warehouses', WarehouseController::class)->only(['index', 'store', 'update', 'destroy']);

    // ── Companies ─────────────────────────────────────────────────────────────
    Route::apiResource('companies', CompanyController::class)->only(['index', 'store', 'update']);

    // ── Product Categories ────────────────────────────────────────────────────
    Route::apiResource('categories', ProductCategoryController::class)->only(['index', 'store', 'update', 'destroy']);

    // ── Suppliers ─────────────────────────────────────────────────────────────
    Route::apiResource('suppliers', SuppliersController::class)->only(['index', 'store', 'update', 'destroy']);

    // ── Mangas ────────────────────────────────────────────────────────────────
    Route::apiResource('mangas', MangaController::class)->only(['index', 'store', 'update', 'destroy']);
    Route::post('mangas/{manga}/image/upload', [MangaController::class, 'uploadImage']);

    // ── Manga Inventory ───────────────────────────────────────────────────────
    Route::get('manga-inventory',                                  [MangaInventoryController::class, 'index']);
    Route::put('manga-inventory/{mangaId}/{warehouseId}',          [MangaInventoryController::class, 'update']);

    // ── Reports ───────────────────────────────────────────────────────────────
    Route::prefix('reports')->group(function () {
        Route::get('sales',        [ReportsController::class, 'sales']);
        Route::get('inventory',    [ReportsController::class, 'inventory']);
        Route::get('cash',         [ReportsController::class, 'cash']);
        Route::get('cash/{session}/detail', [ReportsController::class, 'cashDetail']);
        Route::get('top-products', [ReportsController::class, 'topProducts']);
        Route::get('customers',    [ReportsController::class, 'customers']);
        Route::get('pre-sales',    [ReportsController::class, 'preSales']);
        Route::get('supplies',     [SuppliesController::class, 'report']);
    });

    // ── Catalog (admin) ───────────────────────────────────────────────────────
    Route::prefix('catalog')->group(function () {
        Route::get('settings/{store}',              [CatalogController::class, 'settings']);
        Route::put('settings/{store}',              [CatalogController::class, 'updateSettings']);
        Route::get('products/{store}',              [CatalogController::class, 'products']);
        Route::post('products/{store}',             [CatalogController::class, 'addProduct']);
        Route::put('products/{store}/{product}',    [CatalogController::class, 'updateProduct']);
        Route::delete('products/{store}/{product}', [CatalogController::class, 'removeProduct']);
        // Catálogo v3 — flags globales por producto (destacado / oculto).
        Route::get('product-flags',           [CatalogController::class, 'productFlags']);
        Route::put('product-flags/{product}', [CatalogController::class, 'updateProductFlags']);
    });

    // ── System Settings ───────────────────────────────────────────────────────
    Route::prefix('settings')->group(function () {
        Route::get('/',     [SystemSettingController::class, 'index']);
        Route::put('/',     [SystemSettingController::class, 'batchUpdate']);
        Route::get('{key}', [SystemSettingController::class, 'show']);
        Route::put('{key}', [SystemSettingController::class, 'update']);
    });

    // ── System Logs ───────────────────────────────────────────────────────────
    Route::prefix('logs')->group(function () {
        Route::get('/',  [SystemLogController::class, 'index']);
        Route::post('/', [SystemLogController::class, 'store']);
    });

    // ── Insumos (Fase 2) — catálogo + compras con efectivo de caja ────────────
    Route::prefix('supplies')->group(function () {
        Route::get('/',          [SuppliesController::class, 'index']);
        Route::post('/',         [SuppliesController::class, 'store']);
        Route::get('movements',  [SuppliesController::class, 'movements']);
        Route::post('movements', [SuppliesController::class, 'storeMovement']);
        Route::put('{supply}',   [SuppliesController::class, 'update']);
    });
});
