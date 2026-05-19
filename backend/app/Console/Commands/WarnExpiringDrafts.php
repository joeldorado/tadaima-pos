<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\SalesDraft;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Marca drafts que llegaron a su `expires_at` y aún no han sido advertidos.
 * El frontend dispara modal "por vencer" cuando ve `warned_at IS NOT NULL`.
 *
 * Solo afecta drafts CON items: un draft vacío que vence sin warning va directo
 * al expirar (handled por `CancelExpiredWarnedDrafts`).
 */
class WarnExpiringDrafts extends Command
{
    protected $signature = 'drafts:warn-expiring';

    protected $description = 'Marca warned_at en drafts open vencidos para que el frontend dispare modal.';

    public function handle(): int
    {
        $affected = SalesDraft::query()
            ->where('status', SalesDraft::STATUS_OPEN)
            ->whereNull('warned_at')
            ->where('expires_at', '<=', now())
            ->whereHas('items')
            ->update(['warned_at' => now()]);

        $this->info("Drafts marcados por vencer: {$affected}");

        return Command::SUCCESS;
    }
}
