<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\CashMovement;
use App\Models\CashRegisterSession;
use App\Models\Customer;
use App\Models\Inventory;
use App\Models\InventoryMovement;
use App\Models\PointTransaction;
use App\Models\PreSaleOrder;
use App\Models\PreSaleOrderPayment;
use App\Models\Sale;
use App\Models\SaleCancellation;
use App\Models\SupplyMovement;
use App\Models\SystemLog;
use App\Models\User;
use App\Models\Warehouse;
use DomainException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * "Borrar corte" (solo admin, 2026-10-01): borra un corte de caja CON todo lo que
 * cuelga de él — ventas (y su stock regresa), folios de preventa, movimientos de
 * caja e insumos pagados de esa caja. Para limpiar cortes de prueba en prod.
 *
 * Es DEFINITIVO (no hay SoftDeletes): antes de borrar se guarda en system_logs
 * ('cash_session.deleted') el preview y los renglones completos (ventas con
 * líneas y pagos, cancelaciones, movimientos, insumos, folios).
 *
 * - NUNCA `$session->delete()` a secas: sales cascadean por register_session_id
 *   y el stock no regresaría. Aquí regresa lo vendido (neto de cancelaciones).
 * - Preventas: los cobros no ligan el corte por id; son del cajero dentro de la
 *   ventana apertura → cierre (mismo criterio que ReportsController::cash). Solo
 *   se borra un folio creado en este corte por este cajero y sin cobros en otros
 *   cortes; cualquier otro caso BLOQUEA.
 * - Si el borrado mueve OTROS cortes (devoluciones cruzadas) hay que confirmarlo
 *   explícitamente (`acknowledge_cross`).
 * - Lo confirmado debe ser lo que se vio: si entraron ventas/cobros mientras el
 *   admin revisaba, los conteos no cuadran y no se borra.
 */
final class CashSessionDeletionService
{
    public const CONFIRM_WORD = 'BORRAR';

    /**
     * Todo lo que se borraría. `blockers` no vacío = no se puede borrar.
     *
     * @return array<string, mixed>
     */
    public function preview(CashRegisterSession $session, bool $lock = false): array
    {
        $session->loadMissing(['register.store', 'user']);
        $sales  = $this->sales($session, $lock);
        $stock  = $this->stockReturns($sales, $session);
        $folios = $this->folios($session);
        $cross  = $this->crossCorte($session, $sales, array_column($folios['rows'], 'id'));

        $movements = CashMovement::where('register_session_id', $session->id)->orderBy('id')->get();
        $supplies  = SupplyMovement::with('supply:id,name')->where('register_session_id', $session->id)->get();

        return [
            'session'   => $this->sessionSummary($session),
            'sales'     => $sales->map(fn (Sale $s) => [
                'id'      => $s->id,
                'sold_at' => ($s->sold_at ?? $s->created_at)?->toIso8601String(),
                'total'   => (float) $s->total,
                'status'  => $s->status,
                'items'   => (float) $s->items->sum('quantity'),
                'cashier' => $s->user?->name,
            ])->values()->all(),
            'stock'     => $stock['rows'],
            'presales'  => $folios['rows'],
            'movements' => $movements->map(fn (CashMovement $m) => [
                'id' => $m->id, 'type' => $m->type, 'amount' => (float) $m->amount,
                'description' => $m->description, 'created_at' => $m->created_at?->toIso8601String(),
            ])->all(),
            'supplies'  => $supplies->map(fn (SupplyMovement $m) => [
                'id' => $m->id, 'supply' => $m->supply?->name, 'quantity' => (float) $m->quantity, 'amount' => (float) $m->amount,
            ])->all(),
            'counts'    => [
                'sales' => $sales->count(), 'presales' => count($folios['rows']),
                'movements' => $movements->count(), 'supplies' => $supplies->count(),
            ],
            'cross'     => $cross,
            'warnings'  => $session->status === CashRegisterSession::STATUS_OPEN
                ? ['Este corte sigue ABIERTO: si alguien está cobrando en esa caja tendrá que abrir otra.']
                : [],
            'blockers'  => [...$stock['blockers'], ...$folios['blockers']],
        ];
    }

    /**
     * Borra el corte y todo lo suyo en una transacción. Devuelve el preview.
     *
     * @param  array{sales?: int, presales?: int, movements?: int, supplies?: int}  $expected
     *         Conteos que el admin vio en el preview.
     * @return array<string, mixed>
     * @throws DomainException si hay bloqueos, cambió el corte o falta confirmar otros cortes (→ 422)
     */
    public function delete(CashRegisterSession $session, User $by, array $expected, bool $acknowledgeCross): array
    {
        return DB::transaction(function () use ($session, $by, $expected, $acknowledgeCross) {
            $session = CashRegisterSession::lockForUpdate()->findOrFail($session->id);
            $preview = $this->preview($session, lock: true);
            $this->assertDeletable($preview, $expected, $acknowledgeCross);

            $saleIds  = array_column($preview['sales'], 'id');
            $folioIds = array_column($preview['presales'], 'id');

            SystemLog::write(
                'cash_session.deleted',
                sprintf('Corte #%d borrado (%s · %s): %d ventas, %d folios de preventa',
                    $session->id, $preview['session']['cashier'] ?? '—', $preview['session']['store'] ?? '—',
                    count($saleIds), count($folioIds)),
                $by->id,
                'cash_session',
                $session->id,
                ['preview' => $preview, 'archive' => $this->archive($session, $saleIds, $folioIds)],
            );

            $this->returnStock($preview['stock'], $session, $by);
            $this->deletePresales($folioIds);
            $this->deleteSales($saleIds);
            SupplyMovement::where('register_session_id', $session->id)->delete();
            $session->delete(); // cascade: cash_movements, sales_drafts

            return $preview;
        });
    }

    /** @param array<string, mixed> $preview */
    private function assertDeletable(array $preview, array $expected, bool $acknowledgeCross): void
    {
        if ($preview['blockers'] !== []) {
            throw new DomainException(implode(' ', $preview['blockers']));
        }
        foreach ($preview['counts'] as $key => $count) {
            if ((int) ($expected[$key] ?? -1) !== $count) {
                throw new DomainException('El corte cambió mientras lo revisabas (entraron ventas o movimientos). Vuelve a abrir la vista previa.');
            }
        }
        if ($preview['cross'] !== [] && ! $acknowledgeCross) {
            throw new DomainException('Este borrado mueve otros cortes: confírmalo marcando la casilla.');
        }
    }

    /** @return array<string, mixed> */
    private function sessionSummary(CashRegisterSession $session): array
    {
        return [
            'id'           => $session->id,
            'cashier'      => $session->user?->name,
            'store'        => $session->register?->store?->name,
            'status'       => $session->status,
            'opened_at'    => $session->opened_at?->toIso8601String(),
            'closed_at'    => $session->closed_at?->toIso8601String(),
            'opening_cash' => (float) $session->opening_cash,
            'closing_cash' => $session->closing_cash !== null ? (float) $session->closing_cash : null,
        ];
    }

    /** @return Collection<int, Sale> */
    private function sales(CashRegisterSession $session, bool $lock): Collection
    {
        return Sale::with(['items:id,sale_id,product_id,product_name,quantity', 'items.product:id,name', 'user:id,name'])
            ->where('register_session_id', $session->id)
            ->when($lock, fn ($q) => $q->lockForUpdate())
            ->orderBy('id')
            ->get();
    }

    /**
     * Lo vendido que regresa al inventario: cantidades actuales (las cancelaciones
     * ya restaron lo suyo), al almacén de donde salió. Las ventas ya devueltas con
     * el /return viejo no regresan otra vez. Consultas en lote (sin N+1).
     *
     * @param  Collection<int, Sale>  $sales
     * @return array{rows: list<array<string, mixed>>, blockers: list<string>}
     */
    private function stockReturns(Collection $sales, CashRegisterSession $session): array
    {
        if ($sales->isEmpty()) {
            return ['rows' => [], 'blockers' => []];
        }
        $returned = InventoryMovement::whereIn('reference', $sales->map(fn (Sale $s) => "Devolución venta #{$s->id}"))
            ->pluck('reference')->flip();
        $fromSale = InventoryMovement::whereIn('reference', $sales->map(fn (Sale $s) => "VENTA-{$s->id}"))
            ->get(['reference', 'product_id', 'warehouse_id'])
            ->mapWithKeys(fn (InventoryMovement $m) => ["{$m->reference}|{$m->product_id}" => $m->warehouse_id]);
        $storeIds   = $sales->pluck('store_id')->push($session->register?->store_id)->filter()->unique();
        $fallback   = Warehouse::whereIn('store_id', $storeIds)
            ->orderByRaw("CASE WHEN type = 'store' THEN 0 ELSE 1 END")->orderBy('id')->get()
            ->groupBy('store_id')->map(fn (Collection $ws) => $ws->first());
        $warehouses = Warehouse::whereIn('id', $fromSale->values()->filter()->unique())->get()->keyBy('id');

        $rows     = [];
        $blockers = [];
        foreach ($sales as $sale) {
            if ($returned->has("Devolución venta #{$sale->id}")) {
                continue;
            }
            foreach ($sale->items as $item) {
                if ($item->product_id === null || (float) $item->quantity <= 0) {
                    continue; // producto borrado: no hay inventario al cual regresar
                }
                $wid       = $fromSale->get("VENTA-{$sale->id}|{$item->product_id}");
                $warehouse = $wid ? $warehouses->get($wid) : $fallback->get($sale->store_id ?? $session->register?->store_id);
                $name      = $item->product?->name ?? $item->product_name;
                if ($warehouse === null) {
                    $blockers[] = "No hay almacén para regresar el stock de \"{$name}\" (venta #{$sale->id}).";
                    continue;
                }
                $rows[] = [
                    'sale_id' => $sale->id, 'product_id' => (int) $item->product_id, 'product' => $name,
                    'quantity' => (float) $item->quantity, 'warehouse_id' => $warehouse->id, 'warehouse' => $warehouse->name,
                ];
            }
        }

        return ['rows' => $rows, 'blockers' => $blockers];
    }

    /**
     * Folios con cobros del cajero dentro de la ventana del corte. Solo se borra
     * un folio CREADO en este corte por este cajero y sin cobros fuera de él.
     *
     * @return array{rows: list<array<string, mixed>>, blockers: list<string>}
     */
    private function folios(CashRegisterSession $session): array
    {
        $inWindow = PreSaleOrderPayment::where('cashier_id', $session->user_id)
            ->where('created_at', '>=', $session->opened_at)
            ->when($session->closed_at, fn ($q) => $q->where('created_at', '<=', $session->closed_at))
            ->get();
        if ($inWindow->isEmpty()) {
            return ['rows' => [], 'blockers' => []];
        }

        $rows     = [];
        $blockers = [];
        $orders   = PreSaleOrder::with(['customer:id,name', 'payments'])->whereIn('id', $inWindow->pluck('pre_sale_order_id')->unique())->get();
        foreach ($orders as $order) {
            $mine = $inWindow->where('pre_sale_order_id', $order->id);
            if ($order->payments->whereNotIn('id', $mine->pluck('id'))->isNotEmpty()) {
                $blockers[] = "El folio {$order->code} tiene cobros en otros cortes: no se borra automáticamente.";
                continue;
            }
            if (! $this->createdInSession($order, $session)) {
                $blockers[] = "El folio {$order->code} no se creó en este corte: no se borra automáticamente.";
                continue;
            }
            $rows[] = [
                'id' => $order->id, 'code' => $order->code, 'status' => $order->status,
                'customer' => $order->customer?->name, 'paid' => round((float) $mine->sum('amount'), 2),
            ];
        }

        return ['rows' => $rows, 'blockers' => $blockers];
    }

    private function createdInSession(PreSaleOrder $order, CashRegisterSession $session): bool
    {
        if ((int) $order->user_id !== (int) $session->user_id || $order->created_at === null) {
            return false;
        }

        return $order->created_at->gte($session->opened_at)
            && ($session->closed_at === null || $order->created_at->lte($session->closed_at));
    }

    /**
     * Devoluciones cruzadas: el borrado mueve otros cortes. Hay que confirmarlo.
     *
     * @param  Collection<int, Sale>  $sales
     * @param  list<int>  $folioIds
     * @return list<string>
     */
    private function crossCorte(CashRegisterSession $session, Collection $sales, array $folioIds): array
    {
        $cross = [];
        $elsewhere = SaleCancellation::whereIn('sale_id', $sales->pluck('id'))
            ->whereNotNull('cash_session_id')->where('cash_session_id', '!=', $session->id)->get();
        foreach ($elsewhere as $c) {
            $cross[] = "La devolución de la venta #{$c->sale_id} se registró en el corte #{$c->cash_session_id}: ese corte se queda con la salida y sin la venta.";
        }
        $recordedHere = SaleCancellation::where('cash_session_id', $session->id)->get();
        foreach ($recordedHere as $c) {
            if ($c->sale_id !== null && ! $sales->contains('id', $c->sale_id)) {
                $cross[] = "Aquí se registró la devolución de la venta #{$c->sale_id} (de otro corte): esa salida de caja se borra.";
            }
            if ($c->pre_sale_order_id !== null && ! in_array((int) $c->pre_sale_order_id, $folioIds, true)) {
                $cross[] = "Aquí se registró la cancelación del folio de preventa #{$c->pre_sale_order_id}: esa salida de caja se borra.";
            }
        }

        return $cross;
    }

    /**
     * Renglones completos para el log (respaldo de auditoría, no restaurable).
     *
     * @param  list<int>  $saleIds
     * @param  list<int>  $folioIds
     * @return array<string, mixed>
     */
    private function archive(CashRegisterSession $session, array $saleIds, array $folioIds): array
    {
        return [
            'session'       => $session->toArray(),
            'sales'         => Sale::with(['items', 'payments'])->whereIn('id', $saleIds)->get()->toArray(),
            'cancellations' => SaleCancellation::whereIn('sale_id', $saleIds)
                ->orWhere('cash_session_id', $session->id)
                ->orWhereIn('pre_sale_order_id', $folioIds)->get()->toArray(),
            'movements'     => CashMovement::where('register_session_id', $session->id)->get()->toArray(),
            'supplies'      => SupplyMovement::where('register_session_id', $session->id)->get()->toArray(),
            'presales'      => PreSaleOrder::with(['items', 'payments'])->whereIn('id', $folioIds)->get()->toArray(),
        ];
    }

    /** @param list<array<string, mixed>> $rows */
    private function returnStock(array $rows, CashRegisterSession $session, User $by): void
    {
        foreach ($rows as $row) {
            $inventory = Inventory::firstOrCreate(
                ['product_id' => $row['product_id'], 'warehouse_id' => $row['warehouse_id']],
                ['quantity' => 0],
            );
            $inventory->increment('quantity', $row['quantity']);
            InventoryMovement::create([
                'product_id'   => $row['product_id'],
                'warehouse_id' => $row['warehouse_id'],
                'type'         => 'devolucion',
                'quantity'     => $row['quantity'],
                'reference'    => "BORRADO-CORTE-{$session->id}",
                'notes'        => "Borrado de corte #{$session->id} · venta #{$row['sale_id']}",
                'user_id'      => $by->id,
            ]);
        }
    }

    /** @param list<int> $folioIds */
    private function deletePresales(array $folioIds): void
    {
        if ($folioIds === []) {
            return;
        }
        SaleCancellation::whereIn('pre_sale_order_id', $folioIds)->delete();
        $this->deletePoints('pre_sale', $folioIds);
        PreSaleOrder::whereIn('id', $folioIds)->delete(); // cascade: items, pagos, logs
    }

    /** @param list<int> $saleIds */
    private function deleteSales(array $saleIds): void
    {
        if ($saleIds === []) {
            return;
        }
        SaleCancellation::whereIn('sale_id', $saleIds)->delete();
        $this->deletePoints('sale', $saleIds);
        Sale::whereIn('id', $saleIds)->delete(); // cascade: sale_items, payments
    }

    /** Puntos otorgados por esas ventas/folios (defensivo: hoy el cobro no los da). */
    private function deletePoints(string $type, array $ids): void
    {
        $tx = PointTransaction::where('reference_type', $type)->whereIn('reference_id', $ids)->get();
        foreach ($tx as $t) {
            Customer::where('id', $t->customer_id)->decrement('points', (int) $t->points);
        }
        PointTransaction::whereIn('id', $tx->pluck('id'))->delete();
    }
}
