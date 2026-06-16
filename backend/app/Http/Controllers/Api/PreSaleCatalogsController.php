<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePreSaleCatalogRequest;
use App\Http\Requests\UpdatePreSaleCatalogRequest;
use App\Http\Requests\UpdatePreSaleCatalogStatusRequest;
use App\Http\Resources\PreSaleCatalogResource;
use App\Models\PreSaleCatalog;
use App\Models\PreSaleOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PreSaleCatalogsController extends Controller
{
    /**
     * GET /pre-sale-catalogs
     *
     * Query params: status, category_id, supplier_id, per_page
     */
    public function index(Request $request): JsonResponse
    {
        $query = PreSaleCatalog::with([
            'category', 'supplier', 'product',
            'orderItems',
            // Nested order.store_id necesario para calcular reservados por tienda
            // sin N+1 al renderizar reserved_by_store en el resource.
            'activeOrderItems.order:id,store_id',
            'soldOrderItems', 'deliveredOrderItems.order:id,store_id', 'storeLimits',
        ])
            ->when($request->filled('status'),      fn ($q) => $q->where('status',      $request->status))
            ->when($request->filled('category_id'), fn ($q) => $q->where('category_id', $request->category_id))
            ->when($request->filled('supplier_id'), fn ($q) => $q->where('supplier_id', $request->supplier_id))
            ->latest();

        $perPage = min((int) ($request->per_page ?? 25), 500);
        $results = $query->paginate($perPage);

        return $this->success([
            'data'       => PreSaleCatalogResource::collection($results->items()),
            'pagination' => [
                'total'        => $results->total(),
                'per_page'     => $results->perPage(),
                'current_page' => $results->currentPage(),
                'last_page'    => $results->lastPage(),
            ],
        ]);
    }

    /**
     * POST /pre-sale-catalogs
     *
     * Admin crea un nuevo catálogo de preventa.
     * Por defecto status = draft hasta que admin lo publique.
     */
    public function store(StorePreSaleCatalogRequest $request): JsonResponse
    {
        if (!$request->user()->hasRole('admin') && !$request->user()->hasRole('gerente')) {
            return $this->error('Sin permisos para gestionar catálogos.', 403);
        }

        $data = $request->validated();

        $catalog = PreSaleCatalog::create([
            'product_name'    => $data['product_name'],
            'category_id'     => $data['category_id'] ?? null,
            'supplier_id'     => $data['supplier_id'] ?? null,
            'product_id'      => $data['product_id'] ?? null,
            'created_by'      => $request->user()->id,
            'cost'            => $data['cost'] ?? null,
            'margin_percent'  => $data['margin_percent'] ?? null,
            'price_1'         => $data['price_1'],
            'price_2'         => $data['price_2'] ?? null,
            'price_3'         => $data['price_3'] ?? null,
            'price_4'         => $data['price_4'] ?? null,
            'price_5'         => $data['price_5'] ?? null,
            'advance_payment' => $data['advance_payment'] ?? 0,
            'preorder_limit'  => $data['preorder_limit'] ?? null,
            'arrival_date'    => $data['arrival_date'] ?? null,
            'pickup_deadline' => $data['pickup_deadline'] ?? null,
            'status'          => $data['status'] ?? PreSaleCatalog::STATUS_DRAFT,
        ]);

        $this->syncStoreLimits($catalog, $data['store_limits'] ?? null, $this->storeLimitScope($request));

        return $this->success(
            new PreSaleCatalogResource($catalog->load(['category', 'supplier', 'product', 'createdBy', 'storeLimits'])),
            201
        );
    }

    /**
     * Sync de límites por tienda. Recibe array [{store_id, limit_qty}, ...]
     * o null para no tocar. Array vacío [] borra todos los límites
     * (vuelve a usar el preorder_limit global).
     *
     * Cuando `$restrictToStoreId` está presente (gerente), SOLO se toca esa
     * tienda: las asignaciones de otras sucursales se preservan intactas y se
     * ignora cualquier store_id ajeno en el payload. Así el gerente puede
     * gestionar el catálogo igual que un admin pero sin alterar (ni ver wipear)
     * el stock de tiendas que no son la suya.
     */
    private function syncStoreLimits(PreSaleCatalog $catalog, ?array $limits, ?int $restrictToStoreId = null): void
    {
        if ($limits === null) return;

        if ($restrictToStoreId !== null) {
            $mine = collect($limits)->first(fn ($l) => (int) $l['store_id'] === $restrictToStoreId);
            $catalog->storeLimits()->where('store_id', $restrictToStoreId)->delete();
            if ($mine !== null) {
                $catalog->storeLimits()->create([
                    'store_id'  => $restrictToStoreId,
                    'limit_qty' => (int) $mine['limit_qty'],
                ]);
            }
            return;
        }

        // Admin: replace-all de todas las tiendas.
        $catalog->storeLimits()->delete();
        foreach ($limits as $l) {
            $catalog->storeLimits()->create([
                'store_id'  => (int) $l['store_id'],
                'limit_qty' => (int) $l['limit_qty'],
            ]);
        }
    }

    /**
     * Tienda a la que se restringe la asignación de stock por sucursal.
     * null para admin (puede tocar todas), store_id propio para gerente.
     */
    private function storeLimitScope(Request $request): ?int
    {
        $user = $request->user();
        if ($user->hasRole('admin')) return null;
        if ($user->hasRole('gerente')) return $user->store_id ? (int) $user->store_id : -1;
        return null;
    }

    /**
     * GET /pre-sale-catalogs/{id}
     */
    public function show(int $id): JsonResponse
    {
        $catalog = PreSaleCatalog::with(['category', 'supplier', 'product', 'createdBy', 'orderItems', 'activeOrderItems', 'storeLimits'])
            ->findOrFail($id);

        return $this->success(new PreSaleCatalogResource($catalog));
    }

    /**
     * PATCH /pre-sale-catalogs/{id}
     *
     * Admin o gerente edita campos del catálogo.
     * No cambia el status (usar /status para eso).
     */
    public function update(UpdatePreSaleCatalogRequest $request, int $id): JsonResponse
    {
        if (!$request->user()->hasRole('admin') && !$request->user()->hasRole('gerente')) {
            return $this->error('Sin permisos para gestionar catálogos.', 403);
        }

        $catalog = PreSaleCatalog::findOrFail($id);

        $data = $request->validated();
        // Once merchandise has arrived (or later), the preorder limit is frozen
        if (in_array($catalog->status, [PreSaleCatalog::STATUS_ARRIVED, PreSaleCatalog::STATUS_CLOSED, PreSaleCatalog::STATUS_CANCELLED])) {
            unset($data['preorder_limit'], $data['store_limits']);
        }
        $storeLimits = $data['store_limits'] ?? null;
        unset($data['store_limits']);
        $catalog->update($data);
        $this->syncStoreLimits($catalog, $storeLimits, $this->storeLimitScope($request));

        return $this->success(
            new PreSaleCatalogResource($catalog->load(['category', 'supplier', 'product', 'createdBy', 'orderItems', 'activeOrderItems', 'soldOrderItems', 'deliveredOrderItems.order:id,store_id', 'storeLimits']))
        );
    }

    /**
     * POST /pre-sale-catalogs/{id}/image
     *
     * Sube una imagen para el catálogo de preventa. Reusa el patrón de productos:
     * mismo disco default (gcs en prod, public en local), borra la imagen previa
     * si existía, y devuelve el image_url listo para usar.
     * Body: multipart/form-data con campo "image" (max 5MB, tipos image/*).
     */
    public function uploadImage(\Illuminate\Http\Request $request, int $id): JsonResponse
    {
        if (!$request->user()->hasRole('admin') && !$request->user()->hasRole('gerente')) {
            return $this->error('Sin permisos para gestionar catálogos.', 403);
        }

        $request->validate([
            'image' => ['required', 'file', 'image', 'max:5120'],
        ]);

        $catalog = PreSaleCatalog::findOrFail($id);

        // Borrar imagen previa (si existía) para no dejar huérfanos en el bucket.
        if ($catalog->image_path) {
            try { \Storage::delete($catalog->image_path); } catch (\Throwable) { /* ignore */ }
        }

        try {
            $path = $request->file('image')->store("pre-sale-catalogs/{$catalog->id}");
        } catch (\Throwable $e) {
            \Log::error('Pre-sale catalog image upload failed', [
                'disk'  => config('filesystems.default'),
                'error' => $e->getMessage(),
            ]);
            return $this->error('Error al subir imagen: ' . $e->getMessage(), 500);
        }

        if ($path === false) {
            return $this->error('No se pudo guardar la imagen en el almacenamiento.', 500);
        }

        $catalog->update(['image_path' => $path]);

        return $this->success([
            'id'         => $catalog->id,
            'image_path' => $path,
            'image_url'  => \Storage::url($path),
        ], 'Imagen subida.');
    }

    /**
     * DELETE /pre-sale-catalogs/{id}/image
     * Quita la imagen del catálogo (file + DB).
     */
    public function removeImage(\Illuminate\Http\Request $request, int $id): JsonResponse
    {
        if (!$request->user()->hasRole('admin') && !$request->user()->hasRole('gerente')) {
            return $this->error('Sin permisos para gestionar catálogos.', 403);
        }

        $catalog = PreSaleCatalog::findOrFail($id);
        if ($catalog->image_path) {
            try { \Storage::delete($catalog->image_path); } catch (\Throwable) { /* ignore */ }
            $catalog->update(['image_path' => null]);
        }
        return $this->success(null, 'Imagen eliminada.');
    }

    /**
     * PATCH /pre-sale-catalogs/{id}/status
     *
     * Transiciones válidas:
     *   draft     → published | cancelled
     *   published → arrived | closed | cancelled
     *   arrived   → closed | cancelled
     *   closed    → cancelled
     *
     * arrived: marca el producto como llegado y pone todos los pedidos
     *          pending de este catálogo en ready.
     */
    public function updateStatus(UpdatePreSaleCatalogStatusRequest $request, int $id): JsonResponse
    {
        if (!$request->user()->hasRole('admin') && !$request->user()->hasRole('gerente')) {
            return $this->error('Sin permisos para gestionar catálogos.', 403);
        }

        $catalog = PreSaleCatalog::findOrFail($id);
        $to      = $request->validated()['status'];

        $allowed = [
            PreSaleCatalog::STATUS_DRAFT      => [PreSaleCatalog::STATUS_PUBLISHED, PreSaleCatalog::STATUS_CANCELLED],
            PreSaleCatalog::STATUS_PUBLISHED   => [PreSaleCatalog::STATUS_ARRIVED, PreSaleCatalog::STATUS_CLOSED, PreSaleCatalog::STATUS_CANCELLED],
            PreSaleCatalog::STATUS_ARRIVED     => [PreSaleCatalog::STATUS_COMPLETED, PreSaleCatalog::STATUS_CANCELLED],
            PreSaleCatalog::STATUS_CLOSED      => [PreSaleCatalog::STATUS_CANCELLED],
            PreSaleCatalog::STATUS_CANCELLED   => [],
            PreSaleCatalog::STATUS_COMPLETED   => [],
        ];

        if (!in_array($to, $allowed[$catalog->status] ?? [])) {
            return $this->error(
                "Transición no permitida: {$catalog->status} → {$to}.",
                422
            );
        }

        $catalog->update(['status' => $to]);

        $orderIds = \DB::table('pre_sale_order_items')
            ->where('pre_sale_catalog_id', $catalog->id)
            ->pluck('pre_sale_order_id')
            ->unique();

        if ($to === PreSaleCatalog::STATUS_ARRIVED) {
            PreSaleOrder::whereIn('id', $orderIds)
                ->where('status', PreSaleOrder::STATUS_PENDING)
                ->update(['status' => PreSaleOrder::STATUS_READY]);
        }

        if ($to === PreSaleCatalog::STATUS_CANCELLED) {
            PreSaleOrder::whereIn('id', $orderIds)
                ->whereIn('status', [PreSaleOrder::STATUS_PENDING, PreSaleOrder::STATUS_READY])
                ->update(['status' => PreSaleOrder::STATUS_CANCELLED]);
        }

        return $this->success(
            new PreSaleCatalogResource($catalog->load(['category', 'supplier', 'product', 'orderItems', 'activeOrderItems', 'soldOrderItems', 'deliveredOrderItems.order:id,store_id']))
        );
    }
}
