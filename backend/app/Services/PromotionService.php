<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Product;
use App\Models\ProductPromotion;
use App\Support\DateRange;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;

/**
 * Reglas de negocio de promociones (promos generales, 2026-07-25).
 *
 * Extraídas de ProductPromotionsController cuando las promos dejaron de vivir
 * bajo un producto: ahora las consumen DOS controllers (el top-level
 * /promotions y el shim anidado) y DOS momentos distintos — crear/editar una
 * promo (valores del request) y ASIGNAR una promo existente a un producto
 * (valores del modelo). Por eso las reglas se expresan sobre valores planos.
 *
 * La semántica se conserva POR PRODUCTO: anti-duplicado, exclusividad de tipo
 * y tope de activas se evalúan sobre las ASIGNACIONES de cada producto — un
 * producto no puede quedar con dos NxM encimadas del mismo ámbito aunque
 * vengan de promos distintas.
 */
final class PromotionService
{
    /** Máximo de promos ACTIVAS a la vez por producto (pedido Joel 2026-07-18). */
    public const MAX_ACTIVE_PROMOS = 2;

    /** Una promo sin ningún método de pago habilitado no se puede cobrar nunca. */
    public function noPaymentMethodMessage(bool $promoCash, bool $promoCard): ?string
    {
        if (! $promoCash && ! $promoCard) {
            return 'Marca al menos un método de pago para la promoción.';
        }

        return null;
    }

    /**
     * Los flags de pago de la promo vs los del PRODUCTO (2026-07-24). Como la
     * promo BLOQUEA el cobro cuando el método no le sirve, una promo
     * solo-efectivo sobre un producto que no acepta efectivo lo vuelve
     * invendible — se ataja al guardar/asignar, no en el mostrador.
     */
    public function paymentConflictMessage(Product $product, bool $promoCash, bool $promoCard): ?string
    {
        $prodCash = (bool) ($product->paymentMethod?->allow_cash ?? true);
        $prodCard = (bool) ($product->paymentMethod?->allow_card ?? true);

        $sirveEfectivo = $promoCash && $prodCash;
        $sirveTarjeta  = $promoCard && $prodCard;

        if (! $sirveEfectivo && ! $sirveTarjeta) {
            $falta = ! $promoCash ? 'efectivo' : 'tarjeta';

            return "El producto \"{$product->name}\" no acepta {$falta}, así que esta promo nunca se podría cobrar. Ajusta primero la restricción de pago del producto.";
        }

        return null;
    }

    /**
     * Exclusividad de TIPOS (Joel 2026-07-20): un producto no puede tener a la
     * vez una NxM y una de mayoreo vigentes con ventana y ámbito encimados.
     */
    public function typeConflictMessage(
        Product $product,
        string $type,
        ?Carbon $startsAt,
        ?Carbon $endsAt,
        ?int $storeId,
        ?int $ignorePromotionId = null,
    ): ?string {
        $existing = $this->overlappingActivePromos($product, $startsAt, $endsAt, $storeId, $ignorePromotionId)
            ->where('type', '!=', $type)
            ->first();

        if (! $existing) {
            return null;
        }

        $existingLabel = $existing->type === ProductPromotion::TYPE_NXM
            ? "{$existing->buy_n}x{$existing->pay_m}"
            : 'de mayoreo';

        return "El producto \"{$product->name}\" ya tiene la promo \"{$existing->name}\" ({$existingLabel}) vigente en esas fechas. No pueden convivir una NxM y una de mayoreo — pausa o elimina esa primero.";
    }

    /**
     * Anti-duplicados (Joel 2026-07-18): otra promo con el MISMO NxM se permite
     * SOLO si su vigencia NO se encima (2x1 de julio + 2x1 de diciembre = OK).
     * Mayoreo: cualquier otra del mismo tipo encimada es duplicado. Ámbito de
     * tienda EXACTO — una local sobre la global es reemplazo deliberado.
     */
    public function duplicateMessage(
        Product $product,
        string $type,
        ?int $buyN,
        ?int $payM,
        ?Carbon $startsAt,
        ?Carbon $endsAt,
        ?int $storeId,
        ?int $ignorePromotionId = null,
    ): ?string {
        $query = $this->overlappingActivePromos($product, $startsAt, $endsAt, $storeId, $ignorePromotionId)
            ->where('type', $type);

        if ($type === ProductPromotion::TYPE_NXM) {
            $query->where('buy_n', (int) $buyN)->where('pay_m', (int) $payM);
        }

        $existing = $query->first();
        if (! $existing) {
            return null;
        }

        $label = $type === ProductPromotion::TYPE_NXM
            ? "una promo {$buyN}x{$payM}"
            : 'una promo de mayoreo';

        return "Ya existe {$label} para el producto \"{$product->name}\" que se encima en fechas (\"{$existing->name}\"). Pausa o elimina esa, o usa un rango de fechas que no se encime.";
    }

    /**
     * Tope de promos activas por producto EN EL MISMO ÁMBITO EXACTO de tienda:
     * máx 2 globales y máx 2 locales por sucursal — contadas ahora sobre las
     * asignaciones (vengan de la promo que vengan).
     */
    public function capMessage(Product $product, ?int $storeId, ?int $ignorePromotionId = null): ?string
    {
        $activeCount = $this->assignedPromosQuery($product)
            ->where('product_promotions.status', ProductPromotion::STATUS_ACTIVE)
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', now()))
            ->when($ignorePromotionId !== null, fn ($q) => $q->where('product_promotions.id', '!=', $ignorePromotionId))
            ->when($storeId === null, fn ($q) => $q->whereNull('store_id'))
            ->when($storeId !== null, fn ($q) => $q->where('store_id', $storeId))
            ->count();

        if ($activeCount < self::MAX_ACTIVE_PROMOS) {
            return null;
        }

        return "El producto \"{$product->name}\" ya tiene " . self::MAX_ACTIVE_PROMOS
            . ' promociones activas — pausa o elimina una antes de activar otra.';
    }

    /**
     * Todas las reglas al ASIGNAR una promo YA existente a un producto. Si la
     * promo no está activa/viva solo aplica el conflicto de pago (una pausada
     * no compite por líneas, pero al reactivarla se revalida todo).
     */
    public function assignmentConflictMessage(ProductPromotion $promotion, Product $product): ?string
    {
        if ($msg = $this->paymentConflictMessage($product, (bool) $promotion->allow_cash, (bool) $promotion->allow_card)) {
            return $msg;
        }

        $isLiveActive = $promotion->status === ProductPromotion::STATUS_ACTIVE
            && ($promotion->ends_at === null || $promotion->ends_at->gte(now()));

        if (! $isLiveActive) {
            return null;
        }

        $start   = $promotion->starts_at;
        $end     = $promotion->ends_at;
        $storeId = $promotion->store_id !== null ? (int) $promotion->store_id : null;

        return $this->typeConflictMessage($product, (string) $promotion->type, $start, $end, $storeId, $promotion->id)
            ?? $this->duplicateMessage(
                $product,
                (string) $promotion->type,
                $promotion->buy_n,
                $promotion->pay_m,
                $start,
                $end,
                $storeId,
                $promotion->id,
            )
            ?? $this->capMessage($product, $storeId, $promotion->id);
    }

    /**
     * Query base: promos ACTIVAS vivas ASIGNADAS al producto cuya ventana se
     * encima con la dada, en el MISMO ámbito exacto de tienda. Ventana null =
     * infinita (se encima con todo).
     */
    private function overlappingActivePromos(
        Product $product,
        ?Carbon $newStart,
        ?Carbon $newEnd,
        ?int $storeId,
        ?int $ignorePromotionId = null,
    ): Builder {
        return $this->assignedPromosQuery($product)
            ->where('product_promotions.status', ProductPromotion::STATUS_ACTIVE)
            ->when($ignorePromotionId !== null, fn ($q) => $q->where('product_promotions.id', '!=', $ignorePromotionId))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', now()))
            ->when($storeId === null, fn ($q) => $q->whereNull('store_id'))
            ->when($storeId !== null, fn ($q) => $q->where('store_id', $storeId))
            ->when($newEnd !== null, fn ($q) => $q->where(fn ($qq) => $qq->whereNull('starts_at')->orWhere('starts_at', '<=', $newEnd)))
            ->when($newStart !== null, fn ($q) => $q->where(fn ($qq) => $qq->whereNull('ends_at')->orWhere('ends_at', '>=', $newStart)));
    }

    /** Promos asignadas al producto — SIEMPRE vía pivote, nunca product_id legacy. */
    private function assignedPromosQuery(Product $product): Builder
    {
        return ProductPromotion::query()
            ->whereHas('products', fn ($q) => $q->where('products.id', $product->id));
    }

    /**
     * Fechas de vigencia en la ZONA DEL NEGOCIO (America/Tijuana) → UTC.
     * 'YYYY-MM-DD' plano: inicio/fin del día local. Un ISO con hora (round-trip
     * de update) se parsea tal cual (ya es UTC).
     *
     * @return array{starts_at: ?Carbon, ends_at: ?Carbon}
     */
    public function vigencyDates(?string $startsAt, ?string $endsAt): array
    {
        $parse = static function (?string $value, bool $endOfDay): ?Carbon {
            if (! $value) {
                return null;
            }
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
                return $endOfDay ? DateRange::toUtc($value) : DateRange::fromUtc($value);
            }
            try {
                return Carbon::parse($value)->utc();
            } catch (\Throwable) {
                return null;
            }
        };

        return [
            'starts_at' => $parse($startsAt, false),
            'ends_at'   => $parse($endsAt, true),
        ];
    }

    /**
     * Tienda de la promo con RBAC: admin manda lo que quiera (null = todas);
     * gerente queda FORZADO a su propia tienda.
     */
    public function scopedStoreId(\Illuminate\Http\Request $request): ?int
    {
        $user = $request->user();
        $isAdmin = $user && $user->hasRole(['admin', 'super_admin', 'owner', 'dueño']);
        if ($isAdmin) {
            return $request->filled('store_id') ? (int) $request->input('store_id') : null;
        }

        return $user?->store_id ? (int) $user->store_id : null;
    }
}
