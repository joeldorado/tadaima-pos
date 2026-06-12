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
        // Corre DESPUÉS del pipeline: este middleware va en el grupo `api` y se
        // ejecuta antes que `auth:sanctum` (middleware de ruta) — en la ida con
        // bearer token $request->user() aún es null. Tras $next ya hay user.
        $response = $next($request);

        $user = $request->user() ?? $request->user('sanctum');
        if ($user) {
            $now = now();
            $previous = $user->last_seen_at;
            // OJO Carbon 3: diffInSeconds es CON SIGNO — $now->diffInSeconds($pasado)
            // da negativo, por lo que el dedupe original nunca volvía a escribir
            // después del primer touch y todos los usuarios aparecían
            // "desconectados" en /users/online (QA 2026-06-11).
            if (! $previous || $previous->diffInSeconds($now) >= self::DEDUPE_SECONDS) {
                // saveQuietly para no disparar listeners/observers ajenos.
                $user->forceFill(['last_seen_at' => $now])->saveQuietly();
            }
        }

        return $response;
    }
}
