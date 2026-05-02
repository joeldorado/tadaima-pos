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
        $query = PreSaleCatalog::with(['category', 'supplier', 'product', 'orderItems', 'activeOrderItems', 'soldOrderItems', 'deliveredOrderItems'])
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

        return $this->success(
            new PreSaleCatalogResource($catalog->load(['category', 'supplier', 'product', 'createdBy'])),
            201
        );
    }

    /**
     * GET /pre-sale-catalogs/{id}
     */
    public function show(int $id): JsonResponse
    {
        $catalog = PreSaleCatalog::with(['category', 'supplier', 'product', 'createdBy', 'orderItems', 'activeOrderItems'])
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
            unset($data['preorder_limit']);
        }
        $catalog->update($data);

        return $this->success(
            new PreSaleCatalogResource($catalog->load(['category', 'supplier', 'product', 'createdBy', 'orderItems', 'activeOrderItems', 'soldOrderItems', 'deliveredOrderItems']))
        );
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
            new PreSaleCatalogResource($catalog->load(['category', 'supplier', 'product', 'orderItems', 'activeOrderItems', 'soldOrderItems', 'deliveredOrderItems']))
        );
    }
}
