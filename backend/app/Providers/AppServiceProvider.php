<?php

namespace App\Providers;

use App\Models\SalesDraft;
use App\Observers\SalesDraftActivityObserver;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
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
        // TadaimaUS público — limiters CON NOMBRE (bucket propio por ruta).
        // El throttle inline (`throttle:60,1`) comparte UN solo bucket por IP
        // entre todas las rutas de invitados: la firma es domain|ip, sin URI
        // (ThrottleRequests::resolveRequestSignature). Con inline, navegar el
        // catálogo consumía el límite de 10/min del checkout y POST /us/orders
        // regresaba 429 sin haber mandado un solo pedido (bug real, F2 local).
        RateLimiter::for('us-catalog', fn (Request $request) => Limit::perMinute(60)->by($request->ip()));
        RateLimiter::for('us-orders', fn (Request $request) => Limit::perMinute(10)->by($request->ip()));
        RateLimiter::for('us-leads', fn (Request $request) => Limit::perMinute(10)->by($request->ip()));

        // Logins — bucket por ip+cuenta (frena fuerza bruta sin castigar a
        // toda la IP de un café/oficina por un vecino equivocándose).
        RateLimiter::for('us-auth', fn (Request $request) => Limit::perMinute(5)
            ->by($request->ip() . '|' . strtolower((string) $request->input('identifier'))));
        RateLimiter::for('pos-login', fn (Request $request) => Limit::perMinute(10)
            ->by($request->ip() . '|' . strtolower((string) $request->input('email'))));

        // ADR-014: el carrito vive client-side hasta el cobro. Sin drafts en vivo
        // que extender/expirar, este observer queda desactivado. Se mantiene la
        // clase en código por si volvemos al modelo server-authoritative.
        // SalesDraft::observe(SalesDraftActivityObserver::class);
    }
}
