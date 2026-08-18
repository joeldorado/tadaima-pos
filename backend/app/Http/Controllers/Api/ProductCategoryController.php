<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreProductCategoryRequest;
use App\Http\Requests\UpdateProductCategoryRequest;
use App\Http\Resources\ProductCategoryResource;
use App\Models\ProductCategory;
use App\Models\SystemLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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
    /**
     * GET /categories/{category}/products
     *
     * Productos vinculados a la categoría (para el modal de confirmación al
     * borrar): id, name, sku, active y other_categories_count (0 = quedará
     * "Sin categoría" si se borra esta). Tope 300 filas + total real.
     */
    public function products(ProductCategory $category): JsonResponse
    {
        $total = $category->products()->count();
        $rows = $category->products()
            ->withCount(['categories as other_categories_count' => fn ($q) => $q->where('product_categories.id', '!=', $category->id)])
            ->orderBy('products.name')
            ->limit(300)
            ->get(['products.id', 'products.name', 'products.sku', 'products.active', 'products.product_type']);

        return $this->success([
            'category' => ['id' => $category->id, 'name' => $category->name],
            'total' => $total,
            'products' => $rows->map(fn ($p) => [
                'id' => $p->id,
                'name' => $p->name,
                'sku' => $p->sku,
                'active' => (bool) $p->active,
                'product_type' => $p->product_type,
                'other_categories_count' => (int) $p->other_categories_count,
            ])->values(),
        ]);
    }

    /**
     * DELETE /categories/{category}
     *
     * Desde 2026-08-17 (Joel): se puede borrar aunque tenga productos — se
     * DESVINCULAN (pivote) y los que se quedan sin ninguna pasan a "Sin
     * categoría" (category_id NULL). La caché category_id de los demás pasa a
     * la primera categoría que les quede. Devuelve conteos para el toast.
     */
    public function destroy(ProductCategory $category): JsonResponse
    {
        if ($resp = $this->adminOrManagerGateError()) {
            return $resp;
        }

        $result = DB::transaction(function () use ($category) {
            $productIds = $category->products()->pluck('products.id')->all();
            $unlinked = count($productIds);

            // Quitar el vínculo (el FK del pivote es CASCADE, pero lo hacemos
            // explícito para poder recalcular la caché antes de borrar).
            DB::table('product_category_assignments')->where('category_id', $category->id)->delete();

            $leftWithout = 0;
            foreach (array_chunk($productIds, 500) as $lote) {
                // Primera categoría restante por position/nombre, por producto.
                $restantes = DB::table('product_category_assignments as a')
                    ->join('product_categories as c', 'c.id', '=', 'a.category_id')
                    ->whereIn('a.product_id', $lote)
                    ->orderBy('a.product_id')->orderBy('a.position')->orderBy('c.name')
                    ->get(['a.product_id', 'a.category_id'])
                    ->groupBy('product_id')
                    ->map(fn ($rows) => (int) $rows->first()->category_id);

                foreach ($lote as $pid) {
                    $nueva = $restantes[$pid] ?? null;
                    if ($nueva === null) {
                        $leftWithout++;
                    }
                    DB::table('products')->where('id', $pid)->update(['category_id' => $nueva]);
                }
            }

            $name = $category->name;
            $category->delete();

            SystemLog::write(
                action: 'category.deleted',
                description: sprintf('Categoría eliminada: %s (%d productos desvinculados, %d quedaron sin categoría)', $name, $unlinked, $leftWithout),
                entityType: 'product_category',
                entityId: $category->id,
                meta: ['name' => $name, 'unlinked' => $unlinked, 'left_without_category' => $leftWithout],
            );

            return ['unlinked' => $unlinked, 'left_without_category' => $leftWithout];
        });

        return $this->success($result, sprintf(
            'Categoría eliminada. %d producto%s desvinculado%s%s.',
            $result['unlinked'], $result['unlinked'] === 1 ? '' : 's', $result['unlinked'] === 1 ? '' : 's',
            $result['left_without_category'] > 0 ? sprintf(' (%d sin categoría)', $result['left_without_category']) : ''
        ));
    }
}
