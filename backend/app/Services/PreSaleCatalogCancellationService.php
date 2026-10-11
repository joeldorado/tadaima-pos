<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\PreSaleCatalog;
use App\Models\PreSaleOrder;
use App\Models\PreSaleOrderItem;
use App\Models\PreSaleOrderLog;
use App\Models\SystemLog;
use App\Models\User;
use DomainException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Cancelar catálogo de preventa con vista previa (Joel 2026-10-09).
 *
 * Cancelar un catálogo cancela TODOS sus folios abiertos (pending/ready). Antes
 * pasaba en silencio: sin decir cuántos folios, cuánto dinero de anticipos había
 * ni de qué tiendas eran, sin log por folio y sin transacción. Ahora:
 *
 * - `preview()` enseña folios por estado, anticipos cobrados, saldo por cobrar,
 *   tiendas afectadas, unidades, avisos y bloqueos.
 * - `cancel()` corre en transacción con lock, respeta `expected` (los conteos
 *   que el usuario vio: si entraron folios o cobros mientras revisaba, no
 *   cancela), escribe un `pre_sale_order_logs` por folio y un `system_logs`
 *   con el preview completo.
 *
 * Decisión de Joel (2026-10-09): los anticipos cobrados NO bloquean la
 * cancelación — se avisa que ese dinero NO se devuelve solo (para devolverlo
 * hay que cancelar el folio desde Caja, que sí reversa efectivo). El flag
 * BLOCK_WHEN_MONEY deja cambiar esa regla sin tocar la lógica.
 */
final class PreSaleCatalogCancellationService
{
    public const BLOCK_WHEN_MONEY = false;

    /**
     * @return array<string, mixed>
     */
    public function preview(PreSaleCatalog $catalog, User $user, bool $lock = false): array
    {
        return $this->build($catalog, $user, $this->orders($catalog, $lock));
    }

    /**
     * Cancela el catálogo y sus folios abiertos. Devuelve el preview usado.
     *
     * @param  array<string, int|null>|null  $expected  Conteos que el usuario vio en la vista previa.
     * @return array<string, mixed>
     * @throws DomainException si hay bloqueos o el catálogo cambió (→ 422)
     */
    public function cancel(PreSaleCatalog $catalog, User $user, ?array $expected): array
    {
        return DB::transaction(function () use ($catalog, $user, $expected) {
            $catalog = PreSaleCatalog::query()->lockForUpdate()->findOrFail($catalog->id);
            $orders = $this->orders($catalog, lock: true);
            $preview = $this->build($catalog, $user, $orders);

            if ($preview['blockers'] !== []) {
                throw new DomainException(implode(' ', $preview['blockers']));
            }
            $this->assertUnchanged($preview, $expected);

            $catalog->update(['status' => PreSaleCatalog::STATUS_CANCELLED]);

            $note = "Catálogo «{$catalog->product_name}» cancelado.";
            foreach ($orders->whereIn('status', PreSaleOrder::OPEN_STATUSES) as $order) {
                $from = $order->status;
                $order->update(['status' => PreSaleOrder::STATUS_CANCELLED]);
                PreSaleOrderLog::create([
                    'pre_sale_order_id' => $order->id,
                    'user_id' => $user->id,
                    'from_status' => $from,
                    'to_status' => PreSaleOrder::STATUS_CANCELLED,
                    'notes' => $note,
                ]);
            }

            SystemLog::write(
                'pre_sale_catalog.cancelled',
                sprintf('Catálogo «%s» cancelado: %d folio(s), %s en anticipos cobrados',
                    $catalog->product_name, $preview['counts']['to_cancel'], self::money($preview['money']['anticipos_cobrados'])),
                $user->id,
                'pre_sale_catalog',
                $catalog->id,
                ['preview' => $preview],
            );

            return $preview;
        });
    }

    /** @param array<string, int|null>|null $expected */
    private function assertUnchanged(array $preview, ?array $expected): void
    {
        if ($expected === null || $expected === []) {
            return;
        }
        foreach ($preview['counts'] as $key => $count) {
            if (! array_key_exists($key, $expected) || $expected[$key] === null) {
                continue;
            }
            if ((int) $expected[$key] !== (int) $count) {
                throw new DomainException('El catálogo cambió mientras revisabas (entraron folios o cobros). Vuelve a abrir la vista previa.');
            }
        }
    }

    /** Folios que traen al menos un artículo de este catálogo, con lo necesario para total/paid/balance. */
    private function orders(PreSaleCatalog $catalog, bool $lock): Collection
    {
        return PreSaleOrder::query()
            ->with(['items', 'payments.paymentMethod', 'store:id,name'])
            ->whereIn('id', PreSaleOrderItem::query()->where('pre_sale_catalog_id', $catalog->id)->select('pre_sale_order_id'))
            ->when($lock, fn ($q) => $q->lockForUpdate())
            ->orderBy('id')
            ->get();
    }

    /**
     * @return array<string, mixed>
     */
    private function build(PreSaleCatalog $catalog, User $user, Collection $orders): array
    {
        $open = $orders->whereIn('status', PreSaleOrder::OPEN_STATUSES)->values();
        $isAdmin = $user->isAdminRole();
        $myStoreId = (int) ($user->store_id ?? 0);

        $byStatus = [];
        foreach ([PreSaleOrder::STATUS_PENDING, PreSaleOrder::STATUS_READY, PreSaleOrder::STATUS_DELIVERED, PreSaleOrder::STATUS_EXPIRED, PreSaleOrder::STATUS_CANCELLED] as $status) {
            $byStatus[$status] = $orders->where('status', $status)->count();
        }

        $withMoney = $open->filter(fn (PreSaleOrder $o) => $o->paid_amount > 0)->count();
        $withCard = $open->filter(fn (PreSaleOrder $o) => $o->payments->contains(fn ($p) => $p->paymentMethod?->isCard()))->count();
        $mixed = $open->filter(fn (PreSaleOrder $o) => $o->items->contains(fn ($i) => (int) $i->pre_sale_catalog_id !== (int) $catalog->id))->count();
        $otherStores = $isAdmin ? 0 : $open->filter(fn (PreSaleOrder $o) => (int) $o->store_id !== $myStoreId)->count();

        $anticipos = round((float) $open->sum(fn (PreSaleOrder $o) => $o->paid_amount), 2);
        $tarjeta = round((float) $open->sum(fn (PreSaleOrder $o) => $o->payments
            ->filter(fn ($p) => $p->paymentMethod?->isCard())
            ->sum('amount')), 2);
        $porCobrar = round((float) $open->sum(fn (PreSaleOrder $o) => max(0.0, $o->balance)), 2);

        $stores = $open->groupBy('store_id')->map(function (Collection $group, $storeId) use ($myStoreId) {
            $first = $group->first();

            return [
                'store_id' => (int) $storeId,
                'store_name' => (string) ($first->store?->name ?? "Tienda #{$storeId}"),
                'is_mine' => (int) $storeId === $myStoreId,
                'folios_to_cancel' => $group->count(),
                'anticipos' => round((float) $group->sum(fn (PreSaleOrder $o) => $o->paid_amount), 2),
            ];
        })->values()->all();
        usort($stores, function (array $a, array $b): int {
            if ($a['is_mine'] !== $b['is_mine']) {
                return $a['is_mine'] ? -1 : 1;
            }

            return strcasecmp($a['store_name'], $b['store_name']);
        });

        $itemsOfCatalog = fn (PreSaleOrder $o) => $o->items->where('pre_sale_catalog_id', $catalog->id);
        $reserved = (int) $open->sum(fn (PreSaleOrder $o) => $itemsOfCatalog($o)->sum('quantity'));
        $delivered = (int) $orders->sum(fn (PreSaleOrder $o) => $itemsOfCatalog($o)->where('status', PreSaleOrderItem::STATUS_DELIVERED)->sum('quantity'));

        $blockers = [];
        $canCancel = ! in_array($catalog->status, [PreSaleCatalog::STATUS_CANCELLED, PreSaleCatalog::STATUS_COMPLETED], true);
        if (! $canCancel) {
            $blockers[] = $catalog->status === PreSaleCatalog::STATUS_CANCELLED
                ? 'Este catálogo ya está cancelado.'
                : 'Este catálogo ya se completó: no se puede cancelar.';
        }
        if (self::BLOCK_WHEN_MONEY && $withMoney > 0) {
            $blockers[] = sprintf('%d folio(s) tienen anticipos cobrados (%s). Cancélalos uno por uno desde Caja para devolver el dinero; después podrás cancelar el catálogo.',
                $withMoney, self::money($anticipos));
        }

        $warnings = [];
        $toCancel = $open->count();
        if ($toCancel > 0) {
            $warnings[] = "Se cancelan {$toCancel} folio(s) de preventa (pendientes y listos). Esta acción no se puede deshacer.";
        }
        if ($withMoney > 0 && ! self::BLOCK_WHEN_MONEY) {
            $warnings[] = sprintf('%s en anticipos cobrados de %d folio(s): ese dinero NO se devuelve ni sale de caja al cancelar así. Para devolverlo, cancela esos folios uno por uno desde Caja.',
                self::money($anticipos), $withMoney);
        }
        if ($withCard > 0) {
            $warnings[] = "{$withCard} folio(s) tienen pagos con tarjeta.";
        }
        if ($mixed > 0) {
            $warnings[] = "{$mixed} folio(s) también traen artículos de otros catálogos y se cancelarían COMPLETOS.";
        }
        if ($otherStores > 0) {
            $warnings[] = "{$otherStores} folio(s) abierto(s) son de otras tiendas: también se cancelan.";
        }
        if ($byStatus[PreSaleOrder::STATUS_DELIVERED] > 0) {
            $warnings[] = "{$byStatus[PreSaleOrder::STATUS_DELIVERED]} folio(s) ya entregados no se tocan.";
        }

        return [
            'catalog' => [
                'id' => $catalog->id,
                'product_name' => $catalog->product_name,
                'status' => $catalog->status,
                'can_cancel' => $canCancel,
            ],
            'folios' => [
                'total' => $orders->count(),
                'to_cancel' => $toCancel,
                'by_status' => $byStatus,
                'with_money' => $withMoney,
                'with_card' => $withCard,
                'mixed' => $mixed,
                'other_stores' => $otherStores,
            ],
            'money' => [
                'anticipos_cobrados' => $anticipos,
                'anticipos_efectivo' => round($anticipos - $tarjeta, 2),
                'anticipos_tarjeta' => $tarjeta,
                'por_cobrar' => $porCobrar,
            ],
            'stores' => $stores,
            'units' => ['reserved' => $reserved, 'delivered' => $delivered],
            'counts' => ['to_cancel' => $toCancel, 'with_money' => $withMoney],
            'warnings' => $warnings,
            'blockers' => $blockers,
        ];
    }

    private static function money(float $n): string
    {
        return '$'.number_format($n, 2);
    }
}
