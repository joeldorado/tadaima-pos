<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Illuminate\Cache\RateLimiter;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;

/**
 * `throttle` del grupo autenticado del POS, con el contador fuera de la base
 * (2026-11-17).
 *
 * El `throttle:120,1` normal cuenta en el store de caché por defecto, que en
 * producción es la base: ~6 consultas a Supabase en CADA petición solo para
 * contar. Aquí el contador va al store de `cache.api_throttle_store` (archivo
 * local en producción). El límite pasa a ser por instancia de Cloud Run, que
 * para amortiguar polling o abuso de un usuario ya autenticado alcanza.
 *
 * Solo para rutas autenticadas: la llave es el id del usuario, así que hay a lo
 * mucho un contador por usuario. Los límites de inicio de sesión y de la tienda
 * de EE. UU. (`throttle:pos-login`, `us-*`) siguen en el store por defecto a
 * propósito: su llave trae datos que escribe el visitante (correo, IP) y ahí sí
 * importa que el conteo sea compartido entre instancias.
 */
class ThrottleApi extends ThrottleRequests
{
    public function __construct()
    {
        parent::__construct(new RateLimiter(Cache::store(config('cache.api_throttle_store'))));
    }
}
