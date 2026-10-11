<?php

declare(strict_types=1);

namespace App\Services;

use App\Http\Controllers\Api\ProductController;
use App\Models\BundleAssembly;
use App\Models\Inventory;
use App\Models\InventoryMovement;
use App\Models\Product;
use App\Models\ProductBundleItem;
use App\Models\Store;
use App\Models\SystemLog;
use App\Models\User;
use App\Models\Warehouse;
use App\Support\BundleCodes;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Paquetes (2026-10-07): un paquete es una fila de `products`
 * (product_type='bundle') compuesta por 2+ productos con cantidad. Su stock
 * vive en `inventory` como el de cualquier producto, así Caja, cobro,
 * cancelaciones y reportes no se enteran. Lo que SÍ es propio del paquete:
 *
 * - Armar N en una tienda: saca N×qty de cada componente (Exhibición y/o
 *   Bodega de esa tienda, según `source`) y mete N paquetes en Exhibición.
 * - Desarmar N: saca N paquetes de Exhibición y regresa las piezas al
 *   almacén elegido (Exhibición por default).
 * - "Puedes armar" por tienda = min_i floor((exh_i + bod_i) / qty_i).
 *
 * Los movimientos usan el tipo existente `transferencia` (signo = cantidad)
 * con reference "PAQ-{id}" para no alterar el CHECK de inventory_movements;
 * la bitácora legible es `bundle_assemblies`.
 */
final class BundleService
{
    public const MIN_COMPONENTS = 2;

    public const MOVEMENT_TYPE = 'transferencia';

    public const SOURCE_AUTO = 'auto';

    public const SOURCE_STORE = 'store';

    public const SOURCE_BODEGA = 'bodega';

    private const CREATE_ATTEMPTS = 3;

    // ─── CRUD ─────────────────────────────────────────────────────────────────

    /**
     * @param array{
     *   name:string, description?:?string, sku?:?string, barcode?:?string,
     *   active?:bool, catalog_visible?:bool,
     *   prices:array<string,float|int|string|null>,
     *   components:list<array{product_id:int|string, quantity:int|string}>
     * } $data
     */
    public function create(array $data, User $user): Product
    {
        $clientSku = $this->cleanCode($data['sku'] ?? null);
        $clientBarcode = $this->cleanCode($data['barcode'] ?? null);

        for ($attempt = 1; $attempt <= self::CREATE_ATTEMPTS; $attempt++) {
            // Los códigos se calculan FUERA de la transacción: en Postgres una
            // violación unique aborta toda la transacción, así que el reintento
            // envuelve DB::transaction completo.
            $sku = $clientSku ?? BundleCodes::nextSku();
            $barcode = $clientBarcode ?? BundleCodes::generateBarcode();

            try {
                return DB::transaction(function () use ($data, $user, $sku, $barcode) {
                    $components = $this->loadAndValidateComponents($data['components']);

                    $bundle = Product::create([
                        'name' => trim((string) $data['name']),
                        'sku' => $sku,
                        'barcode' => $barcode,
                        'description' => $this->cleanText($data['description'] ?? null),
                        'active' => (bool) ($data['active'] ?? true),
                        'product_type' => Product::TYPE_BUNDLE,
                        'catalog_visible' => (bool) ($data['catalog_visible'] ?? false),
                    ]);

                    $this->writeComponents($bundle, $components);
                    ProductController::syncPrices($bundle, (array) ($data['prices'] ?? []));
                    $cost = $this->syncCost($bundle);

                    SystemLog::write(
                        action: 'bundle.created',
                        description: "Paquete creado: {$bundle->name} (SKU {$bundle->sku})",
                        userId: $user->id,
                        entityType: 'bundle',
                        entityId: $bundle->id,
                        meta: [
                            'sku' => $bundle->sku,
                            'barcode' => $bundle->barcode,
                            'components' => $components->map(fn (array $c) => ['product_id' => $c['product']->id, 'quantity' => $c['quantity']])->values()->all(),
                            'cost' => $cost,
                        ],
                    );

                    return $bundle;
                });
            } catch (UniqueConstraintViolationException $e) {
                if ($clientSku !== null || $clientBarcode !== null || $attempt === self::CREATE_ATTEMPTS) {
                    throw new \DomainException('Ese SKU o código de barras ya lo tiene otro producto. Cambia el código e intenta de nuevo.');
                }
            }
        }

        throw new \DomainException('No se pudo generar un código único para el paquete. Intenta de nuevo.');
    }

    /**
     * @param array<string,mixed> $data  Campos presentes = campos a cambiar.
     */
    public function update(Product $bundle, array $data, User $user): Product
    {
        return DB::transaction(function () use ($bundle, $data, $user) {
            $locked = $this->lockProduct($bundle->id);
            $this->assertIsBundle($locked);

            $before = $locked->only(['name', 'description', 'sku', 'barcode', 'active', 'catalog_visible']);
            $payload = [];
            if (array_key_exists('name', $data)) {
                $payload['name'] = trim((string) $data['name']);
            }
            if (array_key_exists('description', $data)) {
                $payload['description'] = $this->cleanText($data['description']);
            }
            if (array_key_exists('sku', $data) && $this->cleanCode($data['sku']) !== null) {
                $payload['sku'] = $this->cleanCode($data['sku']);
            }
            if (array_key_exists('barcode', $data) && $this->cleanCode($data['barcode']) !== null) {
                $payload['barcode'] = $this->cleanCode($data['barcode']);
            }
            if (array_key_exists('active', $data)) {
                $payload['active'] = (bool) $data['active'];
            }
            if (array_key_exists('catalog_visible', $data)) {
                $payload['catalog_visible'] = (bool) $data['catalog_visible'];
            }
            if ($payload !== []) {
                $locked->update($payload);
            }

            if (! empty($data['prices'])) {
                ProductController::syncPrices($locked, (array) $data['prices']);
            }

            $componentsDiff = null;
            if (array_key_exists('components', $data) && $data['components'] !== null) {
                $this->assertCompositionEditable($locked);
                $old = $locked->bundleItems()->get()->map(fn (ProductBundleItem $i) => ['product_id' => $i->component_product_id, 'quantity' => $i->quantity])->values()->all();
                $components = $this->loadAndValidateComponents($data['components'], $locked->id);
                $locked->bundleItems()->delete();
                $this->writeComponents($locked, $components);
                $componentsDiff = [
                    'old' => $old,
                    'new' => $components->map(fn (array $c) => ['product_id' => $c['product']->id, 'quantity' => $c['quantity']])->values()->all(),
                ];
            }

            $cost = $this->syncCost($locked);
            $locked->unsetRelation('bundleItems');

            SystemLog::write(
                action: 'bundle.updated',
                description: "Paquete actualizado: {$locked->name} (SKU {$locked->sku})",
                userId: $user->id,
                entityType: 'bundle',
                entityId: $locked->id,
                meta: [
                    'old' => $before,
                    'new' => $locked->only(['name', 'description', 'sku', 'barcode', 'active', 'catalog_visible']),
                    'components' => $componentsDiff,
                    'cost' => $cost,
                ],
            );

            return $locked;
        });
    }

    /** Borra el paquete (ninguna fila de inventory ≠ 0 y sin apartados). Devuelve cuántas ventas lo referencian. */
    public function delete(Product $bundle, User $user): int
    {
        $this->assertIsBundle($bundle);
        $imagePaths = $bundle->images->pluck('image_path')->all();

        // Todo bajo el lock del producto: un armado concurrente no puede meter
        // stock entre la validación y el borrado (inventory es cascade).
        $salesCount = DB::transaction(function () use ($bundle, $user) {
            $locked = $this->lockProduct($bundle->id);

            if ($lock = $this->stockLock($locked)) {
                throw new \DomainException('No se puede eliminar: '.($lock['assembled'] > 0
                    ? "hay {$this->fmtQty($lock['assembled'])} paquete(s) armados. Desármalos primero."
                    : "el paquete tiene inventario negativo ({$this->fmtQty($lock['negative'])}) en alguna tienda. Corrige ese ajuste primero."));
            }

            $layaways = DB::table('layaways')->where('product_id', $locked->id)->count();
            if ($layaways > 0) {
                throw new \DomainException("No se puede eliminar: el paquete tiene {$layaways} apartado(s). Puedes desactivarlo.");
            }

            $snapshot = [
                'id' => $locked->id,
                'name' => $locked->name,
                'sku' => $locked->sku,
                'barcode' => $locked->barcode,
                'components' => $locked->bundleItems()->get()->map(fn (ProductBundleItem $i) => ['product_id' => $i->component_product_id, 'quantity' => $i->quantity])->values()->all(),
                'assemblies_count' => $locked->bundleAssemblies()->count(),
            ];

            $salesCount = ProductController::snapshotAndDelete($locked);

            SystemLog::write(
                action: 'bundle.deleted',
                description: "Paquete eliminado: {$snapshot['name']} (SKU {$snapshot['sku']})",
                userId: $user->id,
                entityType: 'bundle',
                entityId: $snapshot['id'],
                meta: ['snapshot' => $snapshot, 'sales_kept' => $salesCount],
            );

            return $salesCount;
        });

        // Los archivos se borran después del commit: si la transacción falla, la foto sigue ahí.
        foreach ($imagePaths as $path) {
            Storage::delete($path);
        }

        return $salesCount;
    }

    /** Un producto que es componente de algún paquete no se borra (FK restrict + este aviso). */
    public function assertNotComponent(Product $product): void
    {
        $bundle = Product::query()
            ->whereIn('id', ProductBundleItem::query()->where('component_product_id', $product->id)->select('bundle_product_id'))
            ->orderBy('name')
            ->first(['id', 'name', 'sku']);
        if ($bundle !== null) {
            throw new \DomainException(
                "No se puede eliminar: es componente del paquete «{$bundle->name}» ({$bundle->sku}). Quítalo del paquete (o elimina el paquete) primero."
            );
        }
    }

    public function assertCompositionEditable(Product $bundle): void
    {
        $lock = $this->stockLock($bundle);
        if ($lock === null) {
            return;
        }
        if ($lock['assembled'] > 0) {
            $n = $this->fmtQty($lock['assembled']);
            throw new \DomainException("No puedes cambiar los componentes mientras haya paquetes armados (stock: {$n}). Desarma primero.");
        }
        $n = $this->fmtQty($lock['negative']);
        throw new \DomainException("No puedes cambiar los componentes: el paquete tiene inventario negativo ({$n}) en alguna tienda. Corrige ese ajuste primero.");
    }

    /** Suma de todas las filas de inventory del paquete (para mostrar `stock_total`; NO es el candado). */
    public function totalStock(Product $bundle): float
    {
        return (float) Inventory::query()->where('product_id', $bundle->id)->sum('quantity');
    }

    /**
     * Candado de stock para borrar / editar la composición (2026-10-08). Mira
     * CADA fila de `inventory` del paquete (≠ 0), no la suma: una fila negativa
     * en otra tienda (ajuste viejo) podía dejar la suma en 0 y colar el borrado
     * con paquetes armados. Devuelve null si todas las filas están en 0.
     *
     * @return array{assembled: float, negative: float}|null  Σ filas > 0 y Σ filas < 0
     */
    public function stockLock(Product $bundle): ?array
    {
        $qtys = Inventory::query()
            ->where('product_id', $bundle->id)
            ->where('quantity', '!=', 0)
            ->pluck('quantity')
            ->map(fn ($q) => (float) $q);
        if ($qtys->isEmpty()) {
            return null;
        }

        return [
            'assembled' => (float) $qtys->filter(fn (float $q) => $q > 0)->sum(),
            'negative' => (float) $qtys->filter(fn (float $q) => $q < 0)->sum(),
        ];
    }

    /** True si alguna fila de `inventory` del paquete es ≠ 0 (una negativa también cuenta). */
    public function hasStock(Product $bundle): bool
    {
        return Inventory::query()->where('product_id', $bundle->id)->where('quantity', '!=', 0)->exists();
    }

    /**
     * Costo del paquete = Σ(costo componente × qty); null si algún componente no
     * tiene costo (así sale en "Productos sin costo" en vez de inventar un número).
     */
    public function syncCost(Product $bundle): ?float
    {
        $items = ProductBundleItem::query()
            ->where('bundle_product_id', $bundle->id)
            ->with('component:id,cost')
            ->get();

        $sum = 0.0;
        $complete = $items->isNotEmpty();
        foreach ($items as $item) {
            $cost = $item->component?->cost;
            if ($cost === null || (float) $cost <= 0) {
                $complete = false;
                break;
            }
            $sum += (float) $cost * (int) $item->quantity;
        }
        $new = $complete ? round($sum, 2) : null;

        $current = $bundle->cost !== null ? round((float) $bundle->cost, 2) : null;
        if ($current !== $new) {
            $bundle->forceFill(['cost' => $new])->saveQuietly();
        }

        return $new;
    }

    // ─── Armado ───────────────────────────────────────────────────────────────

    /**
     * @param array<int,string> $sources  product_id => auto|store|bodega (faltante = auto)
     */
    public function assemble(Product $bundle, Store $store, int $quantity, User $user, ?string $notes = null, array $sources = []): BundleAssembly
    {
        if ($quantity < 1) {
            throw new \DomainException('La cantidad a armar debe ser al menos 1.');
        }

        return DB::transaction(function () use ($bundle, $store, $quantity, $user, $notes, $sources) {
            $locked = $this->lockProduct($bundle->id);
            $this->assertIsBundle($locked);

            $items = ProductBundleItem::query()
                ->where('bundle_product_id', $locked->id)
                ->with('component:id,name,sku,cost,active')
                ->orderBy('component_product_id')
                ->get();
            if ($items->count() < self::MIN_COMPONENTS) {
                throw new \DomainException('El paquete no tiene componentes válidos. Edítalo antes de armarlo.');
            }
            foreach ($sources as $pid => $mode) {
                if (! $items->contains('component_product_id', (int) $pid)) {
                    throw new \DomainException("El producto #{$pid} no es componente de este paquete.");
                }
                if (! in_array($mode, [self::SOURCE_AUTO, self::SOURCE_STORE, self::SOURCE_BODEGA], true)) {
                    throw new \DomainException('Origen inválido: elige Automático, Exhibición o Bodega.');
                }
            }

            $exh = $this->exhibicion($store);
            $bod = $this->bodega($store);
            $warehouseIds = array_values(array_filter([$exh->id, $bod?->id]));

            // Un solo SELECT ... FOR UPDATE de componentes + paquete, ordenado por
            // product_id (mismo orden que CheckoutService::reserveStock → sin deadlocks).
            $productIds = $items->pluck('component_product_id')->push($locked->id)->map(fn ($id) => (int) $id)->sort()->values()->all();
            $rows = Inventory::query()
                ->lockForUpdate()
                ->whereIn('product_id', $productIds)
                ->whereIn('warehouse_id', $warehouseIds)
                ->orderBy('product_id')
                ->orderBy('warehouse_id')
                ->get()
                ->groupBy('product_id');

            $snapshot = [];
            foreach ($items as $item) {
                $pid = (int) $item->component_product_id;
                $name = $item->component?->name ?? "Producto #{$pid}";
                $need = (int) $item->quantity * $quantity;
                $mode = $sources[$pid] ?? self::SOURCE_AUTO;

                $rowExh = $rows->get($pid)?->firstWhere('warehouse_id', $exh->id);
                $rowBod = $bod ? $rows->get($pid)?->firstWhere('warehouse_id', $bod->id) : null;
                // Un inventario negativo (ajuste viejo) no "presta" piezas.
                $availExh = max(0.0, (float) ($rowExh?->quantity ?? 0));
                $availBod = max(0.0, (float) ($rowBod?->quantity ?? 0));

                [$fromExh, $fromBod] = $this->planTake($mode, $need, $availExh, $availBod, $bod !== null, $name, $store->name, (int) $item->quantity);

                if ($fromExh > 0) {
                    $rowExh->decrement('quantity', $fromExh);
                    $this->movement($pid, $exh->id, -$fromExh, $locked, $user, "Armado de paquete «{$locked->name}» ×{$quantity}");
                }
                if ($fromBod > 0) {
                    $rowBod->decrement('quantity', $fromBod);
                    $this->movement($pid, $bod->id, -$fromBod, $locked, $user, "Armado de paquete «{$locked->name}» ×{$quantity} (desde Bodega)");
                }

                $snapshot[] = [
                    'product_id' => $pid,
                    'name' => $name,
                    'sku' => $item->component?->sku ?? '',
                    'qty_per_bundle' => (int) $item->quantity,
                    'total_qty' => $need,
                    'from_store_qty' => $fromExh,
                    'from_bodega_qty' => $fromBod,
                    'unit_cost' => $item->component?->cost !== null ? (float) $item->component->cost : null,
                ];
            }

            $bundleRow = Inventory::query()->lockForUpdate()->firstOrCreate(
                ['product_id' => $locked->id, 'warehouse_id' => $exh->id],
                ['quantity' => 0],
            );
            $bundleRow->increment('quantity', $quantity);
            $this->movement($locked->id, $exh->id, $quantity, $locked, $user, "Armado de {$quantity} paquete(s)");

            $this->syncCost($locked);

            $assembly = BundleAssembly::create([
                'bundle_product_id' => $locked->id,
                'store_id' => $store->id,
                'warehouse_id' => $exh->id,
                'user_id' => $user->id,
                'type' => BundleAssembly::TYPE_ARMADO,
                'quantity' => $quantity,
                'components_snapshot' => $snapshot,
                'notes' => $this->cleanText($notes),
            ]);

            SystemLog::write(
                action: 'bundle.assembled',
                description: "Armados {$quantity} × «{$locked->name}» en {$store->name}",
                userId: $user->id,
                entityType: 'bundle',
                entityId: $locked->id,
                meta: ['store_id' => $store->id, 'quantity' => $quantity, 'assembly_id' => $assembly->id, 'components' => $snapshot],
            );

            return $assembly;
        });
    }

    public function disassemble(Product $bundle, Store $store, int $quantity, User $user, ?string $notes = null, string $destination = self::SOURCE_STORE): BundleAssembly
    {
        if ($quantity < 1) {
            throw new \DomainException('La cantidad a desarmar debe ser al menos 1.');
        }
        if (! in_array($destination, [self::SOURCE_STORE, self::SOURCE_BODEGA], true)) {
            throw new \DomainException('Destino inválido: elige Exhibición o Bodega.');
        }

        return DB::transaction(function () use ($bundle, $store, $quantity, $user, $notes, $destination) {
            $locked = $this->lockProduct($bundle->id);
            $this->assertIsBundle($locked);

            $items = ProductBundleItem::query()
                ->where('bundle_product_id', $locked->id)
                ->with('component:id,name,sku,cost')
                ->orderBy('component_product_id')
                ->get();
            if ($items->isEmpty()) {
                throw new \DomainException('El paquete no tiene componentes registrados.');
            }

            $exh = $this->exhibicion($store);
            $dest = $destination === self::SOURCE_BODEGA
                ? ($this->bodega($store) ?? throw new \DomainException("La tienda {$store->name} no tiene Bodega. Regresa las piezas a Exhibición."))
                : $exh;

            // Mismo orden de lock que assemble(): componentes + paquete por product_id.
            $productIds = $items->pluck('component_product_id')->push($locked->id)->map(fn ($id) => (int) $id)->sort()->values()->all();
            $rows = Inventory::query()
                ->lockForUpdate()
                ->whereIn('product_id', $productIds)
                ->whereIn('warehouse_id', array_values(array_unique([$exh->id, $dest->id])))
                ->orderBy('product_id')
                ->get()
                ->groupBy('product_id');

            $bundleRow = $rows->get($locked->id)?->firstWhere('warehouse_id', $exh->id);
            $avail = (float) ($bundleRow?->quantity ?? 0);
            if ($avail < $quantity) {
                $n = $this->fmtQty($avail);
                throw new \DomainException("Solo hay {$n} paquete(s) «{$locked->name}» armados en Exhibición de {$store->name}; no puedes desarmar {$quantity}.");
            }
            $bundleRow->decrement('quantity', $quantity);
            $this->movement($locked->id, $exh->id, -$quantity, $locked, $user, "Desarmado de {$quantity} paquete(s)");

            $snapshot = [];
            foreach ($items as $item) {
                $pid = (int) $item->component_product_id;
                $qty = (int) $item->quantity * $quantity;
                $row = $rows->get($pid)?->firstWhere('warehouse_id', $dest->id)
                    ?? Inventory::query()->lockForUpdate()->firstOrCreate(['product_id' => $pid, 'warehouse_id' => $dest->id], ['quantity' => 0]);
                $row->increment('quantity', $qty);
                $this->movement($pid, $dest->id, $qty, $locked, $user, "Desarmado de paquete «{$locked->name}» ×{$quantity} → {$dest->name}");

                $snapshot[] = [
                    'product_id' => $pid,
                    'name' => $item->component?->name ?? "Producto #{$pid}",
                    'sku' => $item->component?->sku ?? '',
                    'qty_per_bundle' => (int) $item->quantity,
                    'total_qty' => $qty,
                    'to_warehouse' => $destination,
                    'unit_cost' => $item->component?->cost !== null ? (float) $item->component->cost : null,
                ];
            }

            $this->syncCost($locked);

            $assembly = BundleAssembly::create([
                'bundle_product_id' => $locked->id,
                'store_id' => $store->id,
                'warehouse_id' => $dest->id,
                'user_id' => $user->id,
                'type' => BundleAssembly::TYPE_DESARMADO,
                'quantity' => $quantity,
                'components_snapshot' => $snapshot,
                'notes' => $this->cleanText($notes),
            ]);

            SystemLog::write(
                action: 'bundle.disassembled',
                description: "Desarmados {$quantity} × «{$locked->name}» en {$store->name} → {$dest->name}",
                userId: $user->id,
                entityType: 'bundle',
                entityId: $locked->id,
                meta: ['store_id' => $store->id, 'quantity' => $quantity, 'destination' => $destination, 'assembly_id' => $assembly->id, 'components' => $snapshot],
            );

            return $assembly;
        });
    }

    // ─── Privados ─────────────────────────────────────────────────────────────

    /**
     * Serializa armar/desarmar/editar/borrar del MISMO paquete sin bloquear el
     * cobro: en Postgres `FOR UPDATE` choca con el `FOR KEY SHARE` que toman las
     * FKs de sale_items/inventory_movements al cobrar (deadlock real); `FOR NO
     * KEY UPDATE` sigue chocando consigo mismo pero no con las FKs.
     */
    private function lockProduct(int $id): Product
    {
        $query = Product::query()->whereKey($id);
        $query = DB::getDriverName() === 'pgsql' ? $query->lock('for no key update') : $query->lockForUpdate();

        return $query->firstOrFail();
    }

    private function assertIsBundle(Product $product): void
    {
        if (! $product->isBundle()) {
            throw new \DomainException('El producto no es un paquete.');
        }
    }

    /**
     * Valida y carga los componentes: existen, activos, no son paquetes, ≥ 2
     * distintos, qty ≥ 1. Dedup por product_id sumando cantidades.
     *
     * @param list<array{product_id:int|string, quantity:int|string}> $raw
     * @return Collection<int, array{product:Product, quantity:int}>
     */
    private function loadAndValidateComponents(array $raw, ?int $selfId = null): Collection
    {
        $wanted = [];
        $order = [];
        foreach ($raw as $line) {
            $pid = (int) ($line['product_id'] ?? 0);
            $qty = (int) ($line['quantity'] ?? 0);
            if ($pid <= 0) {
                throw new \DomainException('Hay un componente sin producto.');
            }
            if ($qty < 1) {
                throw new \DomainException('Cada producto necesita cantidad de 1 o más.');
            }
            if (! isset($wanted[$pid])) {
                $order[] = $pid;
            }
            $wanted[$pid] = ($wanted[$pid] ?? 0) + $qty;
        }
        if (count($wanted) < self::MIN_COMPONENTS) {
            throw new \DomainException('Un paquete necesita al menos 2 productos distintos.');
        }
        if ($selfId !== null && isset($wanted[$selfId])) {
            throw new \DomainException('Un paquete no puede contenerse a sí mismo.');
        }

        $products = Product::query()->whereIn('id', array_keys($wanted))->get()->keyBy('id');
        $out = collect();
        foreach ($order as $pid) {
            $product = $products->get($pid);
            if (! $product) {
                throw new \DomainException("El producto #{$pid} no existe.");
            }
            if ($product->isBundle()) {
                throw new \DomainException("Un paquete no puede contener otro paquete («{$product->name}»).");
            }
            if (! $product->active) {
                throw new \DomainException("El producto «{$product->name}» está inactivo y no puede ir en un paquete.");
            }
            $out->push(['product' => $product, 'quantity' => $wanted[$pid]]);
        }

        return $out;
    }

    /** @param Collection<int, array{product:Product, quantity:int}> $components */
    private function writeComponents(Product $bundle, Collection $components): void
    {
        foreach ($components->values() as $i => $c) {
            ProductBundleItem::create([
                'bundle_product_id' => $bundle->id,
                'component_product_id' => $c['product']->id,
                'quantity' => $c['quantity'],
                'position' => $i,
            ]);
        }
    }

    /**
     * Decide de dónde salen las piezas de un componente.
     *
     * @return array{0:float,1:float}  [desde Exhibición, desde Bodega]
     */
    private function planTake(string $mode, int $need, float $availExh, float $availBod, bool $hasBodega, string $name, string $storeName, int $perBundle): array
    {
        if ($mode === self::SOURCE_STORE) {
            if ($availExh < $need) {
                throw new \DomainException("Stock insuficiente de «{$name}» en Exhibición de {$storeName}. Disponible: {$this->fmtQty($availExh)}, requerido: {$need}.");
            }

            return [(float) $need, 0.0];
        }

        if ($mode === self::SOURCE_BODEGA) {
            if (! $hasBodega) {
                throw new \DomainException("La tienda {$storeName} no tiene Bodega.");
            }
            if ($availBod < $need) {
                throw new \DomainException("Stock insuficiente de «{$name}» en Bodega de {$storeName}. Disponible: {$this->fmtQty($availBod)}, requerido: {$need}.");
            }

            return [0.0, (float) $need];
        }

        $total = $availExh + $availBod;
        if ($total < $need) {
            $maxPacks = (int) floor($total / max(1, $perBundle));
            throw new \DomainException(
                "Stock insuficiente de «{$name}» en {$storeName}: Exhibición {$this->fmtQty($availExh)} + Bodega {$this->fmtQty($availBod)} = {$this->fmtQty($total)}, requerido: {$need}. Puedes armar máximo {$maxPacks} paquete(s)."
            );
        }
        $fromExh = min((float) $need, $availExh);

        return [$fromExh, (float) $need - $fromExh];
    }

    private function movement(int $productId, int $warehouseId, float|int $signedQty, Product $bundle, User $user, string $notes): void
    {
        InventoryMovement::create([
            'product_id' => $productId,
            'warehouse_id' => $warehouseId,
            'type' => self::MOVEMENT_TYPE,
            'quantity' => $signedQty,
            'reference' => "PAQ-{$bundle->id}",
            'notes' => $notes,
            'user_id' => $user->id,
        ]);
    }

    private function exhibicion(Store $store): Warehouse
    {
        $wh = Warehouse::query()
            ->where('store_id', $store->id)
            ->where('type', 'store')
            ->where('active', true)
            ->orderBy('id')
            ->first();
        if (! $wh) {
            throw new \DomainException("La tienda «{$store->name}» no tiene almacén de Exhibición.");
        }

        return $wh;
    }

    private function bodega(Store $store): ?Warehouse
    {
        return Warehouse::query()
            ->where('store_id', $store->id)
            ->where('type', 'bodega')
            ->where('active', true)
            ->orderBy('id')
            ->first();
    }

    private function cleanCode(mixed $value): ?string
    {
        $v = trim((string) ($value ?? ''));

        return $v === '' ? null : $v;
    }

    private function cleanText(mixed $value): ?string
    {
        $v = trim((string) ($value ?? ''));

        return $v === '' ? null : $v;
    }

    private function fmtQty(float $qty): string
    {
        return rtrim(rtrim(number_format($qty, 2, '.', ''), '0'), '.');
    }
}
