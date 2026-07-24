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
    /**
     * Scope de tienda por rol para reportes (QA roles 2026-06-10): admin filtra
     * libre por query string; gerente/cajero SIEMPRE quedan anclados a su
     * tienda (el store_id del request se ignora). Sin tienda asignada → -1
     * (no matchea nada, fail-closed). Solo /reports/cash tenía esto antes.
     */
    private function scopedStoreId(Request $request): ?int
    {
        $user = $request->user();
        if ($user && ! $user->isAdminRole()) {
            return $user->store_id ?? -1;
        }

        return $request->integer('store_id') ?: null;
    }

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
        $storeId = $this->scopedStoreId($request);
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
        $storeId     = $this->scopedStoreId($request);
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
        $userId     = $request->integer('user_id')     ?: null;

        $user      = $request->user();
        $isAdmin   = $user && $user->hasRole(['admin', 'super_admin', 'owner', 'dueño']);
        $isCashier = $user && $user->hasRole(['cajero']) && ! $isAdmin;

        // RBAC: cajero forzado a su user_id + tienda; gerente a su tienda;
        // admin libre. Filtros del request se ignoran si intentan ver más.
        if (! $isAdmin) {
            // Fail-closed: sin tienda asignada NO cae al filtro del request.
            $storeId = $user?->store_id ?? -1;
            if ($isCashier) {
                $userId = $user->id;
            }
        }

        // Rango en zona del NEGOCIO → UTC (mismo patrón que ventas). Antes
        // whereDate comparaba la fecha UTC del timestamp: una caja abierta a
        // las 7pm Tijuana (= 02:00 UTC del día sig.) se salía del filtro.
        $fromUtc = \App\Support\DateRange::fromUtc($from);
        $toUtc   = \App\Support\DateRange::toUtc($to);

        $sessions = CashRegisterSession::with(['register.store', 'user'])
            // Cortes con `local_date` (fecha del dispositivo del cajero,
            // mandada por la UI al cerrar — Joel 2026-06-11) se filtran por
            // ese día directo. Cortes sin la fecha (abiertos, legacy) caen al
            // TRASLAPE con la vida de la sesión: una caja puede abrir un día
            // y cerrar al siguiente — el corte sale en cualquier día que
            // toque su vida [opened_at, closed_at|ahora].
            ->when($fromUtc || $toUtc, fn ($q) => $q->where(fn ($outer) => $outer
                ->where(fn ($byDate) => $byDate
                    ->whereNotNull('local_date')
                    ->where('local_date', '>=', $from)
                    ->where('local_date', '<=', $to))
                ->orWhere(fn ($overlap) => $overlap
                    ->whereNull('local_date')
                    ->when($toUtc,   fn ($o) => $o->where('opened_at', '<=', $toUtc))
                    ->when($fromUtc, fn ($o) => $o->where(fn ($w) => $w
                        ->whereNull('closed_at')
                        ->orWhere('closed_at', '>=', $fromUtc))))))
            ->when($registerId, fn ($q) => $q->where('register_id', $registerId))
            ->when($userId,     fn ($q) => $q->where('user_id',     $userId))
            ->when($storeId, fn ($q) => $q->whereHas('register', fn ($r) => $r->where('store_id', $storeId)))
            ->orderByDesc('opened_at')
            ->get();

        // Para cada sesión calculamos:
        //  - ventas totales (referencia operativa, incluye tarjeta)
        //  - cobros que SÍ entraron físicamente a caja (solo efectivo/dólares)
        //  - anticipos/liquidaciones de preventa en la ventana del corte
        // El descuadre se basa solo en dinero físico. Antes `expected_cash`
        // sumaba `sales.total` completo (una tarjeta inflaba el "faltante"),
        // y hasta 2026-07-23 el filtro era de EXCLUSIÓN (solo quitaba
        // '%tarjeta%'): una Transferencia contaba como billetes en el cajón.
        // Ahora la clasificación es de INCLUSIÓN (PaymentMethod::isCashLike).
        $sessionIds = $sessions->pluck('id');

        $cashCond = \App\Models\PaymentMethod::cashLikeSqlCondition('pm.name');
        $cardCond = "LOWER(COALESCE(pm.name, '')) LIKE '%tarjeta%'";

        $movementTotals = DB::table('cash_movements')
            ->whereIn('register_session_id', $sessionIds)
            ->selectRaw('register_session_id, type, COALESCE(SUM(amount), 0) as total')
            ->groupBy('register_session_id', 'type')
            ->get()
            ->groupBy('register_session_id');

        $saleTotals = DB::table('sales')
            ->whereIn('register_session_id', $sessionIds)
            ->where('status', Sale::STATUS_COMPLETED)
            ->selectRaw('register_session_id, COUNT(*) as count, COALESCE(SUM(total), 0) as amount, COALESCE(SUM(cash_received_usd), 0) as usd_received')
            ->groupBy('register_session_id')
            ->get()
            ->keyBy('register_session_id');

        $salePaymentTotals = DB::table('payments')
            ->join('sales', 'sales.id', '=', 'payments.sale_id')
            ->leftJoin('payment_methods as pm', 'pm.id', '=', 'payments.payment_method_id')
            ->whereIn('sales.register_session_id', $sessionIds)
            ->where('sales.status', Sale::STATUS_COMPLETED)
            ->selectRaw("
                sales.register_session_id,
                COALESCE(SUM(payments.amount), 0) as total_paid,
                COALESCE(SUM(CASE WHEN {$cashCond} THEN payments.amount ELSE 0 END), 0) as cash_paid,
                COALESCE(SUM(CASE WHEN {$cardCond} THEN payments.amount ELSE 0 END), 0) as card_paid,
                COALESCE(SUM(CASE WHEN {$cashCond} OR {$cardCond} THEN 0 ELSE payments.amount END), 0) as other_paid
            ")
            ->groupBy('sales.register_session_id')
            ->get()
            ->keyBy('register_session_id');

        $preSaleTotals = DB::table('cash_register_sessions as sessions')
            ->join('pre_sale_order_payments as psop', 'psop.cashier_id', '=', 'sessions.user_id')
            ->leftJoin('payment_methods as pm', 'pm.id', '=', 'psop.payment_method_id')
            ->join('pre_sale_orders as pso', 'pso.id', '=', 'psop.pre_sale_order_id')
            ->whereIn('sessions.id', $sessionIds)
            ->whereRaw('psop.created_at >= sessions.opened_at')
            ->whereRaw('psop.created_at <= COALESCE(sessions.closed_at, CURRENT_TIMESTAMP)')
            ->selectRaw("
                sessions.id as register_session_id,
                COALESCE(SUM(psop.amount), 0) as total_paid,
                COALESCE(SUM(CASE WHEN {$cashCond} THEN psop.amount ELSE 0 END), 0) as cash_paid,
                COALESCE(SUM(CASE WHEN {$cardCond} THEN psop.amount ELSE 0 END), 0) as card_paid,
                COALESCE(SUM(CASE WHEN {$cashCond} OR {$cardCond} THEN 0 ELSE psop.amount END), 0) as other_paid
            ")
            ->groupBy('sessions.id')
            ->get()
            ->keyBy('register_session_id');

        // Compras de insumos por sesión (Fase 2). El efectivo ya está restado
        // vía su cash_movement 'salida' linkeado — esto es drill-down
        // informativo para el corte, NUNCA se re-resta de expected_cash.
        $supplyTotals = DB::table('supply_movements')
            ->whereIn('register_session_id', $sessionIds)
            ->where('type', \App\Models\SupplyMovement::TYPE_PURCHASE)
            ->selectRaw('register_session_id, COUNT(*) as count, COALESCE(SUM(amount), 0) as total')
            ->groupBy('register_session_id')
            ->get()
            ->keyBy('register_session_id');

        $data = $sessions->map(function ($s) use ($movementTotals, $saleTotals, $salePaymentTotals, $preSaleTotals, $supplyTotals) {
            $movements = $movementTotals->get($s->id, collect());
            $entradas  = (float) ($movements->firstWhere('type', 'entrada')?->total ?? 0);
            $salidas   = (float) ($movements->firstWhere('type', 'salida')?->total ?? 0);
            $ajustes   = (float) ($movements->firstWhere('type', 'ajuste')?->total ?? 0);
            $sales     = $saleTotals->get($s->id);
            $salePay   = $salePaymentTotals->get($s->id);
            $preSales  = $preSaleTotals->get($s->id);
            $salesAmt  = (float) ($sales?->amount ?? 0);
            $salesCnt  = (int)   ($sales?->count  ?? 0);
            $cashSales = (float) ($salePay?->cash_paid ?? 0);
            $preSaleAmt = (float) ($preSales?->total_paid ?? 0);
            $cashPreSales = (float) ($preSales?->cash_paid ?? 0);
            $cashCollected = round($cashSales + $cashPreSales, 2);
            // Fuera del cajón (informativo, ventas + anticipos). `transfer`
            // agrupa TODO lo no-efectivo no-tarjeta: hoy en la práctica son
            // transferencias; un método futuro cae aquí (nunca al esperado).
            $cardTotal = round((float) ($salePay?->card_paid ?? 0) + (float) ($preSales?->card_paid ?? 0), 2);
            $transferTotal = round((float) ($salePay?->other_paid ?? 0) + (float) ($preSales?->other_paid ?? 0), 2);

            $expected = round($s->opening_cash + $entradas - $salidas + $ajustes + $cashCollected, 2);

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
                'total_cash_sales' => round($cashSales, 2),
                'total_card'      => $cardTotal,
                'total_transfer'  => $transferTotal,
                'total_usd_received' => round((float) ($sales?->usd_received ?? 0), 2),
                'total_pre_sale_payments' => round($preSaleAmt, 2),
                'total_cash_pre_sale_payments' => round($cashPreSales, 2),
                'cash_collected'  => $cashCollected,
                'sales_count'     => $salesCnt,
                // Insumos comprados con efectivo de esta caja (ya incluidos en
                // total_salidas — informativo, no volver a restar).
                'total_supplies'  => round((float) ($supplyTotals->get($s->id)?->total ?? 0), 2),
                'supplies_count'  => (int) ($supplyTotals->get($s->id)?->count ?? 0),
                'expected_cash'   => $expected,
                'difference'      => $s->closing_cash !== null ? round((float) $s->closing_cash - $expected, 2) : null,
            ];
        });

        $summary = [
            'total_sessions'  => $data->count(),
            'total_sales'     => round($data->sum('total_sales'), 2),
            'total_cash_collected' => round($data->sum('cash_collected'), 2),
            'total_card'      => round($data->sum('total_card'), 2),
            'total_transfer'  => round($data->sum('total_transfer'), 2),
            'total_usd_received' => round($data->sum('total_usd_received'), 2),
            'total_pre_sale_payments' => round($data->sum('total_pre_sale_payments'), 2),
            'total_entradas'  => round($data->sum('total_entradas'), 2),
            'total_salidas'   => round($data->sum('total_salidas'), 2),
            'total_supplies'  => round($data->sum('total_supplies'), 2),
        ];

        return $this->success([
            'period'   => ['from' => $from, 'to' => $to],
            'summary'  => $summary,
            'sessions' => $data,
        ]);
    }

    /**
     * GET /reports/cash/{session}/detail
     *
     * Desglose completo de un corte (Joel 2026-06-10): cada ticket de la sesión
     * con sus items y pagos, los abonos/liquidaciones de preventa que cobró ese
     * cajero durante la sesión, y los movimientos de caja (entradas/salidas,
     * incluye reversos de cancelación). RBAC igual que /reports/cash.
     */
    public function cashDetail(Request $request, CashRegisterSession $session): JsonResponse
    {
        $user      = $request->user();
        $isAdmin   = $user && $user->isAdminRole();
        $isCashier = $user && $user->hasRole(['cajero']) && ! $isAdmin;

        $session->load(['register.store', 'user']);

        if (! $isAdmin) {
            $sessionStoreId = $session->register?->store_id;
            if ($sessionStoreId === null || (int) $sessionStoreId !== (int) ($user->store_id ?? -1)) {
                return $this->error('No tienes acceso a este corte.', 403);
            }
            if ($isCashier && (int) $session->user_id !== (int) $user->id) {
                return $this->error('Solo puedes ver tus propios cortes.', 403);
            }
        }

        // ── Tickets de la sesión, desglosados ────────────────────────────────
        $tickets = Sale::with(['items.product:id,name,sku', 'payments.paymentMethod:id,name', 'customer:id,name', 'user:id,name'])
            ->where('register_session_id', $session->id)
            ->orderBy('sold_at')
            ->get()
            ->map(fn ($sale) => [
                'id'                  => $sale->id,
                'sold_at'             => $sale->sold_at?->toISOString(),
                'cashier'             => $sale->user?->name,
                'customer'            => $sale->customer?->name,
                'status'              => $sale->status,
                'cancellation_status' => $sale->cancellation_status,
                'subtotal'            => (float) $sale->subtotal,
                'discount'            => (float) $sale->discount,
                'total'               => (float) $sale->total,
                'items'               => $sale->items->map(fn ($i) => [
                    'name'     => $i->product?->name ?? "#{$i->product_id}",
                    'sku'      => $i->product?->sku,
                    'quantity' => (float) $i->quantity,
                    'price'    => (float) $i->price,
                    'total'    => (float) $i->total,
                ])->values(),
                'payments'            => $sale->payments->map(fn ($p) => [
                    'method' => $p->paymentMethod?->name ?? '—',
                    'amount' => (float) $p->amount,
                ])->values(),
            ])->values();

        // ── Abonos/liquidaciones de preventa cobrados en esta sesión ─────────
        // (la tabla no liga sesión: se toma cajero + ventana del corte)
        $windowEnd = $session->closed_at ?? now();
        $preSalePayments = DB::table('pre_sale_order_payments')
            ->join('pre_sale_orders', 'pre_sale_orders.id', '=', 'pre_sale_order_payments.pre_sale_order_id')
            ->leftJoin('payment_methods', 'payment_methods.id', '=', 'pre_sale_order_payments.payment_method_id')
            ->where('pre_sale_order_payments.cashier_id', $session->user_id)
            ->whereBetween('pre_sale_order_payments.created_at', [$session->opened_at, $windowEnd])
            ->orderBy('pre_sale_order_payments.created_at')
            ->get([
                'pre_sale_order_payments.id',
                'pre_sale_order_payments.amount',
                'pre_sale_order_payments.created_at',
                'pre_sale_orders.code',
                'pre_sale_orders.status as order_status',
                'payment_methods.name as method',
            ])
            ->map(fn ($p) => [
                'id'         => $p->id,
                'folio'      => $p->code,
                'status'     => $p->order_status,
                'method'     => $p->method ?? '—',
                'amount'     => (float) $p->amount,
                'created_at' => $p->created_at,
            ]);

        // ── Movimientos de caja (incluye reversos de cancelación) ────────────
        $movements = DB::table('cash_movements')
            ->where('register_session_id', $session->id)
            ->orderBy('created_at')
            ->get(['id', 'type', 'amount', 'description', 'created_at'])
            ->map(fn ($m) => [
                'id'          => $m->id,
                'type'        => $m->type,
                'amount'      => (float) $m->amount,
                'description' => $m->description,
                'created_at'  => $m->created_at,
            ]);

        return $this->success([
            'session' => [
                'id'           => $session->id,
                'register'     => $session->register?->name,
                'store'        => $session->register?->store?->name,
                'user'         => $session->user?->name,
                'status'       => $session->status,
                'opened_at'    => $session->opened_at?->toISOString(),
                'closed_at'    => $session->closed_at?->toISOString(),
                'opening_cash' => (float) $session->opening_cash,
                'closing_cash' => $session->closing_cash !== null ? (float) $session->closing_cash : null,
            ],
            'tickets'           => $tickets,
            'pre_sale_payments' => $preSalePayments,
            'movements'         => $movements,
            // Insumos comprados con efectivo de esta caja (drill-down del
            // corte; su salida ya viene en movements[]).
            'supply_purchases'  => DB::table('supply_movements')
                ->join('supplies', 'supplies.id', '=', 'supply_movements.supply_id')
                ->where('supply_movements.register_session_id', $session->id)
                ->where('supply_movements.type', \App\Models\SupplyMovement::TYPE_PURCHASE)
                ->orderBy('supply_movements.created_at')
                ->get([
                    'supply_movements.id',
                    'supplies.name',
                    'supplies.category',
                    'supply_movements.quantity',
                    'supply_movements.amount',
                    'supply_movements.note',
                    'supply_movements.created_at',
                ])
                ->map(fn ($p) => [
                    'id'         => $p->id,
                    'name'       => $p->name,
                    'category'   => $p->category,
                    'quantity'   => (float) $p->quantity,
                    'amount'     => (float) $p->amount,
                    'note'       => $p->note,
                    'created_at' => $p->created_at,
                ]),
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
        $storeId = $this->scopedStoreId($request);
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
                COALESCE(SUM(sale_items.total * CASE WHEN sales.discount > 0 THEN sales.total * 1.0 / NULLIF(sales.subtotal, 0) ELSE 1 END), 0) as total_revenue
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
                COALESCE(SUM(sale_items.total * CASE WHEN sales.discount > 0 THEN sales.total * 1.0 / NULLIF(sales.subtotal, 0) ELSE 1 END), 0) as total_revenue
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
        $storeId = $this->scopedStoreId($request);
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
        $storeId = $this->scopedStoreId($request);

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
