<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreIncomeMovementRequest;
use App\Models\IncomeMovement;
use App\Services\IncomeService;
use App\Support\DateRange;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Ingresos (Fase 3): entrada de dinero (equipo, comisión, devolución proveedor, etc.).
 *
 * RBAC: cualquier usuario con caja abierta registra ingresos; el listado scopea al cajero
 * a los suyos (igual que cash/movements). Las deletion son solo admin.
 */
class IncomeMovementsController extends Controller
{
    public function __construct(private readonly IncomeService $service)
    {
    }

    /** GET /income-movements — historial (cajero: solo los suyos). */
    public function index(Request $request): JsonResponse
    {
        $user    = $request->user();
        $isAdmin = $user->isAdminRole();
        $isCashier = $user->hasRole(['cajero']) && ! $isAdmin;
        $cashierWholeStore = $isCashier && $request->boolean('whole_store');

        // Rango de fechas opcional (día-negocio)
        $from = $request->input('from') ? (string) $request->input('from') : null;
        $to   = $request->input('to')   ? (string) $request->input('to')   : null;
        $dates = DateRange::parseDatesParam($request->input('dates'));

        $movements = IncomeMovement::with(['session:id,user_id', 'user:id,name'])
            ->whereHas('session', fn ($q) => $q->where('store_id', $user->store_id ?? -1))
            ->when($request->input('type'), fn ($q, $t) => $q->where('type', $t))
            ->tap(fn ($q) => DateRange::applyDates($q, 'income_movements.created_at', $dates, $from, $to))
            ->when(
                $request->filled('store_id') && ! $cashierWholeStore,
                fn ($q) => $q->where('store_id', $request->integer('store_id'))
            )
            ->when($request->integer('user_id'), fn ($q, $id) => $q->where('user_id', $id))
            ->when($isCashier && ! $cashierWholeStore, fn ($q) => $q->where('user_id', $user->id))
            ->when(
                $cashierWholeStore,
                fn ($q) => $q->where('store_id', $user->store_id ?? -1)
            )
            ->orderByDesc('created_at')
            ->limit(200)
            ->get();

        return $this->success($movements);
    }

    /** POST /income-movements — registrar ingreso. */
    public function store(StoreIncomeMovementRequest $request): JsonResponse
    {
        $user   = $request->user();
        $isAdmin = $user->hasRole(['admin', 'super_admin', 'owner', 'dueño']);

        // Store scoping: admin elige; cashier/manager forzado al suyo
        if (! $isAdmin && ! $user->store_id) {
            return $this->error('Tu usuario no tiene una tienda asignada — pídele al administrador que te la asigne antes de registrar ingresos.', 422);
        }
        $storeId = $isAdmin
            ? ($request->filled('store_id') ? (int) $request->input('store_id') : null)
            : (int) $user->store_id;

        try {
            $movement = $this->service->registerIncome(
                type:        (string) $request->input('type'),
                amount:      (float) $request->input('amount'),
                description: $request->input('description') ? trim((string) $request->input('description')) : null,
                userId:      $user->id,
                storeId:     $storeId,
            );
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success($movement->load('user'), 'Ingreso registrado.', 201);
    }

    /** DELETE /income-movements/{movement} — solo admin. */
    public function destroy(IncomeMovement $movement): JsonResponse
    {
        if ($resp = $this->adminOnlyError()) {
            return $resp;
        }

        $this->service->deleteMovement($movement, request()->user());

        return $this->success(null, 'Ingreso borrado.');
    }
}
