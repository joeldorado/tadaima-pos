<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Limpia drafts huérfanos cada hora — libera inventario apartado y cupo de cajeros.
// Ver App\Console\Commands\CleanupStaleDraftsCommand y App\Models\SalesDraft::scopeStale.
Schedule::command('drafts:cleanup')
    ->hourly()
    ->withoutOverlapping()
    ->runInBackground();

// ADR-014: client-authoritative cart. Sin drafts en vivo no hay nada que
// expirar — los drafts solo existen al cobrar. Comandos quedan en el repo
// por si volvemos al modelo server-authoritative.
// Schedule::command('drafts:warn-expiring')->everyMinute()->withoutOverlapping();
// Schedule::command('drafts:expire-warned')->everyMinute()->withoutOverlapping();
