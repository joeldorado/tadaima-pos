<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AssembleBundleRequest;
use App\Http\Requests\DisassembleBundleRequest;
use App\Http\Requests\PreviewBundleRequest;
use App\Http\Requests\StoreBundleRequest;
use App\Http\Requests\UpdateBundleRequest;
use App\Http\Resources\BundleAssemblyResource;
use App\Http\Resources\BundleResource;
use App\Models\BundleAssembly;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use App\Services\BundleAvailability;
use App\Services\BundleService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Paquetes (2026-10-07): definición global (todas las tiendas la ven), stock
 * por tienda. Cualquier rol crea/edita/arma en SU tienda (admin elige tienda);
 * borrar usa el mismo candado que borrar producto (canDeleteProductsError).
 * Se asume un almacén de Exhibición y uno de Bodega por tienda (el servicio
 * toma el primero activo por id).
 */
class BundlesController extends Controller
{
    private const DEFAULT_PER_PAGE = 50;

    private const MAX_PER_PAGE = 200;

    public function __construct(
        private readonly BundleService $service,
        private readonly BundleAvailability $availability,
    ) {
    }

    /** GET /bundles?store_id=&search=&active=&page=&per_page= */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $storeId = $request->integer('store_id') ?: null;
        if ($storeId !== null && ($resp = $this->storeScopeError($request, $storeId))) {
            return $resp;
        }
        $storeIds = BundleAvailability::allowedStoreIds($user, $storeId);

        $perPage = min(self::MAX_PER_PAGE, max(1, (int) $request->get('per_page', self::DEFAULT_PER_PAGE)));
        $query = $this->baseQuery()
            ->when($request->filled('search'), fn (Builder $q) => $q->search((string) $request->get('search')))
            ->when($request->has('active'), fn (Builder $q) => $q->where('active', $request->boolean('active')))
            ->orderByDesc('active')
            ->orderBy('name')
            ->orderBy('id');

        $paginator = $query->paginate($perPage);
        $bundles = $paginator->getCollection();
        $availability = $this->availability->availabilityForMany($bundles, $storeIds);

        $data = $bundles->map(fn (Product $b) => (new BundleResource($b))
            ->withAvailability($availability[$b->id] ?? [])
            ->resolve($request))->values();

        return $this->success([
            'data' => $data,
            'pagination' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    /** POST /bundles */
    public function store(StoreBundleRequest $request): JsonResponse
    {
        try {
            $bundle = $this->service->create($request->validated(), $request->user());
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success($this->present($request, $bundle->fresh()), 'Paquete creado.', 201);
    }

    /** POST /bundles/preview — disponibilidad por tienda de una composición. */
    public function preview(PreviewBundleRequest $request): JsonResponse
    {
        $user = $request->user();
        $storeId = $request->integer('store_id') ?: null;
        if ($storeId !== null && ($resp = $this->storeScopeError($request, $storeId))) {
            return $resp;
        }
        $storeIds = BundleAvailability::allowedStoreIds($user, $storeId);
        $bundleId = $request->integer('bundle_id') ?: null;

        $lines = array_map(fn (array $c) => ['product_id' => (int) $c['product_id'], 'quantity' => (int) $c['quantity']], $request->validated('components'));
        $products = Product::query()
            ->whereIn('id', array_column($lines, 'product_id'))
            ->with('price')
            ->get()
            ->keyBy('id');

        $canViewCost = $user instanceof User && $user->canViewCost();
        $priceSum = 0.0;
        $costSum = 0.0;
        $costComplete = true;
        $components = [];
        foreach ($lines as $line) {
            $p = $products->get($line['product_id']);
            $price1 = $p?->price?->price_1;
            $priceSum += $price1 !== null ? (float) $price1 * $line['quantity'] : 0;
            if ($p?->cost === null || (float) $p->cost <= 0) {
                $costComplete = false;
            } else {
                $costSum += (float) $p->cost * $line['quantity'];
            }
            $components[] = array_merge([
                'product_id' => $line['product_id'],
                'name' => $p?->name ?? "Producto #{$line['product_id']}",
                'sku' => $p?->sku ?? '',
                'quantity' => $line['quantity'],
                'price_1' => $price1 !== null ? (float) $price1 : null,
            ], $canViewCost ? ['cost' => $p?->cost !== null ? (float) $p->cost : null] : []);
        }

        return $this->success([
            'components' => $components,
            'suggested_price_sum' => round($priceSum, 2),
            'cost_sum' => $canViewCost ? ($costComplete ? round($costSum, 2) : null) : null,
            'availability' => $this->availability->availabilityForComponents($lines, $storeIds, $bundleId),
        ]);
    }

    /** GET /bundles/{id}?store_id= */
    public function show(Request $request, int $id): JsonResponse
    {
        $bundle = $this->baseQuery()->findOrFail($id);
        $storeId = $request->integer('store_id') ?: null;
        if ($storeId !== null && ($resp = $this->storeScopeError($request, $storeId))) {
            return $resp;
        }

        return $this->success($this->present($request, $bundle, withHistory: true, requestedStoreId: $storeId));
    }

    /**
     * PUT /bundles/{id} — misma política que editar productos: admin o gerente
     * (un paquete es global a todas las tiendas: su precio/activo no lo cambia
     * un cajero). Crear, armar y desarmar sí quedan abiertos a cualquier rol.
     */
    public function update(UpdateBundleRequest $request, int $id): JsonResponse
    {
        if ($resp = $this->adminOrManagerGateError()) {
            return $resp;
        }
        if ($request->has('catalog_visible') && ($resp = $this->catalogEditError())) {
            return $resp;
        }
        $bundle = Product::query()->bundles()->findOrFail($id);
        try {
            $this->service->update($bundle, $request->validated(), $request->user());
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success($this->present($request, $this->baseQuery()->findOrFail($id)), 'Paquete actualizado.');
    }

    /** DELETE /bundles/{id} */
    public function destroy(Request $request, int $id): JsonResponse
    {
        if ($resp = $this->canDeleteProductsError()) {
            return $resp;
        }
        $bundle = Product::query()->bundles()->with('images')->findOrFail($id);
        try {
            $salesCount = $this->service->delete($bundle, $request->user());
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success(null, $salesCount > 0
            ? "Paquete eliminado. Sus {$salesCount} venta(s) quedan en el historial y reportes."
            : 'Paquete eliminado.');
    }

    /** POST /bundles/{id}/assemble */
    public function assemble(AssembleBundleRequest $request, int $id): JsonResponse
    {
        return $this->mutateStock($request, $id, function (Product $bundle, Store $store, User $user) use ($request) {
            return $this->service->assemble(
                $bundle,
                $store,
                (int) $request->validated('quantity'),
                $user,
                $request->validated('notes'),
                $request->sourcesMap(),
            );
        }, fn (BundleAssembly $a, Store $s) => "Se armaron {$a->quantity} paquete(s) en {$s->name}.");
    }

    /** POST /bundles/{id}/disassemble */
    public function disassemble(DisassembleBundleRequest $request, int $id): JsonResponse
    {
        return $this->mutateStock($request, $id, function (Product $bundle, Store $store, User $user) use ($request) {
            return $this->service->disassemble(
                $bundle,
                $store,
                (int) $request->validated('quantity'),
                $user,
                $request->validated('notes'),
                (string) ($request->validated('destination') ?? BundleService::SOURCE_STORE),
            );
        }, fn (BundleAssembly $a, Store $s) => "Se desarmaron {$a->quantity} paquete(s) en {$s->name}.");
    }

    /** GET /bundles/{id}/assemblies?store_id=&page=&per_page= */
    public function assemblies(Request $request, int $id): JsonResponse
    {
        $bundle = Product::query()->bundles()->findOrFail($id);
        $user = $request->user();
        $storeId = $request->integer('store_id') ?: null;
        if ($storeId !== null && ($resp = $this->storeScopeError($request, $storeId))) {
            return $resp;
        }
        $storeIds = BundleAvailability::allowedStoreIds($user, $storeId);
        $perPage = min(self::MAX_PER_PAGE, max(1, (int) $request->get('per_page', 20)));

        $paginator = BundleAssembly::query()
            ->where('bundle_product_id', $bundle->id)
            ->whereIn('store_id', $storeIds)
            ->with(['store:id,name', 'warehouse:id,name,type', 'user:id,name'])
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate($perPage);

        return $this->success([
            'data' => BundleAssemblyResource::collection($paginator->getCollection())->resolve($request),
            'pagination' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * @param callable(Product, Store, User): BundleAssembly $action
     * @param callable(BundleAssembly, Store): string $message
     */
    private function mutateStock(Request $request, int $id, callable $action, callable $message): JsonResponse
    {
        $bundle = Product::query()->bundles()->findOrFail($id);
        $storeId = (int) $request->validated('store_id');
        if ($resp = $this->storeScopeError($request, $storeId)) {
            return $resp;
        }
        $store = Store::query()->findOrFail($storeId);
        if (! $store->active) {
            return $this->error('Esa tienda está inactiva.', 422);
        }

        try {
            $assembly = $action($bundle, $store, $request->user());
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        $assembly->load(['store:id,name', 'warehouse:id,name,type', 'user:id,name']);
        $fresh = $this->baseQuery()->findOrFail($id);

        return $this->success([
            'assembly' => (new BundleAssemblyResource($assembly))->resolve($request),
            'bundle' => $this->present($request, $fresh, requestedStoreId: $storeId),
        ], $message($assembly, $store));
    }

    private function baseQuery(): Builder
    {
        return Product::query()
            ->bundles()
            ->with([
                'price',
                'images',
                'bundleItems.component' => fn ($q) => $q->with(['price', 'images']),
            ])
            ->withSum('inventory', 'quantity');
    }

    /** @return array<string,mixed> */
    private function present(Request $request, Product $bundle, bool $withHistory = false, ?int $requestedStoreId = null): array
    {
        $user = $request->user();
        $storeIds = BundleAvailability::allowedStoreIds($user, $requestedStoreId);
        $bundle->loadMissing(['price', 'images', 'bundleItems.component.price', 'bundleItems.component.images']);

        $resource = (new BundleResource($bundle))
            ->withAvailability($this->availability->availabilityFor($bundle, $storeIds))
            ->withStockTotal($this->service->totalStock($bundle));

        if ($withHistory) {
            $history = BundleAssembly::query()
                ->where('bundle_product_id', $bundle->id)
                ->whereIn('store_id', $storeIds)
                ->with(['store:id,name', 'warehouse:id,name,type', 'user:id,name'])
                ->orderByDesc('created_at')
                ->orderByDesc('id')
                ->limit(20)
                ->get();
            $resource->withAssemblies($history);
        }

        return $resource->resolve($request);
    }
}
