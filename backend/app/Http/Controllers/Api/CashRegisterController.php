<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\CloseCashSessionRequest;
use App\Http\Requests\OpenCashSessionRequest;
use App\Http\Requests\StoreCashMovementRequest;
use App\Http\Resources\CashMovementResource;
use App\Http\Resources\CashRegisterSessionResource;
use App\Models\CashMovement;
use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Services\CashRegisterService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CashRegisterController extends Controller
{
    public function __construct(private readonly CashRegisterService $service) {}

    /**
     * GET /cash/registers?store_id=
     * Lista las cajas registradoras, opcionalmente filtradas por tienda.
     */
    public function registers(Request $request): JsonResponse
    {
        $query = CashRegister::query()->where('active', true);

        if ($request->filled('store_id')) {
            $query->where('store_id', $request->integer('store_id'));
        }

        return $this->success($query->get(['id', 'store_id', 'name', 'active']));
    }

    /**
     * GET /cash/session
     * Retorna la sesión activa del usuario autenticado (o null si no hay ninguna).
     */
    public function session(Request $request): JsonResponse
    {
        $session = $this->service->activeSession($request->user()->id);

        if (! $session) {
            return $this->success(null, 'No hay sesión de caja activa.');
        }

        return $this->success(new CashRegisterSessionResource($session));
    }

    /**
     * POST /cash/open
     * Body: { register_id, opening_cash }
     */
    public function open(OpenCashSessionRequest $request): JsonResponse
    {
        try {
            $session = $this->service->open(
                $request->integer('register_id'),
                (float) $request->input('opening_cash', 0),
                $request->user()->id,
            );
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success(new CashRegisterSessionResource($session), 'Caja abierta.', 201);
    }

    /**
     * POST /cash/close
     * Body: { closing_cash }
     * Cierra la sesión activa del usuario autenticado.
     */
    public function close(CloseCashSessionRequest $request): JsonResponse
    {
        $session = CashRegisterSession::where('user_id', $request->user()->id)
            ->where('status', CashRegisterSession::STATUS_OPEN)
            ->first();

        if (! $session) {
            return $this->error('No tienes una sesión de caja abierta.', 422);
        }

        try {
            $session = $this->service->close($session, (float) $request->input('closing_cash', 0));
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success(new CashRegisterSessionResource($session), 'Caja cerrada.');
    }

    /**
     * POST /cash/movements
     * Body: { type, amount, description? }
     * Registra un movimiento en la sesión activa del usuario.
     */
    public function addMovement(StoreCashMovementRequest $request): JsonResponse
    {
        $session = CashRegisterSession::where('user_id', $request->user()->id)
            ->where('status', CashRegisterSession::STATUS_OPEN)
            ->first();

        if (! $session) {
            return $this->error('No tienes una sesión de caja abierta.', 422);
        }

        try {
            $movement = $this->service->addMovement(
                $session,
                $request->only(['type', 'amount', 'description']),
            );
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success(new CashMovementResource($movement), 'Movimiento registrado.', 201);
    }

    /**
     * GET /cash/movements
     * Query: ?session_id=, ?type=, ?from=, ?to=, ?per_page=
     * Si no se envía session_id, usa la sesión activa del usuario.
     */
    public function movements(Request $request): JsonResponse
    {
        // Determinar sesión a consultar
        if ($request->filled('session_id')) {
            $sessionId = $request->integer('session_id');
        } else {
            $active = CashRegisterSession::where('user_id', $request->user()->id)
                ->where('status', CashRegisterSession::STATUS_OPEN)
                ->first();

            if (! $active) {
                return $this->error('No hay sesión activa. Envía ?session_id= para consultar historial.', 422);
            }

            $sessionId = $active->id;
        }

        $session = CashRegisterSession::with('movements')->find($sessionId);

        if (! $session) {
            return $this->error('Sesión no encontrada.', 404);
        }

        $query = CashMovement::where('register_session_id', $sessionId)
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->type))
            ->when($request->filled('from'), fn ($q) => $q->whereDate('created_at', '>=', $request->from))
            ->when($request->filled('to'),   fn ($q) => $q->whereDate('created_at', '<=', $request->to))
            ->latest('created_at');

        $perPage   = min((int) ($request->per_page ?? 50), 200);
        $movements = $query->paginate($perPage);

        // Balance en tiempo real
        $session->load('movements');

        return $this->success([
            'session_id'   => $sessionId,
            'opening_cash' => $session->opening_cash,
            'balance'      => $session->balance,
            'data'         => CashMovementResource::collection($movements->items()),
            'pagination'   => [
                'total'        => $movements->total(),
                'per_page'     => $movements->perPage(),
                'current_page' => $movements->currentPage(),
                'last_page'    => $movements->lastPage(),
            ],
        ]);
    }
}
