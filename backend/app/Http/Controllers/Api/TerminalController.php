<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreTerminalRequest;
use App\Http\Requests\UpdateTerminalRequest;
use App\Http\Resources\TerminalResource;
use App\Models\Terminal;
use App\Support\ModelAudit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TerminalController extends Controller
{
    /**
     * GET /terminals
     * Filters: store_id, active
     */
    public function index(Request $request): JsonResponse
    {
        $terminals = Terminal::with('store')
            ->when($request->filled('store_id'), fn ($q) => $q->where('store_id', $request->store_id))
            ->when($request->filled('active'),   fn ($q) => $q->where('active', filter_var($request->active, FILTER_VALIDATE_BOOLEAN)))
            ->orderBy('store_id')
            ->orderBy('name')
            ->get();

        return $this->success(TerminalResource::collection($terminals));
    }

    /**
     * POST /terminals
     */
    public function store(StoreTerminalRequest $request): JsonResponse
    {
        if ($resp = $this->adminOnlyError()) {
            return $resp;
        }

        $terminal = Terminal::create($request->validated());
        ModelAudit::created($terminal, 'terminal.created', "Terminal «{$terminal->name}» creada", 'terminal', array_keys($request->validated()), $request->user()->id);
        $terminal->refresh()->load('store');

        return $this->success(new TerminalResource($terminal), 'Terminal creada.', 201);
    }

    /**
     * PUT /terminals/{terminal}
     */
    public function update(UpdateTerminalRequest $request, Terminal $terminal): JsonResponse
    {
        if ($resp = $this->adminOnlyError()) {
            return $resp;
        }

        $fields = array_keys($request->validated());
        $before = ModelAudit::snapshot($terminal, $fields);
        $terminal->update($request->validated());
        ModelAudit::updated($terminal, $before, 'terminal.updated', "Terminal «{$terminal->name}» editada", 'terminal', $fields, $request->user()->id);
        $terminal->load('store');

        return $this->success(new TerminalResource($terminal), 'Terminal actualizada.');
    }

    /**
     * DELETE /terminals/{terminal}
     */
    public function destroy(Terminal $terminal): JsonResponse
    {
        if ($resp = $this->adminOnlyError()) {
            return $resp;
        }

        ModelAudit::deleted($terminal, 'terminal.deleted', "Terminal «{$terminal->name}» eliminada", 'terminal', ['name', 'store_id', 'commission_percent', 'active'], request()->user()?->id);
        $terminal->delete();

        return $this->success(null, 'Terminal eliminada.');
    }
}
