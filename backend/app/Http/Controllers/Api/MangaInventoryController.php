<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\MangaInventoryResource;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\Warehouse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Facade compat: el inventario de mangas se unificó en la tabla `inventory`
 * (compartida con productos regulares). Este controller mantiene la API
 * pública /manga-inventory mapeando contra Inventory + Product de tipo manga.
 *
 * Los IDs que llegan en la URL son los nuevos product_id (después de la
 * migración), porque GET /mangas ahora retorna productos con type='manga'.
 *
 * Cuando el frontend migre a /inventory directo, este controller se elimina.
 */
class MangaInventoryController extends Controller
{
    /**
     * GET /manga-inventory?manga_id=X
     */
    public function index(Request $request): JsonResponse
    {
        $items = Inventory::query()
            ->with('warehouse')
            ->when(
                $request->filled('manga_id'),
                fn ($q) => $q->where('product_id', (int) $request->manga_id),
            )
            // Solo inventario de productos tipo manga.
            ->whereIn('product_id', function ($sub) {
                $sub->select('id')
                    ->from('products')
                    ->where('product_type', Product::TYPE_MANGA);
            })
            ->get();

        return $this->success(MangaInventoryResource::collection($items));
    }

    /**
     * PUT /manga-inventory/{mangaId}/{warehouseId}
     * mangaId aquí es el product_id del manga (post-migración).
     */
    public function update(Request $request, int $mangaId, int $warehouseId): JsonResponse
    {
        $request->validate(['quantity' => ['required', 'integer', 'min:0']]);

        // Guard cross-tienda: gerente/cajero solo ajustan bodegas de SU tienda.
        $warehouse = Warehouse::find($warehouseId);
        if (! $warehouse) {
            return $this->error('Bodega no encontrada.', 404);
        }
        if ($resp = $this->storeScopeError($request, $warehouse->store_id)) {
            return $resp;
        }

        // Verificar que el id sea efectivamente un manga (defensivo).
        $product = Product::query()
            ->where('id', $mangaId)
            ->where('product_type', Product::TYPE_MANGA)
            ->first();
        if (! $product) {
            return $this->error('El producto no es de tipo manga o no existe.', 404);
        }

        $item = Inventory::updateOrCreate(
            ['product_id' => $mangaId, 'warehouse_id' => $warehouseId],
            ['quantity' => (float) $request->quantity],
        );

        $item->load('warehouse');

        return $this->success(new MangaInventoryResource($item));
    }
}
