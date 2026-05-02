<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SystemLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SystemLogController extends Controller
{
    /**
     * GET /logs
     * Filters: user_id, action, from (date), to (date), search (description)
     * Paginated — defaults to 50 per page.
     */
    public function index(Request $request): JsonResponse
    {
        $query = SystemLog::with('user')
            ->when($request->filled('user_id'), fn ($q) => $q->where('user_id', $request->integer('user_id')))
            ->when($request->filled('action'),  fn ($q) => $q->where('action', $request->action))
            ->when($request->filled('from'),    fn ($q) => $q->whereDate('created_at', '>=', $request->from))
            ->when($request->filled('to'),      fn ($q) => $q->whereDate('created_at', '<=', $request->to))
            ->when($request->filled('search'),  fn ($q) => $q->where(function ($q2) use ($request) {
                $q2->where('description', 'like', "%{$request->search}%")
                   ->orWhere('action', 'like', "%{$request->search}%");
            }))
            ->latest('created_at');

        $perPage = min((int) ($request->per_page ?? 50), 200);
        $results = $query->paginate($perPage);

        return $this->success([
            'data'       => collect($results->items())->map(fn ($log) => $this->format($log)),
            'pagination' => [
                'total'        => $results->total(),
                'per_page'     => $results->perPage(),
                'current_page' => $results->currentPage(),
                'last_page'    => $results->lastPage(),
            ],
        ]);
    }

    /**
     * POST /logs
     * Creates a log entry. Useful for frontend-initiated events.
     *
     * Body: { "action": "...", "description": "..." }
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'action'      => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:2000'],
        ]);

        $log = SystemLog::create([
            'user_id'     => $request->user()->id,
            'action'      => $data['action'],
            'description' => $data['description'] ?? null,
        ]);

        $log->load('user');

        return $this->success($this->format($log), 'Log registrado.', 201);
    }

    private function format(SystemLog $log): array
    {
        return [
            'id'          => $log->id,
            'action'      => $log->action,
            'description' => $log->description,
            'user'        => $log->user ? ['id' => $log->user->id, 'name' => $log->user->name] : null,
            'created_at'  => $log->created_at?->toISOString(),
        ];
    }
}
