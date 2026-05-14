<?php

namespace App\Console\Commands;

use App\Models\SalesDraft;
use Illuminate\Console\Command;

/**
 * Cancela drafts huérfanos para liberar el cupo MAX_OPEN por cajero
 * y devolver el inventario apartado a "disponible".
 *
 * Reglas (definidas en SalesDraft):
 *   - Sin items y >STALE_HOURS_EMPTY horas → cancelar
 *   - Con items y >STALE_HOURS_WITH_ITEMS horas → cancelar
 *
 * Uso manual:   php artisan drafts:cleanup
 * Dry-run:      php artisan drafts:cleanup --dry-run
 *
 * Programado en routes/console.php cada hora.
 */
class CleanupStaleDraftsCommand extends Command
{
    protected $signature = 'drafts:cleanup {--dry-run : muestra qué cancelaría sin hacerlo}';

    protected $description = 'Cancela drafts huérfanos (sin actividad) para liberar inventario y cupo de cajeros';

    public function handle(): int
    {
        $stale = SalesDraft::stale()->with(['user:id,name', 'store:id,name'])->get();

        if ($stale->isEmpty()) {
            $this->info('Sin drafts huérfanos.');

            return self::SUCCESS;
        }

        $this->info("Encontrados {$stale->count()} drafts huérfanos:");
        foreach ($stale as $draft) {
            $itemsCount = $draft->items()->count();
            $age        = $draft->updated_at->diffForHumans();
            $this->line("  #{$draft->id} · {$draft->user?->name} · {$draft->store?->name} · {$itemsCount} item(s) · {$age}");
        }

        if ($this->option('dry-run')) {
            $this->warn('DRY-RUN: no se canceló ningún draft.');

            return self::SUCCESS;
        }

        $count = SalesDraft::stale()->update(['status' => SalesDraft::STATUS_CANCELLED]);

        $this->info("Cancelados {$count} drafts.");

        return self::SUCCESS;
    }
}
