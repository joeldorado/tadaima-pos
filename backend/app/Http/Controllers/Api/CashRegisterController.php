<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\CashSessionConflictException;
use App\Http\Controllers\Controller;
use App\Http\Requests\CloseCashSessionRequest;
use App\Http\Requests\OpenCashSessionRequest;
use App\Http\Requests\StoreCashMovementRequest;
use App\Http\Resources\CashMovementResource;
use App\Http\Resources\CashRegisterSessionResource;
use App\Models\CashMovement;
use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\SystemLog;
use App\Services\CashRegisterService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CashRegisterController extends Controller
{
    public function __construct(private readonly CashRegisterService $service) {}

    /**
     * GET /cash/registers?store_id=
     * Lista las cajas registradoras, opcionalmente filtradas por tienda.
     * Cada caja trae embebido `active_session` (null si está libre) para que
     * el selector de cajas marque "Ocupada" / "Reanudar" sin queries extra.
     */
    public function registers(Request $request): JsonResponse
    {
        $registersQuery = CashRegister::query()->where('active', true);

        if ($request->filled('store_id')) {
            $registersQuery->where('store_id', $request->integer('store_id'));
        }

        $registers = $registersQuery->get(['id', 'store_id', 'name', 'active']);

        // Sesiones activas indexadas por register_id (una query para todas
        // las cajas devueltas). Si el caller no es admin, el frontend igual
        // filtra por su tienda — el RBAC de "ver sesiones de otros" lo
        // maneja `activeSessions`, este endpoint es solo selector de cajas.
        $activeSessions = CashRegisterSession::query()
            ->with(['user:id,name'])
            ->whereIn('register_id', $registers->pluck('id'))
            ->where('status', CashRegisterSession::STATUS_OPEN)
            ->withCount(['sales' => fn ($q) => $q->where('status', 'completed')])
            ->get()
            ->keyBy('register_id');

        return $this->success(
            $registers->map(function ($r) use ($activeSessions) {
                $session = $activeSessions->get($r->id);
                return [
                    'id'        => $r->id,
                    'store_id'  => $r->store_id,
                    'name'      => $r->name,
                    'active'    => $r->active,
                    'active_session' => $session ? [
                        'id'           => $session->id,
                        'user_id'      => $session->user_id,
                        'user_name'    => $session->user?->name,
                        'opened_at'    => $session->opened_at?->toISOString(),
                        'opening_cash' => (float) $session->opening_cash,
                        'sales_count'  => (int) ($session->sales_count ?? 0),
                    ] : null,
                ];
            })
        );
    }

    /**
     * GET /cash/active-sessions?store_id=
     * Lista las sesiones abiertas de una tienda con el cajero/admin que la abrió.
     * Solo para admin — usado en la pantalla "Caja cerrada" para ver quién está
     * con sesión abierta en la tienda activa.
     */
    public function activeSessions(Request $request): JsonResponse
    {
        $user = $request->user();
        $isAdminUser = $user && $user->hasRole(['admin', 'super_admin', 'owner', 'dueño']);

        $query = CashRegisterSession::query()
            ->with(['register:id,store_id,name', 'user:id,name,avatar_url'])
            ->where('status', CashRegisterSession::STATUS_OPEN);

        // No-admin solo ve sesiones de su propia tienda.
        if (! $isAdminUser) {
            $storeId = $user?->store_id;
            if (! $storeId) {
                return $this->success([]);
            }
            $query->whereHas('register', fn ($q) => $q->where('store_id', $storeId));
        } elseif ($request->filled('store_id')) {
            $query->whereHas('register', fn ($q) => $q->where('store_id', $request->integer('store_id')));
        }

        $sessions = $query->orderBy('opened_at', 'desc')->get();

        return $this->success(
            $sessions->map(fn ($s) => [
                'id'           => $s->id,
                'register_id'  => $s->register_id,
                'register_name'=> $s->register?->name,
                'store_id'     => $s->register?->store_id,
                'user_id'      => $s->user_id,
                'user_name'    => $s->user?->name,
                // avatar resuelto (path GCS → URL absoluta, URL externa pasa
                // tal cual) para que UserAvatar muestre la foto del cajero
                // que abrió caja, no solo las iniciales
                'user_avatar_url' => $s->user?->avatar_url
                    ? (str_starts_with($s->user->avatar_url, 'http')
                        ? $s->user->avatar_url
                        : \Storage::url($s->user->avatar_url))
                    : null,
                'opened_at'    => $s->opened_at,
                'opening_cash' => (float) $s->opening_cash,
            ])->values()
        );
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
        } catch (CashSessionConflictException $e) {
            // 409 Conflict con shape estructurado para que el frontend
            // distinga entre "reanudar mi propia sesión" vs "conflicto con
            // otro usuario". `same_register` permite al frontend decidir si
            // mostrar modal Resume (own + misma caja) vs Conflict.
            $existing = $e->existingSession;
            $requestedRegisterId = $request->integer('register_id');
            return response()->json([
                'success'  => false,
                'conflict' => $e->kind, // 'own' | 'foreign'
                'error'    => $e->getMessage(),
                'existing_session' => [
                    'id'              => $existing->id,
                    'opening_cash'    => (float) $existing->opening_cash,
                    'opened_at'       => $existing->opened_at?->toISOString(),
                    'user'            => $existing->user ? ['id' => $existing->user->id, 'name' => $existing->user->name] : null,
                    'register'        => $existing->register ? ['id' => $existing->register->id, 'name' => $existing->register->name] : null,
                    'store'           => $existing->register?->store ? ['id' => $existing->register->store->id, 'name' => $existing->register->store->name] : null,
                    'same_register'   => $existing->register_id === $requestedRegisterId,
                ],
            ], 409);
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success(new CashRegisterSessionResource($session), 'Caja abierta.', 201);
    }

    /**
     * POST /cash/sessions/{session}/force-close
     *
     * Cierra una sesión colgada por su dueño. Solo admin. Útil cuando un
     * cajero dejó la caja abierta en otra computadora y necesita reasignar.
     *
     * Body: { closing_cash? } — opcional, default = opening_cash (descuadre 0).
     */
    public function forceClose(Request $request, CashRegisterSession $session): JsonResponse
    {
        $user = $request->user();
        $isAdmin = $user && $user->hasRole(['admin', 'super_admin', 'owner', 'dueño']);

        if (! $isAdmin) {
            return $this->error('Solo admin puede forzar el cierre de sesiones ajenas.', 403);
        }

        if ($session->status !== CashRegisterSession::STATUS_OPEN) {
            return $this->error('La sesión ya está cerrada.', 422);
        }

        // Si no se manda closing_cash, asume igual al opening (descuadre 0).
        $closingCash = $request->has('closing_cash')
            ? (float) $request->input('closing_cash')
            : (float) $session->opening_cash;

        try {
            $closed = $this->service->close($session, $closingCash);
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        SystemLog::write(
            action: 'cash_session.force_closed',
            description: "Cierre forzado de sesión #{$closed->id} (caja: {$closed->register?->name}, dueño: {$closed->user?->name})",
            entityType: 'cash_session',
            entityId: $closed->id,
            meta: [
                'session_id'   => $closed->id,
                'owner_id'     => $closed->user_id,
                'owner_name'   => $closed->user?->name,
                'register_id'  => $closed->register_id,
                'closed_by'    => $user->id,
                'closing_cash' => $closingCash,
            ],
        );

        return $this->success(new CashRegisterSessionResource($closed), 'Sesión cerrada forzosamente.');
    }

    /**
     * POST /cash/close
     * Body: { closing_cash }
     * Cierra la sesión activa del usuario autenticado.
     */
    public function close(CloseCashSessionRequest $request): JsonResponse
    {
        // Espejo de CashRegisterService::activeSession — cualquiera de la tienda
        // puede cerrar la caja del turno (no solo quien la abrió). Esto cubre
        // el caso real: admin abre en la mañana, cajero cierra al final del día.
        $session = $this->service->activeSession($request->user()->id);

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
        // Misma lógica que close: cualquiera del turno puede registrar movimientos
        // en la sesión activa de su tienda.
        $session = $this->service->activeSession($request->user()->id);

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
