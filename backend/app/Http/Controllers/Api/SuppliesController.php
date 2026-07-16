<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSupplyMovementRequest;
use App\Http\Requests\StoreSupplyRequest;
use App\Models\Supply;
use App\Models\SupplyMovement;
use App\Services\SupplyService;
use App\Support\DateRange;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Insumos (Fase 2): catálogo + compras con efectivo de la caja + reporte.
 *
 * RBAC: cualquier usuario con caja abierta registra compras (es quien saca el
 * efectivo del cajón); el catálogo lo administran admin/gerente; el listado de
 * movimientos scopea al cajero a los suyos (mismo criterio que cash/movements).
 */
class SuppliesController extends Controller
{
    public function __construct(private readonly SupplyService $service)
    {
    }

    /** GET /supplies — catálogo (activos por default; ?all=1 incluye inactivos). */
    public function index(Request $request): JsonResponse
    {
        // Scoping por empresa (fix 2026-07-16): el catálogo es compartido entre
        // las tiendas de UNA empresa, nunca entre empresas distintas.
        // Scoping por tienda (2026-07-16): un insumo con store_id solo lo ve esa
        // tienda; store_id NULL = toda la empresa. Admin ve todo (etiquetado).
        $user = $request->user();
        $isAdmin = $user->hasRole(['admin', 'super_admin', 'owner', 'dueño']);

        $supplies = Supply::query()
            ->where('company_id', $user->company_id)
            ->when(! $isAdmin, fn ($q) => $q->where(fn ($qq) =>
                $qq->whereNull('store_id')->orWhere('store_id', $user->store_id)
            ))
            ->when(! $request->boolean('all'), fn ($q) => $q->active())
            ->orderBy('category')
            ->orderBy('name')
            ->get();

        return $this->success($supplies);
    }

    /** POST /supplies — alta en el catálogo (admin/gerente). */
    public function store(StoreSupplyRequest $request): JsonResponse
    {
        if ($resp = $this->adminOrManagerGateError()) {
            return $resp;
        }

        // Tienda del insumo con RBAC: admin manda lo que quiera (null = toda la
        // empresa); gerente queda forzado a SU tienda.
        $user = $request->user();
        $isAdmin = $user->hasRole(['admin', 'super_admin', 'owner', 'dueño']);
        $storeId = $isAdmin
            ? ($request->filled('store_id') ? (int) $request->input('store_id') : null)
            : ($user->store_id ? (int) $user->store_id : null);

        $supply = Supply::create(array_merge(
            $request->only(['name', 'category', 'unit']),
            [
                'company_id' => $user->company_id,
                'store_id'   => $storeId,
                'is_active'  => $request->boolean('is_active', true),
            ],
        ));

        return $this->success($supply, 'Insumo creado.', 201);
    }

    /** PUT /supplies/{supply} — editar catálogo (admin/gerente). */
    public function update(StoreSupplyRequest $request, Supply $supply): JsonResponse
    {
        if ($resp = $this->adminOrManagerGateError()) {
            return $resp;
        }

        // Pertenencia por empresa (fix 2026-07-16): el route-model-binding trae
        // cualquier id — sin este check un gerente podía editar insumos ajenos.
        if ((int) $supply->company_id !== (int) $request->user()->company_id) {
            return $this->error('Este insumo no pertenece a tu empresa.', 403);
        }

        $supply->update(array_merge(
            $request->only(['name', 'category', 'unit']),
            $request->has('is_active') ? ['is_active' => $request->boolean('is_active')] : [],
        ));

        return $this->success($supply->fresh(), 'Insumo actualizado.');
    }

    /**
     * POST /supplies/movements — registrar movimiento. `purchase` (default)
     * saca efectivo de la caja abierta del usuario; consumo/ajuste no tocan caja.
     */
    public function storeMovement(StoreSupplyMovementRequest $request): JsonResponse
    {
        $supply = Supply::findOrFail((int) $request->input('supply_id'));

        // Pertenencia por empresa (fix 2026-07-16): sin esto cualquier usuario
        // autenticado podía registrar compras contra insumos de otra empresa.
        if ((int) $supply->company_id !== (int) $request->user()->company_id) {
            return $this->error('Este insumo no pertenece a tu empresa.', 403);
        }

        $type   = (string) $request->input('type', SupplyMovement::TYPE_PURCHASE);
        $userId = $request->user()->id;

        try {
            $movement = $type === SupplyMovement::TYPE_PURCHASE
                ? $this->service->registerPurchase(
                    supply:   $supply,
                    quantity: (float) $request->input('quantity'),
                    amount:   (float) $request->input('amount'),
                    note:     $request->input('note'),
                    userId:   $userId,
                )
                : $this->service->registerNonCashMovement(
                    supply:   $supply,
                    type:     $type,
                    quantity: (float) $request->input('quantity'),
                    amount:   (float) ($request->input('amount') ?? 0),
                    note:     $request->input('note'),
                    userId:   $userId,
                );
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success($movement->load('supply'), 'Movimiento registrado.', 201);
    }

    /** GET /supplies/movements — historial (cajero: solo los suyos). */
    public function movements(Request $request): JsonResponse
    {
        $user      = $request->user();
        $isAdmin   = $user->isAdminRole();
        $isCashier = $user->hasRole(['cajero']) && ! $isAdmin;

        $movements = SupplyMovement::with(['supply:id,name,category,unit', 'user:id,name'])
            ->when($request->integer('supply_id'), fn ($q, $id) => $q->where('supply_id', $id))
            ->when($request->input('type'), fn ($q, $t) => $q->where('type', $t))
            ->when($isCashier, fn ($q) => $q->where('user_id', $user->id))
            ->orderByDesc('created_at')
            ->limit(200)
            ->get();

        return $this->success($movements);
    }

    /**
     * GET /reports/supplies?from&to — gasto por categoría + top insumos.
     * El gasto = compras (type purchase); rango en zona del negocio.
     */
    public function report(Request $request): JsonResponse
    {
        $from = $request->input('from', now()->startOfMonth()->toDateString());
        $to   = $request->input('to',   now()->toDateString());

        $fromUtc = DateRange::fromUtc($from);
        $toUtc   = DateRange::toUtc($to);

        $base = DB::table('supply_movements')
            ->join('supplies', 'supplies.id', '=', 'supply_movements.supply_id')
            ->where('supply_movements.type', SupplyMovement::TYPE_PURCHASE)
            ->when($fromUtc, fn ($q) => $q->where('supply_movements.created_at', '>=', $fromUtc))
            ->when($toUtc,   fn ($q) => $q->where('supply_movements.created_at', '<=', $toUtc));

        $byCategory = (clone $base)
            ->selectRaw("COALESCE(supplies.category, 'Sin categoría') as category, COUNT(*) as purchases, COALESCE(SUM(supply_movements.amount), 0) as total")
            ->groupBy('category')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($r) => [
                'category'  => $r->category,
                'purchases' => (int) $r->purchases,
                'total'     => round((float) $r->total, 2),
            ]);

        $topSupplies = (clone $base)
            ->selectRaw('supplies.id, supplies.name, supplies.category, COUNT(*) as purchases, COALESCE(SUM(supply_movements.quantity), 0) as quantity, COALESCE(SUM(supply_movements.amount), 0) as total')
            ->groupBy('supplies.id', 'supplies.name', 'supplies.category')
            ->orderByDesc('total')
            ->limit(20)
            ->get()
            ->map(fn ($r) => [
                'id'        => $r->id,
                'name'      => $r->name,
                'category'  => $r->category,
                'purchases' => (int) $r->purchases,
                'quantity'  => round((float) $r->quantity, 2),
                'total'     => round((float) $r->total, 2),
            ]);

        return $this->success([
            'period'       => ['from' => $from, 'to' => $to],
            'total'        => round((float) (clone $base)->sum('supply_movements.amount'), 2),
            'by_category'  => $byCategory,
            'top_supplies' => $topSupplies,
        ]);
    }
}
