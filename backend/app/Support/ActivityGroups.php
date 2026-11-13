<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Catálogo del feed de Actividad (módulo solo-admin, 2026-10-29): traduce
 * las dos fuentes de auditoría —`system_logs.action` e
 * `inventory_movements.type`— a un GRUPO (chip del filtro) y a un título
 * legible en español. Es la única lista que hay que tocar cuando aparece
 * una acción nueva; una acción desconocida cae en `sistema` con su nombre
 * crudo, nunca se pierde.
 *
 * El frontend tiene un espejo de los grupos en `landing/src/lib/activityFormat.ts`.
 */
final class ActivityGroups
{
    public const GROUPS = ['stock', 'producto', 'venta', 'caja', 'paquete', 'preventa', 'apartado', 'regalo', 'promo', 'cliente', 'usuario', 'catalogo', 'config', 'insumo', 'sistema', 'impresion'];

    /** Prefijo que distingue un tipo de movimiento de una acción de log en el filtro `action`. */
    public const MOVEMENT_ACTION_PREFIX = 'mov.';

    /** `inventory_movements.type` => [grupo, título]. */
    public const MOVEMENT_TYPES = [
        'entrada'            => ['stock',    'Entrada de stock'],
        'ajuste'             => ['stock',    'Ajuste de stock'],
        'transferencia'      => ['stock',    'Traslado'],
        'venta'              => ['venta',    'Venta'],
        'devolucion'         => ['venta',    'Devolución'],
        'apartado'           => ['venta',    'Apartado'],
        'apartado_cancelado' => ['venta',    'Apartado cancelado'],
        'preventa'           => ['preventa', 'Preventa (stock reservado)'],
        'preventa_cancelada' => ['preventa', 'Preventa cancelada'],
    ];

    /**
     * Movimientos cuyo grupo lo decide la REFERENCIA, no el tipo: armar o
     * desarmar un paquete deja `transferencia` con `PAQ-{id}` y borrar un
     * corte deja `devolucion` con `BORRADO-CORTE-{id}`.
     * prefijo => [grupo, título].
     */
    public const REFERENCE_OVERRIDES = [
        'PAQ-'           => ['paquete', 'Movimiento por paquete'],
        'BORRADO-CORTE-' => ['caja',    'Reverso por corte borrado'],
    ];

    /** `system_logs.action` => [grupo, título]. */
    public const LOG_ACTIONS = [
        'product.created'             => ['producto',  'Producto creado'],
        'product.updated'             => ['producto',  'Producto editado'],
        'product.deleted'             => ['producto',  'Producto eliminado'],
        'product.force_deleted'       => ['producto',  'Producto eliminado (total)'],
        'product.store_price_updated' => ['producto',  'Precio por tienda cambiado'],
        'product.store_price_removed' => ['producto',  'Precio por tienda quitado'],
        'manga.created'               => ['producto',  'Tomo creado'],
        'manga.updated'               => ['producto',  'Tomo editado'],
        'manga.deleted'               => ['producto',  'Tomo eliminado'],
        'category.deleted'            => ['producto',  'Categoría eliminada'],
        'inventory.adjusted'          => ['stock',     'Stock ajustado'],
        'inventory.restore_failed'    => ['stock',     'Falló restaurar stock'],
        'sale.cancelled'              => ['venta',     'Venta cancelada'],
        'sale.payment_changed'        => ['venta',     'Método de pago corregido'],
        // Regalos de Caja (2026-11-02). Ver App\Support\GiftAudit.
        'sale.gift'                   => ['regalo',    'Regalo'],
        'sale.gift_cancelled'         => ['regalo',    'Regalo cancelado'],
        'cash_session.deleted'        => ['caja',      'Corte eliminado'],
        'cash_session.force_closed'   => ['caja',      'Corte cerrado por admin'],
        'income_movement.created'     => ['caja',      'Ingreso registrado'],
        'income_movement.deleted'     => ['caja',      'Ingreso borrado'],
        'supply_movement.deleted'     => ['insumo',    'Registro de insumo borrado'],
        'bundle.created'              => ['paquete',   'Paquete creado'],
        'bundle.updated'              => ['paquete',   'Paquete editado'],
        'bundle.deleted'              => ['paquete',   'Paquete eliminado'],
        'bundle.assembled'            => ['paquete',   'Paquete armado'],
        'bundle.disassembled'         => ['paquete',   'Paquete desarmado'],
        'pre_sale_order.cancelled'    => ['preventa',  'Folio de preventa cancelado o entrega revertida'],
        'pre_sale_order.delivery'     => ['preventa',  'Entrega de preventa'],
        'pre_sale_order_item.delivered' => ['preventa', 'Partida de preventa entregada'],
        'pre_sale_order_item.reverted'  => ['preventa', 'Entrega de partida revertida'],
        'pre_sale_catalog.created'    => ['preventa',  'Catálogo de preventa creado'],
        'pre_sale_catalog.updated'    => ['preventa',  'Catálogo de preventa editado'],
        'pre_sale_catalog.status_changed' => ['preventa', 'Estado de catálogo cambiado'],
        'pre_sale_catalog.cancelled'  => ['preventa',  'Catálogo de preventa cancelado'],
        // Cobertura total (2026-11-02): promos, usuarios/roles, clientes, configuración,
        // catálogo online, apartados y operación de caja. Ver App\Support\ModelAudit.
        'promo.created'               => ['promo',     'Promoción creada'],
        'promo.updated'               => ['promo',     'Promoción editada'],
        'promo.deleted'               => ['promo',     'Promoción eliminada'],
        'promo.products_attached'     => ['promo',     'Productos asignados a promoción'],
        'promo.products_detached'     => ['promo',     'Productos quitados de promoción'],
        'user.created'                => ['usuario',   'Usuario creado'],
        'user.updated'                => ['usuario',   'Usuario editado'],
        'user.deactivated'            => ['usuario',   'Usuario desactivado'],
        'user.role_assigned'          => ['usuario',   'Rol asignado'],
        'user.role_removed'           => ['usuario',   'Rol quitado'],
        'role.created'                => ['usuario',   'Rol creado'],
        'role.updated'                => ['usuario',   'Rol editado'],
        'role.permissions_updated'    => ['usuario',   'Permisos de rol cambiados'],
        'customer.created'            => ['cliente',   'Cliente creado'],
        'customer.updated'            => ['cliente',   'Cliente editado'],
        'customer.deleted'            => ['cliente',   'Cliente eliminado'],
        'customer.credit_added'       => ['cliente',   'Crédito de cliente registrado'],
        'store.created'               => ['config',    'Tienda creada'],
        'store.updated'               => ['config',    'Tienda editada'],
        'store.payment_method_assigned' => ['config',  'Método de pago asignado a tienda'],
        'warehouse.created'           => ['config',    'Bodega creada'],
        'warehouse.updated'           => ['config',    'Bodega editada'],
        'warehouse.deleted'           => ['config',    'Bodega eliminada'],
        'terminal.created'            => ['config',    'Terminal creada'],
        'terminal.updated'            => ['config',    'Terminal editada'],
        'terminal.deleted'            => ['config',    'Terminal eliminada'],
        'payment_method.created'      => ['config',    'Método de pago creado'],
        'payment_method.updated'      => ['config',    'Método de pago editado'],
        'supplier.created'            => ['config',    'Proveedor creado'],
        'supplier.updated'            => ['config',    'Proveedor editado'],
        'supplier.deleted'            => ['config',    'Proveedor eliminado'],
        'supply.created'              => ['insumo',    'Insumo creado'],
        'supply.updated'              => ['insumo',    'Insumo editado'],
        'supply_movement.created'     => ['insumo',    'Registro de insumo'],
        'catalog.settings_updated'    => ['catalogo',  'Configuración de catálogo online'],
        'catalog.product_added'       => ['catalogo',  'Producto añadido al catálogo online'],
        'catalog.product_visibility'  => ['catalogo',  'Visibilidad en catálogo online'],
        'catalog.product_removed'     => ['catalogo',  'Producto quitado del catálogo online'],
        'catalog.product_flags_updated' => ['catalogo', 'Destacado / visible en catálogo'],
        'catalog.featured_reordered'  => ['catalogo',  'Orden de destacados guardado'],
        'layaway.created'             => ['apartado',  'Apartado creado'],
        'layaway.updated'             => ['apartado',  'Apartado editado'],
        'layaway.payment_added'       => ['apartado',  'Abono de apartado'],
        'layaway.delivered'           => ['apartado',  'Apartado entregado'],
        'layaway.cancelled'           => ['apartado',  'Apartado cancelado'],
        'cash_session.opened'         => ['caja',      'Caja abierta'],
        'cash_session.closed'         => ['caja',      'Caja cerrada'],
        'cash_movement.created'       => ['caja',      'Movimiento de caja'],
        'products.tomos_depurados'        => ['sistema', 'Depuración de tomos (comando)'],
        'products.tomos_costo_homologado' => ['sistema', 'Costo de tomos homologado (comando)'],
        'products.tomos_costo_revertido'  => ['sistema', 'Costo de tomos revertido (comando)'],
        'products.purged_no_stock'        => ['sistema', 'Purga de productos sin stock (comando)'],
        'qz_print_ok'                 => ['impresion', 'Ticket impreso'],
        'qz_print_error'              => ['impresion', 'Error de impresión'],
    ];

    /**
     * Logs que el feed oculta por default (`include_noise=0`): la telemetría
     * de impresión y `inventory.adjusted`, que duplica al movimiento `ajuste`
     * (el movimiento siempre existe; el log solo cuando delta ≠ 0).
     */
    public const NOISE_LOG_ACTIONS = ['qz_print_ok', 'qz_print_error', 'inventory.adjusted'];

    /** `entity_type` de los logs cuyo `entity_id` es un `products.id`. */
    public const PRODUCT_ENTITY_TYPES = ['product', 'manga', 'bundle', 'inventory'];

    /** Nombres legibles de los campos que aparecen en `meta.changes`. */
    public const FIELD_LABELS = [
        'name'             => 'nombre',
        'sku'              => 'SKU',
        'barcode'          => 'código de barras',
        'description'      => 'descripción',
        'category_id'      => 'categoría',
        'categories'       => 'categorías',
        'supplier_id'      => 'proveedor',
        'cost'             => 'costo',
        'active'           => 'activo',
        'product_type'     => 'tipo',
        'prices.price_1'   => 'precio Normal',
        'prices.price_2'   => 'precio Socio',
        'prices.price_3'   => 'precio Mayorista',
        'prices.price_4'   => 'precio D',
        'prices.price_5'   => 'precio E',
        'payment.allow_cash' => 'acepta efectivo',
        'payment.allow_card' => 'acepta tarjeta',
        'details.volume_number' => 'número de tomo',
        'details.editorial' => 'editorial',
        'details.genre'    => 'género',
        'phone'            => 'teléfono',
        'email'            => 'correo',
        'address'          => 'dirección',
        'store_id'         => 'tienda',
        'can_view_cost'    => 've costos',
        'can_edit_catalog' => 'edita catálogo',
        'can_manage_promos' => 'gestiona promos',
        'buy_n'            => 'lleva N',
        'pay_m'            => 'paga M',
        'min_qty'          => 'mínimo de piezas',
        'discount_per_unit' => 'descuento por pieza',
        'allow_cash'       => 'con efectivo',
        'allow_card'       => 'con tarjeta',
        'priority'         => 'prioridad',
        'status'           => 'estado',
        'starts_at'        => 'inicia',
        'ends_at'          => 'termina',
        'commission_percent' => '% comisión',
        'is_active'        => 'activo',
        'unit'             => 'unidad',
        'category'         => 'categoría',
        'show_price'       => 'muestra precio',
        'show_stock'       => 'muestra stock',
        'featured'         => 'destacado',
        'catalog_visible'  => 'visible en catálogo',
        'notes'            => 'notas',
        'expires_at'       => 'vence',
        'loyalty_tier'     => 'nivel de lealtad',
        'points'           => 'puntos',
        'type'             => 'tipo',
    ];

    public static function movementGroup(string $type, ?string $reference): string
    {
        return self::movementEntry($type, $reference)[0];
    }

    public static function movementTitle(string $type, ?string $reference): string
    {
        return self::movementEntry($type, $reference)[1];
    }

    /** @return array{0: string, 1: string} */
    private static function movementEntry(string $type, ?string $reference): array
    {
        foreach (self::REFERENCE_OVERRIDES as $prefix => $entry) {
            if ($reference !== null && str_starts_with($reference, $prefix)) {
                return $entry;
            }
        }

        return self::MOVEMENT_TYPES[$type] ?? ['stock', ucfirst(str_replace('_', ' ', $type))];
    }

    public static function logGroup(string $action): string
    {
        return self::LOG_ACTIONS[$action][0] ?? 'sistema';
    }

    /**
     * Título del log. Para ediciones enumera hasta 3 campos cambiados
     * ("Producto editado: nombre, precio 1"); sin cambios registrados lo dice.
     */
    public static function logTitle(string $action, ?array $meta): string
    {
        $base = self::LOG_ACTIONS[$action][1] ?? $action;

        if (str_ends_with($action, '.updated')) {
            $changes = is_array($meta['changes'] ?? null) ? $meta['changes'] : [];
            $keys = array_values(array_filter(array_keys($changes), 'is_string'));
            if ($keys === []) {
                return $base.' (sin cambios registrados)';
            }
            $labels = array_map(fn (string $k) => self::FIELD_LABELS[$k] ?? $k, array_slice($keys, 0, 3));
            $suffix = count($keys) > 3 ? ' y '.(count($keys) - 3).' más' : '';

            return $base.': '.implode(', ', $labels).$suffix;
        }

        return $base;
    }

    /**
     * Tipos de movimiento que pertenecen a esos grupos (sin contar los
     * overrides por referencia, que el servicio aplica aparte).
     *
     * @param  list<string>  $groups
     * @return list<string>
     */
    public static function movementTypesFor(array $groups): array
    {
        $types = [];
        foreach (self::MOVEMENT_TYPES as $type => [$group]) {
            if (in_array($group, $groups, true)) {
                $types[] = $type;
            }
        }

        return $types;
    }

    /**
     * Acciones de log para esos grupos. `in` = acciones conocidas de esos
     * grupos; `catch_unknown` = true cuando se pidió `sistema` (entran
     * también las acciones que no están en el catálogo).
     *
     * @param  list<string>  $groups
     * @return array{in: list<string>, catch_unknown: bool}
     */
    public static function logActionsFor(array $groups): array
    {
        $in = [];
        foreach (self::LOG_ACTIONS as $action => [$group]) {
            if (in_array($group, $groups, true)) {
                $in[] = $action;
            }
        }

        return ['in' => $in, 'catch_unknown' => in_array('sistema', $groups, true)];
    }

    /** @return list<string> todas las acciones del catálogo. */
    public static function knownLogActions(): array
    {
        return array_keys(self::LOG_ACTIONS);
    }

    public static function isMovementAction(string $action): bool
    {
        return str_starts_with($action, self::MOVEMENT_ACTION_PREFIX);
    }

    public static function movementTypeFromAction(string $action): string
    {
        return substr($action, strlen(self::MOVEMENT_ACTION_PREFIX));
    }
}
