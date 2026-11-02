<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\SystemLog;
use Illuminate\Database\Eloquent\Model;

/**
 * Auditoría genérica de modelos para Administración → Actividad (2026-11-02).
 *
 * Hasta hoy solo productos, stock, ventas, caja (borrar/forzar), paquetes y
 * preventas dejaban rastro en `system_logs`. Promos, usuarios y roles,
 * clientes, tiendas/bodegas/terminales/métodos de pago, proveedores e
 * insumos, el catálogo online, los apartados y la operación diaria de caja no
 * decían quién hizo qué. Este helper da la misma receta a todos:
 *
 *  - `snapshot()` toma una foto normalizada de los campos que importan.
 *  - `updated()` escribe el diff antes → después y, sin cambio real, NO escribe.
 *  - `created()` / `deleted()` / `event()` registran altas, bajas y acciones sueltas.
 *
 * Nunca entran campos sensibles (`password`, `password_enc`, tokens): quien
 * audite un usuario pasa solo los campos de `TRACKED` que le toquen y marca
 * `password_changed` aparte. Cada action nueva se titula en
 * `ActivityGroups::LOG_ACTIONS`; si no, cae en «Sistema» con su nombre crudo.
 */
final class ModelAudit
{
    private const SENSITIVE = ['password', 'password_enc', 'remember_token', 'api_token'];

    /** @param  list<string>  $fields */
    public static function snapshot(Model $model, array $fields): array
    {
        $out = [];
        foreach ($fields as $field) {
            if (in_array($field, self::SENSITIVE, true)) {
                continue;
            }
            $out[$field] = self::normalize($model->getAttribute($field));
        }

        return $out;
    }

    /** @return array<string, array{from: mixed, to: mixed}> */
    public static function diff(array $before, array $after): array
    {
        $changes = [];
        foreach ($after as $field => $to) {
            $from = $before[$field] ?? null;
            if ($from !== $to) {
                $changes[$field] = ['from' => $from, 'to' => $to];
            }
        }

        return $changes;
    }

    /** @param  list<string>  $fields */
    public static function created(Model $model, string $action, string $description, string $entityType, array $fields, ?int $userId = null, array $extra = []): void
    {
        self::event($action, $description, $entityType, (int) $model->getKey(), array_merge(['values' => self::snapshot($model, $fields)], $extra), $userId);
    }

    /**
     * Diff contra la foto previa (`snapshot()` antes de `update()`). Sin
     * cambio real no escribe nada, salvo que `$extra` traiga algo (p. ej.
     * `password_changed`).
     *
     * @param  list<string>  $fields
     */
    public static function updated(Model $model, array $before, string $action, string $description, string $entityType, array $fields, ?int $userId = null, array $extra = []): void
    {
        $changes = self::diff($before, self::snapshot($model->refresh(), $fields));
        if ($changes === [] && $extra === []) {
            return;
        }

        self::event($action, $description, $entityType, (int) $model->getKey(), array_merge(['changes' => $changes], $extra), $userId);
    }

    /** Baja: guarda la foto completa para que el feed siga diciendo qué era. */
    public static function deleted(Model $model, string $action, string $description, string $entityType, array $fields, ?int $userId = null, array $extra = []): void
    {
        self::event($action, $description, $entityType, (int) $model->getKey(), array_merge(['snapshot' => self::snapshot($model, $fields)], $extra), $userId);
    }

    public static function event(string $action, string $description, string $entityType, int $entityId, array $meta = [], ?int $userId = null): void
    {
        SystemLog::write($action, $description, $userId, $entityType, $entityId, $meta === [] ? null : $meta);
    }

    /** Fechas a Y-m-d H:i:s y floats a 2 decimales, para que un diff sin cambio real salga vacío. */
    public static function normalize(mixed $value): mixed
    {
        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d H:i:s');
        }
        if (is_float($value)) {
            return round($value, 2);
        }
        if (is_array($value)) {
            return array_map([self::class, 'normalize'], $value);
        }

        return $value;
    }
}
