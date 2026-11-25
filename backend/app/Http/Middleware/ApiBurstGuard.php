<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Cache\RateLimiter;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

/**
 * Freno de ráfagas del grupo autenticado del POS ANTES de tocar la base
 * (2026-11-24).
 *
 * Incidente: la pantalla Traslados de una PC mandó 100–250 `GET /inventory` por
 * segundo. El `throttle` de siempre (ThrottleApi) corre DESPUÉS de `auth:sanctum`,
 * y Sanctum ya consulta la base (token, usuario, `last_used_at`): cada petición
 * rechazada con 429 igual ocupaba una conexión a Supabase. Con el pool de 15 del
 * session pooler lleno, el resto respondía 500 `EMAXCONNSESSION`.
 *
 * Este middleware cuenta por token (hash del Bearer; sin token, por IP) en el
 * store de archivo local y rechaza sin abrir conexión a la base. Corre antes que
 * la autenticación porque está en la lista de prioridad (bootstrap/app.php).
 *
 * Límites (config `cache.api_burst_limits`, «máximo:segundos»): por defecto
 * 60 en 10 s y 120 en 60 s. Medido en prod del 22 al 24 de noviembre: lo más que
 * hizo una PC normal fue 47 peticiones en 10 s y 57 en un minuto; la ráfaga del
 * incidente llegó a 393 en 10 s. El contador es por instancia de Cloud Run.
 */
class ApiBurstGuard
{
    private const PREFIX = 'api-burst:';

    public function handle(Request $request, Closure $next): Response
    {
        $limiter = new RateLimiter(Cache::store(config('cache.api_throttle_store')));
        $identity = $this->identity($request);

        foreach ($this->limits() as [$max, $seconds]) {
            $key = self::PREFIX . $seconds . ':' . $identity;

            if ($limiter->tooManyAttempts($key, $max)) {
                $retryAfter = $limiter->availableIn($key);

                throw new ThrottleRequestsException('Too Many Attempts.', null, [
                    'Retry-After' => $retryAfter,
                    'X-RateLimit-Limit' => $max,
                    'X-RateLimit-Remaining' => 0,
                ]);
            }
        }

        foreach ($this->limits() as [, $seconds]) {
            $limiter->hit(self::PREFIX . $seconds . ':' . $identity, $seconds);
        }

        return $next($request);
    }

    private function identity(Request $request): string
    {
        $token = $request->bearerToken();

        return $token !== null && $token !== ''
            ? 't:' . hash('sha256', $token)
            : 'ip:' . ($request->ip() ?? 'unknown');
    }

    /**
     * @return list<array{0:int,1:int}>
     */
    private function limits(): array
    {
        $limits = [];
        foreach (explode(',', (string) config('cache.api_burst_limits', '')) as $pair) {
            $parts = array_map('intval', explode(':', trim($pair)));
            if (count($parts) === 2 && $parts[0] > 0 && $parts[1] > 0) {
                $limits[] = [$parts[0], $parts[1]];
            }
        }

        return $limits;
    }
}
