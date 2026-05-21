<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Actualiza `users.last_seen_at` en cada request autenticada, con dedupe
 * interno: si el valor previo es < 30 segundos atrás no se reescribe (evita
 * miles de writes por minuto sin sacrificar resolución).
 *
 * Se aplica al grupo de rutas autenticadas en `bootstrap/app.php` (o en el
 * `RouteServiceProvider`). El admin/gerente lee este campo vía `GET /users/online`
 * para saber qué cajeros están "conectados" aunque no hayan abierto caja.
 */
class TouchLastSeen
{
    private const DEDUPE_SECONDS = 30;

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user) {
            $now = now();
            $previous = $user->last_seen_at;
            if (! $previous || $now->diffInSeconds($previous) >= self::DEDUPE_SECONDS) {
                // updateQuietly para no disparar listeners/observers ajenos.
                $user->forceFill(['last_seen_at' => $now])->saveQuietly();
            }
        }
        return $next($request);
    }
}
