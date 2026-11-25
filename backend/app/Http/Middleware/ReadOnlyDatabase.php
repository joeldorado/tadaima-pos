<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Candado de SOLO LECTURA para el entorno local `prodro` (backend local leyendo
 * la base de producción para ver datos reales sin tocarlos).
 *
 * Pone la sesión de Postgres en `default_transaction_read_only = on`: cualquier
 * INSERT/UPDATE/DELETE que se cuele truena con "cannot execute ... in a
 * read-only transaction" en vez de escribir en prod. Se registra solo cuando
 * `APP_ENV=prodro` (ver bootstrap/app.php); en prod y en tests no existe.
 *
 * Excepciones conscientes (metadatos de sesión, no datos del negocio):
 * - `POST /auth/login`: Sanctum inserta el token.
 * - Resolver el usuario ANTES del SET: Sanctum actualiza
 *   `personal_access_tokens.last_used_at` al autenticar.
 */
class ReadOnlyDatabase
{
    public function handle(Request $request, Closure $next): Response
    {
        // El SET de abajo es de SESIÓN. En el pooler en modo transacción (puerto
        // 6543) caería en una conexión que comparte prod y le pondría solo
        // lectura a las ventas de las tiendas. prodro va siempre por el 5432.
        if ((string) config('database.connections.pgsql.port') === '6543') {
            abort(500, 'prodro no puede usar el pooler en modo transacción (6543): usa el 5432.');
        }

        if ($request->is('api/*/auth/login')) {
            return $next($request);
        }

        // Autenticar primero (escribe last_used_at del token) y luego cerrar.
        $request->user('sanctum');

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('SET default_transaction_read_only = on');
        }

        return $next($request);
    }
}
