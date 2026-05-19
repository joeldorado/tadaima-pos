<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\SalesDraft;
use Illuminate\Console\Command;

/**
 * Cancela drafts que:
 *  - Ya fueron advertidos (`warned_at IS NOT NULL`)
 *  - El cajero tuvo WARNING_GRACE_MINUTES para responder y no lo hizo
 *
 * También cancela drafts vacíos vencidos (sin items, sin warning previo) que
 * son residuos de pruebas / "Vaciar Carrito" que no llamó cancel.
 */
class CancelExpiredWarnedDrafts extends Command
{
    protected $signature = 'drafts:expire-warned';

    protected $description = 'Cancela drafts open que ya recibieron warning y no respondieron en grace period.';

    public function handle(): int
    {
        $graceCutoff = now()->subMinutes(SalesDraft::WARNING_GRACE_MINUTES);

        // Drafts CON items advertidos: respetar grace period antes de cancelar.
        $withItems = SalesDraft::query()
            ->where('status', SalesDraft::STATUS_OPEN)
            ->whereNotNull('warned_at')
            ->where('warned_at', '<=', $graceCutoff)
            ->update(['status' => SalesDraft::STATUS_CANCELLED]);

        // Drafts SIN items vencidos: cancelar directo, no merecen warning porque
        // no hay nada que el cajero quiera proteger.
        $emptyExpired = SalesDraft::query()
            ->where('status', SalesDraft::STATUS_OPEN)
            ->where('expires_at', '<=', now())
            ->whereDoesntHave('items')
            ->update(['status' => SalesDraft::STATUS_CANCELLED]);

        $total = $withItems + $emptyExpired;
        $this->info("Drafts cancelados: {$total} (con_items={$withItems}, vacios={$emptyExpired})");

        return Command::SUCCESS;
    }
}
