<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\MangaInventoryResource;
use App\Models\MangaInventory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MangaInventoryController extends Controller
{
    /**
     * GET /manga-inventory
     *
     * Query params opcionales:
     *   ?manga_id=X
     */
    public function index(Request $request): JsonResponse
    {
        $items = MangaInventory::with('warehouse')
            ->when($request->filled('manga_id'), fn ($q) => $q->where('manga_id', $request->manga_id))
            ->get();

        return $this->success(MangaInventoryResource::collection($items));
    }

    /**
     * PUT /manga-inventory/{mangaId}/{warehouseId}
     *
     * Establece el stock absoluto de un manga en una bodega.
     *
     * Body: { quantity: int }
     */
    public function update(Request $request, int $mangaId, int $warehouseId): JsonResponse
    {
        $request->validate(['quantity' => ['required', 'integer', 'min:0']]);

        $item = MangaInventory::updateOrCreate(
            ['manga_id' => $mangaId, 'warehouse_id' => $warehouseId],
            ['quantity' => (int) $request->quantity]
        );

        $item->load('warehouse');

        return $this->success(new MangaInventoryResource($item));
    }
}
