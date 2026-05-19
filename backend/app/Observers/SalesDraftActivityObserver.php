<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\SalesDraft;
use App\Models\SalesDraftItem;

/**
 * Mantiene `sales_drafts.expires_at` actualizado a `now() + EXPIRE_MINUTES`
 * cada vez que hay actividad real en el draft o en sus items.
 *
 * Si el cajero ya recibió warning (`warned_at IS NOT NULL`) y vuelve a actuar,
 * limpiamos el warning para que el modal desaparezca y vuelva a contar desde cero.
 */
class SalesDraftActivityObserver
{
    public function creating(SalesDraft $draft): void
    {
        if ($draft->status === SalesDraft::STATUS_OPEN) {
            $draft->expires_at = now()->addMinutes(SalesDraft::EXPIRE_MINUTES);
        }
    }

    /**
     * Toca el reloj cuando el draft cambia (sin entrar en loop infinito por
     * el propio update de expires_at).
     */
    public function updating(SalesDraft $draft): void
    {
        // Si el cambio es solo de expires_at/warned_at (lo hizo este observer
        // o el job de warning), no recalcular para evitar recursión.
        $touched = array_keys($draft->getDirty());
        if (! array_diff($touched, ['expires_at', 'warned_at', 'updated_at'])) {
            return;
        }

        if ($draft->status === SalesDraft::STATUS_OPEN) {
            $draft->expires_at = now()->addMinutes(SalesDraft::EXPIRE_MINUTES);
            $draft->warned_at = null;
        }
    }

    /**
     * Resetea el reloj del draft padre cuando se agrega/edita/borra un item.
     * Usamos saveQuietly() para evitar disparar updating() recursivamente.
     */
    public static function bumpDraftFromItem(SalesDraftItem $item): void
    {
        $draft = $item->draft;
        if (! $draft || $draft->status !== SalesDraft::STATUS_OPEN) {
            return;
        }

        $draft->expires_at = now()->addMinutes(SalesDraft::EXPIRE_MINUTES);
        $draft->warned_at = null;
        $draft->saveQuietly();
    }
}
