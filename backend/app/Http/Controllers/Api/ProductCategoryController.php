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
        $category = ProductCategory::create($request->validated());
        $category->refresh();

        return $this->success(new ProductCategoryResource($category), 'Categoría creada.', 201);
    }

    /**
     * PUT /categories/{category}
     */
    public function update(UpdateProductCategoryRequest $request, ProductCategory $category): JsonResponse
    {
        $category->update($request->validated());

        return $this->success(new ProductCategoryResource($category), 'Categoría actualizada.');
    }

    /**
     * DELETE /categories/{category}
     * Blocks deletion if the category has active products.
     */
    public function destroy(ProductCategory $category): JsonResponse
    {
        if ($category->products()->exists()) {
            return $this->error('No se puede eliminar la categoría porque tiene productos asociados.', 422);
        }

        $category->delete();

        return $this->success(null, 'Categoría eliminada.');
    }
}
