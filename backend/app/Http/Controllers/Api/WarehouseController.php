<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreWarehouseRequest;
use App\Http\Requests\UpdateWarehouseRequest;
use App\Http\Resources\WarehouseResource;
use App\Models\Warehouse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WarehouseController extends Controller
{
    /**
     * GET /warehouses
     * Filters: company_id, store_id, type, active
     */
    public function index(Request $request): JsonResponse
    {
        $warehouses = Warehouse::with('store')
            ->when($request->filled('company_id'), fn ($q) => $q->where('company_id', $request->company_id))
            ->when($request->filled('store_id'),   fn ($q) => $q->where('store_id',   $request->store_id))
            ->when($request->filled('type'),       fn ($q) => $q->where('type',       $request->type))
            ->when($request->filled('active'),     fn ($q) => $q->where('active', filter_var($request->active, FILTER_VALIDATE_BOOLEAN)))
            ->orderBy('name')
            ->get();

        return $this->success(WarehouseResource::collection($warehouses));
    }

    /**
     * POST /warehouses
     * Si no se envía company_id, se deriva del usuario autenticado.
     */
    public function store(StoreWarehouseRequest $request): JsonResponse
    {
        if ($resp = $this->adminOnlyError()) {
            return $resp;
        }

        $data = $request->validated();
        $data['company_id'] ??= $request->user()?->company_id;

        if (empty($data['company_id'])) {
            return $this->error('No se pudo determinar la empresa para crear la bodega.', 422);
        }

        $warehouse = Warehouse::create($data);
        $warehouse->refresh()->load('store');

        return $this->success(new WarehouseResource($warehouse), 'Bodega creada.', 201);
    }

    /**
     * PUT /warehouses/{warehouse}
     */
    public function update(UpdateWarehouseRequest $request, Warehouse $warehouse): JsonResponse
    {
        if ($resp = $this->adminOnlyError()) {
            return $resp;
        }

        $warehouse->update($request->validated());
        $warehouse->load('store');

        return $this->success(new WarehouseResource($warehouse), 'Bodega actualizada.');
    }

    /**
     * DELETE /warehouses/{warehouse}
     * Blocks deletion if the warehouse has inventory with quantity > 0.
     */
    public function destroy(Warehouse $warehouse): JsonResponse
    {
        if ($resp = $this->adminOnlyError()) {
            return $resp;
        }

        $hasStock = $warehouse->inventory()->where('quantity', '>', 0)->exists();

        if ($hasStock) {
            return $this->error('No se puede eliminar la bodega porque tiene inventario activo.', 422);
        }

        $warehouse->delete();

        return $this->success(null, 'Bodega eliminada.');
    }
}
