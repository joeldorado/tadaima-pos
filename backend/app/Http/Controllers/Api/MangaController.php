<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMangaRequest;
use App\Http\Requests\DeleteProductRequest;
use App\Http\Requests\UpdateMangaRequest;
use App\Http\Resources\MangaCompatResource;
use App\Models\Product;
use App\Models\ProductMangaDetail;
use App\Models\SystemLog;
use App\Services\ProductDeletionService;
use App\Support\StockSql;
use App\Support\TomoCost;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Facade compat: el modelo Manga se migró a Product con product_type='manga'
 * + product_manga_details. Este controller mantiene la API pública /mangas
 * mapeando al modelo Product unificado y devolviendo el shape histórico de
 * MangaResource (vía MangaCompatResource).
 *
 * Cuando el frontend termine de migrar a /products?type=manga, este controller
 * puede eliminarse.
 */
class MangaController extends Controller
{
    /**
     * GET /mangas — lista de productos con product_type='manga'.
     *
     * Paginada (?page, ?per_page: default 50, máx 200) con el total real en
     * `pagination`. Filtros del tab Tomos (2026-10-12), todos opcionales y
     * combinables por AND con tienda y búsqueda: ?out_of_stock=1, ?low_stock=1
     * (+ ?threshold, default 10) y ?no_category=1. Antes el front los aplicaba
     * en el navegador sobre la primera página (50 de ~2.8k) y el badge de
     * /products/stats no cuadraba con la tabla; aquí usan el MISMO stock y la
     * misma definición que stats, así que `pagination.total` = el badge.
     */
    public function index(Request $request): JsonResponse
    {
        $storeId = $request->filled('store_id') ? (int) $request->store_id : null;
        $stockSql = StockSql::total($storeId);
        $stockBind = StockSql::bindings($storeId);

        $query = Product::query()
            ->ofType(Product::TYPE_MANGA)
            ->with(['mangaDetails', 'price', 'images', 'categories:product_categories.id,name'])
            ->when($request->filled('active'), fn ($q) => $q->where(
                'active',
                filter_var($request->active, FILTER_VALIDATE_BOOLEAN),
            ))
            ->when($request->filled('genre'), fn ($q) => $q
                ->whereHas('mangaDetails', fn ($d) => $d->where('genre', $request->genre)))
            ->when($request->filled('editorial'), fn ($q) => $q
                ->whereHas('mangaDetails', fn ($d) => $d->where('editorial', $request->editorial)))
            // Nombre, SKU, código de barras y también editorial / género: es lo
            // que promete el buscador del tab, y con paginación server-side ya
            // no hay un filtro en el navegador que lo "complete".
            ->when($request->filled('search'), fn ($q) => $q->where(function ($q2) use ($request) {
                $like = '%' . trim((string) $request->search) . '%';
                $q2->whereLike('name', $like, caseSensitive: false)
                   ->orWhereLike('sku', $like, caseSensitive: false)
                   ->orWhereLike('barcode', $like, caseSensitive: false)
                   ->orWhereHas('mangaDetails', fn ($d) => $d->where(fn ($d2) => $d2
                       ->whereLike('editorial', $like, caseSensitive: false)
                       ->orWhereLike('genre', $like, caseSensitive: false)));
            }));

        if ($request->boolean('out_of_stock')) {
            $query->whereRaw("{$stockSql} = 0", $stockBind);
        } elseif ($request->boolean('low_stock')) {
            $threshold = max(1, (int) $request->get('threshold', 10));
            $query->whereRaw("{$stockSql} > 0", $stockBind)
                ->whereRaw("{$stockSql} <= ?", [...$stockBind, $threshold]);
        }

        // Sin NINGUNA categoría: lee el pivote, no la caché products.category_id.
        if ($request->boolean('no_category')) {
            $query->whereDoesntHave('categories');
        }

        // Con stock primero (misma regla que Productos, Joel 2026-08-05: los
        // agotados no estorban al inicio), luego por nombre. El `id` desempata:
        // hay muchos tomos con el mismo nombre y sin él una fila puede repetirse
        // o saltarse entre páginas.
        $query->orderByRaw("({$stockSql}) = 0", $stockBind)
            ->orderBy('name')
            ->orderBy('id');

        // Visibilidad por tienda — mismo patrón que ProductController::index.
        // Default: solo tomos CON inventario en la tienda. Con
        // ?include_unassigned=1 también los "no asignados" (stock 0) para que la
        // sucursal les agregue stock. `is_assigned` distingue 0 de no-asignado.
        if ($storeId) {
            if (! $request->boolean('include_unassigned')) {
                $query->whereHas('inventory', fn ($q) =>
                    $q->whereHas('warehouse', fn ($wq) =>
                        $wq->where('store_id', $storeId)
                    )
                );
            }
            $query->withSum(['inventory' => fn ($q) =>
                $q->whereHas('warehouse', fn ($wq) =>
                    $wq->where('store_id', $storeId)
                )
            ], 'quantity')->withExists(['inventory as is_assigned' => fn ($q) =>
                $q->whereHas('warehouse', fn ($wq) =>
                    $wq->where('store_id', $storeId)
                )
            ]);
        } else {
            $query->withSum('inventory', 'quantity');
        }

        $perPage = min((int) ($request->per_page ?? 50), 200);
        $results = $query->paginate($perPage);

        return $this->success([
            'data'       => MangaCompatResource::collection($results->items()),
            'pagination' => [
                'total'        => $results->total(),
                'per_page'     => $results->perPage(),
                'current_page' => $results->currentPage(),
                'last_page'    => $results->lastPage(),
            ],
        ]);
    }

    /**
     * Resuelve el COSTO REAL del producto de librería.
     *
     * En librería el costo no se captura directo: se deriva del precio público
     * y el margen de ganancia. `costo = precio × (1 − margen/100)`. Ej: precio
     * 100, margen 30% → costo 70. Si el request manda `cost` explícito (otro
     * flujo), se respeta. Este costo se persiste en `products.cost` y de ahí lo
     * leen reportes (utilidad), el snapshot ADR-015 y la vista de caja.
     */
    private function resolveCost(array $data): ?float
    {
        if (isset($data['cost']) && $data['cost'] !== null) {
            return round((float) $data['cost'], 2);
        }

        $price  = $data['public_price'] ?? null;
        $margin = $data['profit_margin_percent'] ?? null;
        if ($price !== null && $margin !== null && $margin >= 0 && $margin < 100) {
            return round((float) $price * (1 - (float) $margin / 100), 2);
        }

        return null;
    }

    /**
     * Costo a guardar al EDITAR un tomo; null = no tocar el costo.
     *
     * Bug 2026-10-03: el modal mandaba `profit_margin_percent: 0` cuando el
     * campo iba vacío (usuario sin permiso de ver costos, o campo borrado) y
     * el costo quedaba igual al precio. Las cajas con el bundle viejo en caché
     * lo siguen mandando, por eso aquí un margen 0/vacío significa "conservar
     * el margen que ya tiene el tomo":
     *  - precio A sin cambio  → el costo no se toca;
     *  - precio A cambia      → el costo sigue al precio con su mismo margen.
     * La base es el precio A que QUEDA guardado (`price_1`). `public_price` no
     * se persiste: solo sirve de base en tomos legacy sin precio A.
     */
    private function resolveCostForUpdate(Product $manga, array $data): ?float
    {
        $precioViejo = $manga->price?->price_1 !== null ? (float) $manga->price->price_1 : null;
        $precioNuevo = array_key_exists('price_1', $data)
            ? $data['price_1']
            : ($precioViejo ?? ($data['public_price'] ?? null));
        if ($precioNuevo === null || (float) $precioNuevo <= 0) {
            return null;
        }
        $precioNuevo = (float) $precioNuevo;

        $vigente = TomoCost::margenVigente($manga->cost !== null ? (float) $manga->cost : null, $precioViejo);
        $enviado = TomoCost::margenUtilizable($data['profit_margin_percent'] ?? null);

        // Se compara a 2 decimales (lo que muestra el modal): abrir y guardar
        // sin cambiar nada no debe mover centavos.
        $margenCambio = $enviado !== null && ($vigente === null || round($enviado, 2) !== round($vigente, 2));
        $precioCambio = $precioViejo === null || abs($precioNuevo - $precioViejo) >= 0.005;

        $margen = $margenCambio ? $enviado : $vigente;
        if ($margen === null || (! $margenCambio && ! $precioCambio)) {
            return null;
        }

        return TomoCost::desdePrecio($precioNuevo, $margen);
    }

    /**
     * POST /mangas — crea un producto con product_type='manga' + manga_details.
     */
    public function store(StoreMangaRequest $request): JsonResponse
    {
        $data = $request->validated();

        $product = DB::transaction(function () use ($data) {
            // Mapear campos legacy de manga a campos de product.
            $product = Product::create([
                'name'         => $data['name'],
                'sku'          => $data['code'] ?? ('MANGA-' . uniqid()),
                'barcode'      => $data['code'] ?? null,
                'cost'         => $this->resolveCost($data),
                'active'       => $data['active'] ?? true,
                'product_type' => Product::TYPE_MANGA,
            ]);

            ProductMangaDetail::create([
                'product_id'    => $product->id,
                'volume_number' => $data['volume_number'] ?? null,
                'editorial'     => $data['editorial'] ?? null,
                'genre'         => $data['genre'] ?? null,
            ]);

            // Categorías múltiples (2026-08-17): los tomos también las llevan.
            if (array_key_exists('category_ids', $data)) {
                $product->syncCategories($data['category_ids'] ?? []);
            }

            $hasPrice = collect(['price_1','price_2','price_3','price_4','price_5'])
                ->contains(fn ($k) => isset($data[$k]) && $data[$k] !== null);
            if ($hasPrice) {
                $product->price()->create([
                    'price_1' => $data['price_1'] ?? null,
                    'price_2' => $data['price_2'] ?? null,
                    'price_3' => $data['price_3'] ?? null,
                    'price_4' => $data['price_4'] ?? null,
                    'price_5' => $data['price_5'] ?? null,
                ]);
            }

            return $product;
        });

        $product->load(['mangaDetails', 'price', 'images', 'categories:product_categories.id,name'])
                ->loadSum('inventory', 'quantity');

        SystemLog::write(
            action: 'manga.created',
            description: "Manga creado: {$product->name} (SKU: {$product->sku})",
            entityType: 'manga',
            entityId: $product->id,
            meta: [
                'sku'           => $product->sku,
                'name'          => $product->name,
                'volume_number' => $data['volume_number'] ?? null,
                'editorial'     => $data['editorial']     ?? null,
            ],
        );

        return $this->success(new MangaCompatResource($product), 'Manga creado.', 201);
    }

    /**
     * PUT /mangas/{manga} — actualiza producto manga + sus detalles.
     */
    public function update(UpdateMangaRequest $request, Product $manga): JsonResponse
    {
        if ($resp = $this->adminOrManagerGateError()) {
            return $resp;
        }

        // Route model binding: {manga} resuelve a Product. Validamos que sea
        // realmente un manga para evitar editar productos regulares por esta vía.
        if ($manga->product_type !== Product::TYPE_MANGA) {
            return $this->error('El producto no es de tipo manga.', 422);
        }

        $data = $request->validated();

        // Snapshot ANTES de mutar para construir diff en el log.
        $before = $manga->only(['name', 'sku', 'barcode', 'cost', 'active']);
        $beforeDetail = $manga->mangaDetails?->only(['volume_number', 'editorial', 'genre']) ?? [];

        // Se resuelve ANTES de la transacción: compara contra el precio A actual.
        $cost = $this->resolveCostForUpdate($manga, $data);

        DB::transaction(function () use ($manga, $data, $cost): void {
            $productPayload = array_filter([
                'name'    => $data['name']    ?? null,
                'sku'     => $data['code']    ?? null,
                'barcode' => $data['code']    ?? null,
                // Costo real derivado del precio A y el margen (la librería no
                // captura costo directo; se calcula con %). null = no tocar:
                // array_filter lo descarta y no pisa el costo existente.
                'cost'    => $cost,
                'active'  => array_key_exists('active', $data) ? $data['active'] : null,
            ], fn ($v) => $v !== null);

            if (! empty($productPayload)) {
                $manga->update($productPayload);
            }

            if (array_key_exists('category_ids', $data)) {
                $manga->syncCategories($data['category_ids'] ?? []);
            }

            $hasDetail = collect(['volume_number','editorial','genre'])
                ->contains(fn ($k) => array_key_exists($k, $data));
            if ($hasDetail) {
                ProductMangaDetail::updateOrCreate(
                    ['product_id' => $manga->id],
                    [
                        'volume_number' => $data['volume_number'] ?? null,
                        'editorial'     => $data['editorial']     ?? null,
                        'genre'         => $data['genre']         ?? null,
                    ],
                );
            }

            $hasPrice = collect(['price_1','price_2','price_3','price_4','price_5'])
                ->contains(fn ($k) => array_key_exists($k, $data));
            if ($hasPrice) {
                $manga->price()->updateOrCreate(
                    ['product_id' => $manga->id],
                    [
                        'price_1' => $data['price_1'] ?? null,
                        'price_2' => $data['price_2'] ?? null,
                        'price_3' => $data['price_3'] ?? null,
                        'price_4' => $data['price_4'] ?? null,
                        'price_5' => $data['price_5'] ?? null,
                    ],
                );
            }
        });

        $manga->load(['mangaDetails', 'price', 'images', 'categories:product_categories.id,name'])
              ->loadSum('inventory', 'quantity');

        // Diff: producto + detalles. Solo registra si hubo cambios reales.
        $afterDetail = $manga->mangaDetails?->only(['volume_number', 'editorial', 'genre']) ?? [];
        $changes = [];
        foreach ($before as $field => $oldValue) {
            $newValue = $manga->{$field} ?? null;
            if ($oldValue != $newValue) {
                $changes[$field] = ['old' => $oldValue, 'new' => $newValue];
            }
        }
        foreach (['volume_number', 'editorial', 'genre'] as $field) {
            $oldValue = $beforeDetail[$field] ?? null;
            $newValue = $afterDetail[$field] ?? null;
            if ($oldValue != $newValue) {
                $changes["details.{$field}"] = ['old' => $oldValue, 'new' => $newValue];
            }
        }
        if (! empty($changes)) {
            SystemLog::write(
                action: 'manga.updated',
                description: "Manga editado: {$manga->name} (SKU: {$manga->sku})",
                entityType: 'manga',
                entityId: $manga->id,
                meta: ['changes' => $changes],
            );
        }

        return $this->success(new MangaCompatResource($manga), 'Manga actualizado.');
    }

    /**
     * POST /mangas/{manga}/image/upload — sube imagen al producto.
     */
    public function uploadImage(Request $request, Product $manga): JsonResponse
    {
        if ($manga->product_type !== Product::TYPE_MANGA) {
            return $this->error('El producto no es de tipo manga.', 422);
        }

        $request->validate([
            'image' => ['required', 'file', 'image', 'max:5120'],
        ]);

        // Reemplaza la imagen primaria (sort_order=0). Productos pueden tener
        // múltiples imágenes pero mangas tradicionalmente solo una.
        $manga->images()->where('sort_order', 0)->each(function ($img) {
            Storage::delete($img->image_path);
            $img->delete();
        });

        $path = $request->file('image')->store("products/{$manga->id}");
        $manga->images()->create([
            'image_path' => $path,
            'sort_order' => 0,
        ]);

        return $this->success([
            'image_url' => Storage::url($path),
        ], 'Imagen subida.', 201);
    }

    /**
     * DELETE /mangas/{manga}
     *
     * Misma puerta que /products (ProductDeletionService, 2026-10-09): apartados y
     * paquetes bloquean, `expected` opcional de la vista previa, ventas se quedan.
     */
    public function destroy(DeleteProductRequest $request, Product $manga, ProductDeletionService $deletion): JsonResponse
    {
        // Eliminar tomo = permiso de ver costo (admin o gerente con can_view_cost).
        if ($resp = $this->canDeleteProductsError()) {
            return $resp;
        }

        if ($manga->product_type !== Product::TYPE_MANGA) {
            return $this->error('El producto no es de tipo manga.', 422);
        }

        $snapshot = ['id' => $manga->id, 'name' => $manga->name, 'sku' => $manga->sku];

        try {
            $result = $deletion->delete($manga, $request->user(), force: false, expected: $request->expected());
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }
        $salesCount = $result['sales_kept'];

        SystemLog::write(
            action: 'manga.deleted',
            description: "Manga eliminado: {$snapshot['name']} (SKU: {$snapshot['sku']})",
            entityType: 'manga',
            entityId: $snapshot['id'],
            meta: ['mode' => 'hard', 'snapshot' => $snapshot, 'sales_kept' => $salesCount, 'audit' => $result['audit']],
        );

        return $this->success(null, $salesCount > 0
            ? "Manga eliminado. Sus {$salesCount} venta(s) quedan en el historial y reportes."
            : 'Manga eliminado.');
    }
}
