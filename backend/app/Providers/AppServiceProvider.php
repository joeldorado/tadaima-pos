<?php

namespace App\Providers;

use App\Models\SalesDraft;
use App\Observers\SalesDraftActivityObserver;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // ADR-014: el carrito vive client-side hasta el cobro. Sin drafts en vivo
        // que extender/expirar, este observer queda desactivado. Se mantiene la
        // clase en código por si volvemos al modelo server-authoritative.
        // SalesDraft::observe(SalesDraftActivityObserver::class);
    }
}
