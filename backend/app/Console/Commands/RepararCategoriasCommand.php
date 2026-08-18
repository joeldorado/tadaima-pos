<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Support\CategoryPivotRepair;
use Illuminate\Console\Command;

/**
 * tadaima:reparar-categorias — productos con `category_id` pero sin renglón
 * en el pivote de categorías múltiples (los escribe el servicio viejo de
 * tadaima.poslite.com.mx). Ver App\Support\CategoryPivotRepair.
 *
 * Corre LOCAL contra Supabase (mismos guards que tadaima:import-macro):
 *   php artisan tadaima:reparar-categorias --dry-run
 *   php artisan tadaima:reparar-categorias
 */
class RepararCategoriasCommand extends Command
{
    protected $signature = 'tadaima:reparar-categorias
        {--dry-run : Solo contar, sin escribir nada}
        {--connection=pgsql_target : Conexión Laravel destino}
        {--unsafe-host : Permitir un target que no sea *.supabase.co (QA/tests)}';

    protected $description = 'Inserta en el pivote la categoría (category_id) de los productos que el servicio viejo dejó sin renglón';

    public function handle(): int
    {
        $connName = (string) $this->option('connection');

        if (app()->environment('production')) {
            $this->error('Este comando NUNCA corre en producción (es una herramienta local).');

            return self::FAILURE;
        }
        $host = (string) config("database.connections.{$connName}.host");
        if (! str_contains($host, 'supabase.co') && ! $this->option('unsafe-host')) {
            $this->error("El target ({$connName}: {$host}) no es Supabase — usa --unsafe-host si es intencional (QA local).");

            return self::FAILURE;
        }

        $pending = CategoryPivotRepair::pendingCount($connName);
        $this->info("Productos con category_id y sin pivote: {$pending}");

        if ($this->option('dry-run') || $pending === 0) {
            $this->line($pending === 0 ? 'Nada que reparar.' : 'Dry-run: no se escribió nada.');

            return self::SUCCESS;
        }

        $repaired = CategoryPivotRepair::run($connName);
        $this->info("Reparados: {$repaired}. Pendientes ahora: ".CategoryPivotRepair::pendingCount($connName));

        return self::SUCCESS;
    }
}
