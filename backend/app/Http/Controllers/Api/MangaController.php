<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMangaRequest;
use App\Http\Requests\UpdateMangaRequest;
use App\Http\Resources\MangaResource;
use App\Models\Manga;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class MangaController extends Controller
{
    /**
     * GET /mangas
     * Filters: active, genre, editorial, search (name/code)
     */
    public function index(Request $request): JsonResponse
    {
        $storeId = $request->filled('store_id') ? (int) $request->store_id : null;

        $query = Manga::query()
            ->when($request->filled('active'),    fn ($q) => $q->where('active', filter_var($request->active, FILTER_VALIDATE_BOOLEAN)))
            ->when($request->filled('genre'),     fn ($q) => $q->where('genre', $request->genre))
            ->when($request->filled('editorial'), fn ($q) => $q->where('editorial', $request->editorial))
            ->when($request->filled('search'),    fn ($q) => $q->where(function ($q2) use ($request) {
                $q2->where('name', 'like', "%{$request->search}%")
                   ->orWhere('code', 'like', "%{$request->search}%");
            }))
            ->orderBy('name')
            ->orderBy('volume_number');

        if ($storeId) {
            $query
                ->whereHas('inventory', fn ($q) =>
                    $q->whereHas('warehouse', fn ($wq) =>
                        $wq->where('store_id', $storeId)
                    )
                )
                ->withSum(['inventory' => fn ($q) =>
                    $q->whereHas('warehouse', fn ($wq) =>
                        $wq->where('store_id', $storeId)
                    )
                ], 'quantity');
        }

        $perPage = min((int) ($request->per_page ?? 50), 200);
        $results = $query->paginate($perPage);

        return $this->success([
            'data'       => MangaResource::collection($results->items()),
            'pagination' => [
                'total'        => $results->total(),
                'per_page'     => $results->perPage(),
                'current_page' => $results->currentPage(),
                'last_page'    => $results->lastPage(),
            ],
        ]);
    }

    /**
     * POST /mangas
     * cost is auto-calculated from public_price and profit_margin_percent.
     */
    public function store(StoreMangaRequest $request): JsonResponse
    {
        $manga = Manga::create($request->validated());
        $manga->refresh();

        return $this->success(new MangaResource($manga), 'Manga creado.', 201);
    }

    /**
     * PUT /mangas/{manga}
     * cost is recalculated automatically on save.
     */
    public function update(UpdateMangaRequest $request, Manga $manga): JsonResponse
    {
        $manga->update($request->validated());

        return $this->success(new MangaResource($manga), 'Manga actualizado.');
    }

    /**
     * POST /mangas/{manga}/image/upload
     */
    public function uploadImage(Request $request, Manga $manga): JsonResponse
    {
        $request->validate([
            'image' => ['required', 'file', 'image', 'max:5120'],
        ]);

        if ($manga->image_path) {
            Storage::delete($manga->image_path);
        }

        $path = $request->file('image')->store("mangas/{$manga->id}");
        $manga->update(['image_path' => $path]);

        return $this->success([
            'image_url' => Storage::url($path),
        ], 'Imagen subida.', 201);
    }

    /**
     * DELETE /mangas/{manga}
     */
    public function destroy(Manga $manga): JsonResponse
    {
        if ($manga->image_path) {
            Storage::delete($manga->image_path);
        }
        $manga->delete();

        return $this->success(null, 'Manga eliminado.');
    }
}
