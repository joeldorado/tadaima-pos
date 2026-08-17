<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreProductCategoryRequest;
use App\Http\Requests\UpdateProductCategoryRequest;
use App\Http\Resources\ProductCategoryResource;
use App\Models\ProductCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductCategoryController extends Controller
{
    /**
     * GET /categories
     * Filters: active
     */
    public function index(Request $request): JsonResponse
    {
        $categories = ProductCategory::withCount('products')
            ->when($request->filled('active'), fn ($q) => $q->where('active', filter_var($request->active, FILTER_VALIDATE_BOOLEAN)))
            ->orderBy('name')
            ->get();

        return $this->success(ProductCategoryResource::collection($categories));
    }

    /**
     * POST /categories
     */
    public function store(StoreProductCategoryRequest $request): JsonResponse
    {
        // CREAR queda abierto: el cajero da de alta productos y puede crear una
        // categoría nueva al vuelo. Editar/borrar sí es admin/gerente (abajo).
        $category = ProductCategory::create($request->validated());
        $category->refresh();

        return $this->success(new ProductCategoryResource($category), 'Categoría creada.', 201);
    }

    /**
     * PUT /categories/{category}
     */
    public function update(UpdateProductCategoryRequest $request, ProductCategory $category): JsonResponse
    {
        if ($resp = $this->adminOrManagerGateError()) {
            return $resp;
        }

        $category->update($request->validated());

        return $this->success(new ProductCategoryResource($category), 'Categoría actualizada.');
    }

    /**
     * DELETE /categories/{category}
     * Blocks deletion if the category has active products.
     */
    public function destroy(ProductCategory $category): JsonResponse
    {
        if ($resp = $this->adminOrManagerGateError()) {
            return $resp;
        }

        // FK products.category_id: se bloquea con mensaje útil (cuántos son)
        // en vez de un error genérico — el equipo intentó borrar categorías
        // con productos y solo veía "Error al eliminar categoría" (2026-08-17).
        $n = $category->products()->count();
        if ($n > 0) {
            return $this->error(sprintf(
                'No se puede eliminar «%s»: tiene %d producto%s asociado%s. Cámbialos de categoría o elimínalos primero.',
                $category->name, $n, $n === 1 ? '' : 's', $n === 1 ? '' : 's'
            ), 422);
        }

        $category->delete();

        return $this->success(null, 'Categoría eliminada.');
    }
}
