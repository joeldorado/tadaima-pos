<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CashRegisterSession;
use App\Models\Inventory;
use App\Models\Sale;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportsController extends Controller
{
    // ─── Sales ────────────────────────────────────────────────────────────────

    /**
     * GET /reports/sales
     * Filters: from (date), to (date), store_id, user_id
     *
     * Returns summary totals, breakdown by payment method, and daily trend.
     */
    public function sales(Request $request): JsonResponse
    {
        $from    = $request->input('from', now()->startOfMonth()->toDateString());
        $to      = $request->input('to',   now()->toDateString());
        $storeId = $request->integer('store_id') ?: null;
        $userId  = $request->integer('user_id')  ?: null;

        $base = Sale::query()
            ->where('status', Sale::STATUS_COMPLETED)
            ->whereDate('sold_at', '>=', $from)
            ->whereDate('sold_at', '<=', $to)
            ->when($storeId, fn ($q) => $q->where('store_id', $storeId))
            ->when($userId,  fn ($q) => $q->where('user_id',  $userId));

        // ── Summary ───────────────────────────────────────────────────────────
        $summary = (clone $base)->selectRaw(
            'COUNT(*) as total_count,
             COALESCE(SUM(total), 0) as total_revenue,
             COALESCE(SUM(discount), 0) as total_discount,
             COALESCE(SUM(commission_amount), 0) as total_commission'
        )->first();

        // ── By payment method ─────────────────────────────────────────────────
        $byPaymentMethod = DB::table('payments')
            ->join('sales', 'sales.id', '=', 'payments.sale_id')
            ->join('payment_methods', 'payment_methods.id', '=', 'payments.payment_method_id')
            ->where('sales.status', Sale::STATUS_COMPLETED)
            ->whereDate('sales.sold_at', '>=', $from)
            ->whereDate('sales.sold_at', '<=', $to)
            ->when($storeId, fn ($q) => $q->where('sales.store_id', $storeId))
            ->when($userId,  fn ($q) => $q->where('sales.user_id',  $userId))
            ->selectRaw('payment_methods.name as payment_method, COUNT(DISTINCT payments.sale_id) as count, COALESCE(SUM(payments.amount), 0) as amount')
            ->groupBy('payment_methods.id', 'payment_methods.name')
            ->orderByDesc('amount')
            ->get();

        // ── Daily breakdown ───────────────────────────────────────────────────
        $byDay = (clone $base)->selectRaw(
            "date(sold_at) as date, COUNT(*) as count, COALESCE(SUM(total), 0) as amount"
        )->groupByRaw('date(sold_at)')
         ->orderBy('date')
         ->get();

        // ── By store (only when no store filter) ──────────────────────────────
        $byStore = null;
        if (!$storeId) {
            $byStore = (clone $base)
                ->join('stores', 'stores.id', '=', 'sales.store_id')
                ->selectRaw('stores.id as store_id, stores.name as store, COUNT(*) as count, COALESCE(SUM(sales.total), 0) as amount')
                ->groupBy('stores.id', 'stores.name')
                ->orderByDesc('amount')
                ->get();
        }

        // ── Pre-sale payments (esquema nuevo) ───────────────────────────────
        $preSaleSummary = DB::table('pre_sale_order_payments')
            ->join('pre_sale_orders', 'pre_sale_orders.id', '=', 'pre_sale_order_payments.pre_sale_order_id')
            ->whereDate('pre_sale_order_payments.created_at', '>=', $from)
            ->whereDate('pre_sale_order_payments.created_at', '<=', $to)
            ->when($storeId, fn ($q) => $q->where('pre_sale_orders.store_id', $storeId))
            ->selectRaw('COUNT(*) as total_count, COALESCE(SUM(pre_sale_order_payments.amount), 0) as total_amount')
            ->first();

        $preSaleByDay = DB::table('pre_sale_order_payments')
            ->join('pre_sale_orders', 'pre_sale_orders.id', '=', 'pre_sale_order_payments.pre_sale_order_id')
            ->whereDate('pre_sale_order_payments.created_at', '>=', $from)
            ->whereDate('pre_sale_order_payments.created_at', '<=', $to)
            ->when($storeId, fn ($q) => $q->where('pre_sale_orders.store_id', $storeId))
            ->selectRaw("date(pre_sale_order_payments.created_at) as date, COUNT(*) as count, COALESCE(SUM(pre_sale_order_payments.amount), 0) as amount")
            ->groupByRaw('date(pre_sale_order_payments.created_at)')
            ->orderBy('date')
            ->get();

        return $this->success([
            'period'  => ['from' => $from, 'to' => $to],
            'summary' => [
                'total_count'      => (int) $summary->total_count,
                'total_revenue'    => round((float) $summary->total_revenue, 2),
                'total_discount'   => round((float) $summary->total_discount, 2),
                'total_commission' => round((float) $summary->total_commission, 2),
            ],
            'pre_sale_summary' => [
                'total_count'  => (int) $preSaleSummary->total_count,
                'total_amount' => round((float) $preSaleSummary->total_amount, 2),
            ],
            'by_payment_method' => $byPaymentMethod->map(fn ($r) => [
                'payment_method' => $r->payment_method,
                'count'          => (int) $r->count,
                'amount'         => round((float) $r->amount, 2),
            ]),
            'by_day' => $byDay->map(fn ($r) => [
                'date'   => $r->date,
                'count'  => (int) $r->count,
                'amount' => round((float) $r->amount, 2),
            ]),
            'pre_sale_by_day' => $preSaleByDay->map(fn ($r) => [
                'date'   => $r->date,
                'count'  => (int) $r->count,
                'amount' => round((float) $r->amount, 2),
            ]),
            'by_store' => $byStore?->map(fn ($r) => [
                'store_id' => $r->store_id,
                'store'    => $r->store,
                'count'    => (int) $r->count,
                'amount'   => round((float) $r->amount, 2),
            ]),
        ]);
    }

    // ─── Inventory ────────────────────────────────────────────────────────────

    /**
     * GET /reports/inventory
     * Filters: warehouse_id, store_id, low_stock (boolean), threshold (default 5)
     *
     * Returns current stock levels. If low_stock=true, only items at or below threshold.
     */
    public function inventory(Request $request): JsonResponse
    {
        $warehouseId = $request->integer('warehouse_id') ?: null;
        $storeId     = $request->integer('store_id')     ?: null;
        $lowStock    = filter_var($request->input('low_stock', false), FILTER_VALIDATE_BOOLEAN);
        $threshold   = (float) ($request->input('threshold', 5));

        $rows = DB::table('inventory')
            ->join('products',   'products.id',   '=', 'inventory.product_id')
            ->join('warehouses', 'warehouses.id', '=', 'inventory.warehouse_id')
            ->leftJoin('stores', 'stores.id', '=', 'warehouses.store_id')
            ->when($warehouseId, fn ($q) => $q->where('inventory.warehouse_id', $warehouseId))
            ->when($storeId,     fn ($q) => $q->where('warehouses.store_id', $storeId))
            ->when($lowStock,    fn ($q) => $q->where('inventory.quantity', '<=', $threshold))
            ->select([
                'inventory.id',
                'inventory.product_id',
                'products.name as product_name',
                'products.sku  as product_sku',
                'inventory.warehouse_id',
                'warehouses.name as warehouse_name',
                'stores.name as store_name',
                'inventory.quantity',
            ])
            ->orderBy('products.name')
            ->orderBy('warehouses.name')
            ->get();

        $totals = [
            'total_skus'     => $rows->count(),
            'total_quantity' => round($rows->sum('quantity'), 2),
        ];

        return $this->success([
            'filters' => [
                'warehouse_id' => $warehouseId,
                'store_id'     => $storeId,
                'low_stock'    => $lowStock,
                'threshold'    => $threshold,
            ],
            'summary' => $totals,
            'data'    => $rows->map(fn ($r) => [
                'product'   => ['id' => $r->product_id, 'name' => $r->product_name, 'sku' => $r->product_sku],
                'warehouse' => ['id' => $r->warehouse_id, 'name' => $r->warehouse_name, 'store' => $r->store_name],
                'quantity'  => (float) $r->quantity,
            ]),
        ]);
    }

    // ─── Cash ─────────────────────────────────────────────────────────────────

    /**
     * GET /reports/cash
     * Filters: from (date), to (date), store_id, register_id
     *
     * Returns cash sessions with movement totals and expected closing balance.
     */
    public function cash(Request $request): JsonResponse
    {
        $from       = $request->input('from', now()->startOfMonth()->toDateString());
        $to         = $request->input('to',   now()->toDateString());
        $storeId    = $request->integer('store_id')    ?: null;
        $registerId = $request->integer('register_id') ?: null;

        $sessions = CashRegisterSession::with(['register.store', 'user'])
            ->whereDate('opened_at', '>=', $from)
            ->whereDate('opened_at', '<=', $to)
            ->when($registerId, fn ($q) => $q->where('register_id', $registerId))
            ->when($storeId, fn ($q) => $q->whereHas('register', fn ($r) => $r->where('store_id', $storeId)))
            ->orderByDesc('opened_at')
            ->get();

        // For each session, fetch movement totals and sales totals
        $sessionIds = $sessions->pluck('id');

        $movementTotals = DB::table('cash_movements')
            ->whereIn('register_session_id', $sessionIds)
            ->selectRaw('register_session_id, type, COALESCE(SUM(amount), 0) as total')
            ->groupBy('register_session_id', 'type')
            ->get()
            ->groupBy('register_session_id');

        $saleTotals = DB::table('sales')
            ->whereIn('register_session_id', $sessionIds)
            ->where('status', Sale::STATUS_COMPLETED)
            ->selectRaw('register_session_id, COUNT(*) as count, COALESCE(SUM(total), 0) as amount')
            ->groupBy('register_session_id')
            ->get()
            ->keyBy('register_session_id');

        $data = $sessions->map(function ($s) use ($movementTotals, $saleTotals) {
            $movements = $movementTotals->get($s->id, collect());
            $entradas  = (float) ($movements->firstWhere('type', 'entrada')?->total ?? 0);
            $salidas   = (float) ($movements->firstWhere('type', 'salida')?->total ?? 0);
            $ajustes   = (float) ($movements->firstWhere('type', 'ajuste')?->total ?? 0);
            $sales     = $saleTotals->get($s->id);
            $salesAmt  = (float) ($sales?->amount ?? 0);
            $salesCnt  = (int)   ($sales?->count  ?? 0);

            $expected = round($s->opening_cash + $entradas - $salidas + $ajustes + $salesAmt, 2);

            return [
                'id'              => $s->id,
                'register'        => ['id' => $s->register->id, 'name' => $s->register->name],
                'store'           => $s->register->store ? ['id' => $s->register->store->id, 'name' => $s->register->store->name] : null,
                'user'            => ['id' => $s->user->id, 'name' => $s->user->name],
                'status'          => $s->status,
                'opened_at'       => $s->opened_at?->toISOString(),
                'closed_at'       => $s->closed_at?->toISOString(),
                'opening_cash'    => (float) $s->opening_cash,
                'closing_cash'    => $s->closing_cash !== null ? (float) $s->closing_cash : null,
                'total_entradas'  => $entradas,
                'total_salidas'   => $salidas,
                'total_ajustes'   => $ajustes,
                'total_sales'     => $salesAmt,
                'sales_count'     => $salesCnt,
                'expected_cash'   => $expected,
                'difference'      => $s->closing_cash !== null ? round((float) $s->closing_cash - $expected, 2) : null,
            ];
        });

        $summary = [
            'total_sessions'  => $data->count(),
            'total_sales'     => round($data->sum('total_sales'), 2),
            'total_entradas'  => round($data->sum('total_entradas'), 2),
            'total_salidas'   => round($data->sum('total_salidas'), 2),
        ];

        return $this->success([
            'period'   => ['from' => $from, 'to' => $to],
            'summary'  => $summary,
            'sessions' => $data,
        ]);
    }

    // ─── Top Products ─────────────────────────────────────────────────────────

    /**
     * GET /reports/top-products
     * Filters: from (date), to (date), store_id, limit (default 20, max 100)
     *
     * Returns most sold products by quantity and revenue.
     * Covers both products (product_id) and mangas (manga_id).
     */
    public function topProducts(Request $request): JsonResponse
    {
        $from    = $request->input('from', now()->startOfMonth()->toDateString());
        $to      = $request->input('to',   now()->toDateString());
        $storeId = $request->integer('store_id') ?: null;
        $limit   = min((int) ($request->input('limit', 20)), 100);

        // Products
        $products = DB::table('sale_items')
            ->join('sales',    'sales.id',    '=', 'sale_items.sale_id')
            ->join('products', 'products.id', '=', 'sale_items.product_id')
            ->where('sales.status', Sale::STATUS_COMPLETED)
            ->whereDate('sales.sold_at', '>=', $from)
            ->whereDate('sales.sold_at', '<=', $to)
            ->whereNotNull('sale_items.product_id')
            ->when($storeId, fn ($q) => $q->where('sales.store_id', $storeId))
            ->selectRaw('
                sale_items.product_id as id,
                products.name,
                products.sku,
                "product" as type,
                COUNT(DISTINCT sale_items.sale_id) as times_sold,
                COALESCE(SUM(sale_items.quantity), 0) as total_quantity,
                COALESCE(SUM(sale_items.total), 0) as total_revenue
            ')
            ->groupBy('sale_items.product_id', 'products.name', 'products.sku')
            ->get();

        // Mangas
        $mangas = DB::table('sale_items')
            ->join('sales',  'sales.id',  '=', 'sale_items.sale_id')
            ->join('mangas', 'mangas.id', '=', 'sale_items.manga_id')
            ->where('sales.status', Sale::STATUS_COMPLETED)
            ->whereDate('sales.sold_at', '>=', $from)
            ->whereDate('sales.sold_at', '<=', $to)
            ->whereNotNull('sale_items.manga_id')
            ->when($storeId, fn ($q) => $q->where('sales.store_id', $storeId))
            ->selectRaw('
                sale_items.manga_id as id,
                mangas.name,
                mangas.code as sku,
                "manga" as type,
                COUNT(DISTINCT sale_items.sale_id) as times_sold,
                COALESCE(SUM(sale_items.quantity), 0) as total_quantity,
                COALESCE(SUM(sale_items.total), 0) as total_revenue
            ')
            ->groupBy('sale_items.manga_id', 'mangas.name', 'mangas.code')
            ->get();

        $combined = $products->concat($mangas)
            ->sortByDesc('total_quantity')
            ->take($limit)
            ->values();

        return $this->success([
            'period' => ['from' => $from, 'to' => $to],
            'data'   => $combined->map(fn ($r) => [
                'id'             => $r->id,
                'name'           => $r->name,
                'sku'            => $r->sku,
                'type'           => $r->type,
                'times_sold'     => (int)   $r->times_sold,
                'total_quantity' => round((float) $r->total_quantity, 2),
                'total_revenue'  => round((float) $r->total_revenue,  2),
            ]),
        ]);
    }

    // ─── Customers ────────────────────────────────────────────────────────────

    /**
     * GET /reports/customers
     * Filters: from (date), to (date), store_id, limit (default 20, max 100)
     *
     * Returns top customers by spend. Also shows current credit balance.
     */
    public function customers(Request $request): JsonResponse
    {
        $from    = $request->input('from', now()->startOfMonth()->toDateString());
        $to      = $request->input('to',   now()->toDateString());
        $storeId = $request->integer('store_id') ?: null;
        $limit   = min((int) ($request->input('limit', 20)), 100);

        $rows = DB::table('sales')
            ->join('customers', 'customers.id', '=', 'sales.customer_id')
            ->where('sales.status', Sale::STATUS_COMPLETED)
            ->whereDate('sales.sold_at', '>=', $from)
            ->whereDate('sales.sold_at', '<=', $to)
            ->whereNotNull('sales.customer_id')
            ->when($storeId, fn ($q) => $q->where('sales.store_id', $storeId))
            ->selectRaw('
                customers.id,
                customers.name,
                customers.phone,
                COUNT(*) as total_purchases,
                COALESCE(SUM(sales.total), 0) as total_spent
            ')
            ->groupBy('customers.id', 'customers.name', 'customers.phone')
            ->orderByDesc('total_spent')
            ->limit($limit)
            ->get();

        // Attach current credit balances
        $customerIds = $rows->pluck('id');
        $credits = DB::table('customer_credit')
            ->whereIn('customer_id', $customerIds)
            ->selectRaw('customer_id, COALESCE(SUM(amount), 0) as balance')
            ->groupBy('customer_id')
            ->get()
            ->keyBy('customer_id');

        return $this->success([
            'period' => ['from' => $from, 'to' => $to],
            'data'   => $rows->map(fn ($r) => [
                'id'              => $r->id,
                'name'            => $r->name,
                'phone'           => $r->phone,
                'total_purchases' => (int)   $r->total_purchases,
                'total_spent'     => round((float) $r->total_spent, 2),
                'credit_balance'  => round((float) ($credits->get($r->id)?->balance ?? 0), 2),
            ]),
        ]);
    }

    // ─── Pre-sales ────────────────────────────────────────────────────────────

    /**
     * GET /reports/pre-sales
     * Filters: from, to, store_id
     *
     * Returns totals (orders, collected, pending) and daily breakdown.
     * UNIONs legacy pre_sale_payments + new pre_sale_order_payments.
     */
    public function preSales(Request $request): JsonResponse
    {
        $from    = $request->input('from', now()->startOfMonth()->toDateString());
        $to      = $request->input('to',   now()->toDateString());
        $storeId = $request->integer('store_id') ?: null;

        // New schema — total revenue from items, collected from payments
        $newOrders = DB::table('pre_sale_orders')
            ->whereDate('pre_sale_orders.created_at', '>=', $from)
            ->whereDate('pre_sale_orders.created_at', '<=', $to)
            ->when($storeId, fn ($q) => $q->where('pre_sale_orders.store_id', $storeId))
            ->count();

        $newRevenue = DB::table('pre_sale_order_items')
            ->join('pre_sale_orders', 'pre_sale_orders.id', '=', 'pre_sale_order_items.pre_sale_order_id')
            ->whereDate('pre_sale_orders.created_at', '>=', $from)
            ->whereDate('pre_sale_orders.created_at', '<=', $to)
            ->when($storeId, fn ($q) => $q->where('pre_sale_orders.store_id', $storeId))
            ->sum(DB::raw('pre_sale_order_items.quantity * pre_sale_order_items.unit_price'));

        $newCollected = DB::table('pre_sale_order_payments')
            ->join('pre_sale_orders', 'pre_sale_orders.id', '=', 'pre_sale_order_payments.pre_sale_order_id')
            ->whereDate('pre_sale_order_payments.created_at', '>=', $from)
            ->whereDate('pre_sale_order_payments.created_at', '<=', $to)
            ->when($storeId, fn ($q) => $q->where('pre_sale_orders.store_id', $storeId))
            ->sum('pre_sale_order_payments.amount');

        // Daily breakdown (esquema nuevo)
        $daily = DB::table('pre_sale_order_payments')
            ->join('pre_sale_orders', 'pre_sale_orders.id', '=', 'pre_sale_order_payments.pre_sale_order_id')
            ->whereDate('pre_sale_order_payments.created_at', '>=', $from)
            ->whereDate('pre_sale_order_payments.created_at', '<=', $to)
            ->when($storeId, fn ($q) => $q->where('pre_sale_orders.store_id', $storeId))
            ->selectRaw('DATE(pre_sale_order_payments.created_at) as day, SUM(pre_sale_order_payments.amount) as collected')
            ->groupBy(DB::raw('DATE(pre_sale_order_payments.created_at)'))
            ->orderBy('day')
            ->get();

        return $this->success([
            'period'  => ['from' => $from, 'to' => $to],
            'summary' => [
                'total_orders'    => $newOrders,
                'total_revenue'   => round((float) $newRevenue, 2),
                'total_collected' => round((float) $newCollected, 2),
                'total_pending'   => round((float) ($newRevenue - $newCollected), 2),
            ],
            'daily'   => $daily->map(fn ($r) => [
                'day'       => $r->day,
                'collected' => round((float) $r->collected, 2),
            ]),
        ]);
    }
}
