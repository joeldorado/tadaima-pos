# Conexiones a Supabase: que una PC no tumbe Caja de todas las tiendas

> 2026-11-24. Defensa del lado del servidor tras el incidente de Traslados (la causa
> inmediata, la pantalla que disparaba miles de consultas, se arregló en el front en
> `fix/traslados-rafaga-stock`). Datos de los logs de Cloud Run `tadaima` (proyecto
> `tadaimapos`, us-east1).

## 1. Qué pasó

- **24-nov, 21:20–22:33 UTC**: una sola PC (pantalla Traslados) mandó ~18,700
  `GET /api/v1/inventory?product_id=…`, hasta **681 por minuto** y **393 en 10 s**
  (lo más que hizo una PC normal del 22 al 24 de noviembre: **57 por minuto y 47 en 10 s**).
- Cloud Run escaló de 1 a 4–5 instancias (un momento 8). Hubo hasta **100 peticiones
  en vuelo** a la vez (75 en una sola instancia). En un día normal: p99.9 = **4**.
- Resultado: **3,697 respuestas 500** (`SQLSTATE[08006] … EMAXCONNSESSION max clients
  reached in session mode - max clients are limited to pool_size: 15`) y 7,394 líneas
  de ese error en el log.
- Todas las 500 de esa ventana fueron de esa PC: las otras tiendas tuvieron poco tráfico
  y les tocó lugar en el pool **por suerte**. Con el pool lleno, cualquier petición de
  cualquier tienda que llegue en ese momento truena igual.
- **No fue la primera vez**: el mismo error salió el 5-nov (332 líneas), 13-nov, 14-nov,
  15-nov y 17-nov, en ráfagas más chicas.
- El `throttle` de siempre (120/min) casi no frenó: rechazó 1,207 de ~19,000. Dos razones:
  1. **Corre después de `auth:sanctum`.** Sanctum consulta la base (token, usuario,
     `last_used_at`) antes de que el throttle diga que no: cada 429 igual ocupaba una
     conexión. `TouchLastSeen` además volvía a resolver al usuario después del 429.
  2. **El contador es por instancia** (archivo local, regla 12 de `AGENTS.md`): con 5
     instancias la PC tenía 5 × 120 = 600 por minuto.
- Efecto colateral: otras dos PCs de la misma tienda recibieron 288 respuestas 429. El
  throttle cuenta por **usuario**, y la cuenta era la misma en las tres PCs.

## 2. Las cuentas: conexiones posibles contra el pool

El session pooler de Supabase (`aws-0-us-east-1.pooler.supabase.com:5432`) da **una
conexión real a Postgres por cada cliente conectado** y deja como máximo `pool_size` =
**15** por usuario + base + modo. El cliente 16 **no espera**: recibe `EMAXCONNSESSION`
al instante.

Cada worker de php-fpm abre su conexión en la primera consulta de la petición y la
suelta al terminar (PDO no persistente). Entonces:

| Pieza | Antes | Dónde se define |
|---|---|---|
| `pm.max_children` (workers por instancia) | **20** | `Dockerfile` |
| `--concurrency` (peticiones por instancia) | 40 | Cloud Run |
| `--max-instances` | **5** | Cloud Run |
| `--min-instances` | 1 | Cloud Run |
| **Conexiones posibles** | **20 × 5 = 100** | |
| `pool_size` del session pooler | **15** | Supabase → Database → Connection pooling |

Con **una sola instancia** ya cabían 20 > 15. El servicio nunca tuvo cómo respetar el pool.

## 3. Opciones evaluadas

### A. Que las cuentas cuadren: workers × instancias < pool (RECOMENDADA, parte 1)

`pm.max_children = 6` y `--max-instances 2` → **12 conexiones** como máximo; quedan 3
de holgura para las migraciones del arranque de una revisión nueva, la revisión
`candidate` mientras se prueba y `prodro` local.

- Lo que no cabe **espera en la cola de php-fpm** (backlog del socket) en vez de tronar.
- Capacidad: 12 peticiones en paralelo. Normal p99.9 = 4 en vuelo; el pico legítimo más
  alto que vi fueron ~15 `products/lookup` simultáneos de una Caja (esperan ~0.5 s más).
- Memoria: 6 × 512 MB de `memory_limit` sigue por encima de 1 GiB en teoría, pero menos
  que 20 × 512 MB de hoy; la carga pesada de Caja es una sola petición a la vez.
- Riesgo: si una ráfaga logra pasar, las otras tiendas **esperan** detrás de ella en la
  cola (lento en vez de error). Por eso va junto con B.
- Riesgo en deploy: con `--no-traffic --tag candidate` la revisión candidata levanta su
  propia instancia (6 más): en el peor caso 18 > 15 solo si todo está saturado a la vez.
  Si se quiere holgura real, subir `pool_size` a 20–25 (opción C).

`--concurrency` puede quedarse en 40 (con 6 workers, el resto espera en php-fpm) o bajar
a 20 para que Cloud Run reparta antes a la segunda instancia. Recomiendo **20**.

### B. Frenar la ráfaga ANTES de tocar la base (RECOMENDADA, parte 2 — en este PR)

`App\Http\Middleware\ApiBurstGuard`, primero en el grupo autenticado y en la lista de
prioridad antes de `AuthenticatesRequests` (así también va antes de los route bindings):

- Cuenta por **token** (hash SHA-256 del Bearer; sin token, por IP) en el store de archivo.
  Otras PCs de la misma cuenta tienen otro token y no pagan la ráfaga de una.
- Límites por defecto `60:10,120:60` (60 en 10 s y 120 por minuto), configurables con
  `API_BURST_LIMITS`; vacío = apagado. Margen sobre lo normal (47 y 57).
- Un 429 suyo hace **0 consultas** (lo fija `ApiBurstGuardTest`). `TouchLastSeen` ya no
  resuelve al usuario cuando la respuesta es 429.
- `ThrottleApi` (120/min por usuario, después de autenticar) se queda igual.
- Con `--max-instances 2`, lo más que deja pasar a un token es 2 × 120 = 240 por minuto
  (~4 por segundo, ~2 conexiones ocupadas). La ráfaga del incidente (393 en 10 s)
  habría quedado en 120 cada 10 s y casi todo en 429 sin tocar Supabase.
- Sigue siendo por instancia: un contador compartido necesitaría Redis/Memorystore (costo
  fijo nuevo) o la base (lo que justo queremos evitar). Con 2 instancias no hace falta.

### C. Subir `pool_size` en Supabase (opcional, holgura)

Ayuda, pero solo no resuelve nada: 100 conexiones posibles contra cualquier pool
razonable. El tope real lo pone `max_connections` del compute de Supabase (las conexiones
directas, el pooler y los servicios de Supabase comparten ese número). **Antes de
moverlo**, ver en el dashboard el tamaño de compute y cuántas conexiones usa Supabase
(Database → Roles / Reports). Si es Micro o Small, 20–25 es razonable para dar holgura al
deploy. Es un cambio de configuración de prod: **solo con OK de Joel**.

### D. Transaction mode (puerto 6543) — evaluado, NO por ahora

Ventaja: el pooler multiplexa; muchos clientes (cientos, según el compute) comparten las
15 conexiones reales y, cuando no hay una libre, **esperan** en vez de recibir
`EMAXCONNSESSION`.

Qué revisé del código:

| Punto | Resultado |
|---|---|
| Sentencias preparadas | Ya no se usan: `PDO::PGSQL_ATTR_DISABLE_PREPARES` (regla 12) |
| `DB::transaction` + `lockForUpdate` | Bien: la transacción entera va en una conexión real |
| Advisory locks, `LISTEN`, tablas temporales, `CONCURRENTLY`, `$withinTransaction=false` | No hay |
| `SET search_path to "public"` que Laravel manda al conectar | Es de sesión: cae en una conexión cualquiera y la deja así; las demás consultas pueden ir a otras con el search_path de Supabase. Hoy no importa (todo está en `public` y los índices trigram no dependen del search_path), pero es una diferencia silenciosa |
| `ReadOnlyDatabase` (prodro) | **Peligroso**: `SET default_transaction_read_only = on` es de sesión. En el 6543 caería en una conexión compartida con prod y dejaría en solo lectura las ventas de las tiendas. Este PR hace que prodro truene si lo apuntan al 6543 |
| Migraciones del arranque | Laravel corre cada migración en transacción: funcionan; aun así, más seguro por 5432 |

No lo recomiendo como primer paso: A + B ya hacen que el servicio no pueda pasarse del
pool, sin cambiar la forma en que la app habla con la base. Queda como plan B si algún
día hacen falta más de 2 instancias (prueba: revisión `candidate` con `DB_PORT=6543` y
`--no-traffic`, smoke de Caja/venta/preventa, y vigilar errores de prepared statements o
`read-only transaction`).

### E. 500 → 503 cuando el pool está lleno (seguimiento)

Hoy `EMAXCONNSESSION` sale como 500 genérico. Mapearlo a 503 con `Retry-After` dejaría
que el front reintente con calma. Chico, pero aparte.

## 4. Recomendación

1. **Mergear este PR** (freno antes de autenticar + `pm.max_children = 6` + candado de
   prodro). No toca configuración de prod por sí solo.
2. **Con OK de Joel**, en el mismo deploy o justo después:

   ```bash
   gcloud run services update tadaima --max-instances 2 --concurrency 20 --project tadaimapos --region us-east1
   ```

   (crea una revisión nueva con la misma imagen y env; rollback: volver a `--max-instances 5 --concurrency 40`).
   **Ojo:** desplegar el PR con `--max-instances 5` deja 6 × 5 = 30 posibles: mejor que
   100, pero sigue sin caber. Van juntos.
3. Opcional, con OK de Joel: `pool_size` a 20–25 en Supabase para holgura en deploys.

## 5. Cómo probarlo (sin tocar Supabase)

- `cd backend && php artisan test --filter ApiBurstGuardTest` — el 429 llega antes de
  autenticar, con 0 consultas, y no castiga a otro token.
- Suite completa SQLite. **Nunca** apuntar tests a Supabase: `RefreshDatabase` la vacía.
- php-fpm: en la revisión `candidate` el log de arranque no debe traer errores de
  `pm.*` (php-fpm se niega a arrancar si `max_spare_servers` > `max_children`). No hay
  Docker propio en la máquina de Joel (el que hay es de otros clientes), así que el tope
  de workers se valida en prod mirando que `EMAXCONNSESSION` no vuelva a salir:

  ```bash
  gcloud logging read 'resource.labels.service_name="tadaima" AND textPayload:"EMAXCONNSESSION"' --project tadaimapos --freshness 1d --format="value(timestamp)"
  ```

- En la tienda: una sesión normal de Caja y Traslados no debe ver 429. Si alguien los ve
  sin ráfaga, subir `API_BURST_LIMITS` con `--update-env-vars` (crea revisión nueva con
  la misma imagen; también con OK de Joel).
