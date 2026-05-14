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
