<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreUsOrderRequest;
use App\Models\UsOrder;
use App\Services\UsOrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TadaimaUS — pedidos: checkout dummy PÚBLICO (store) + bandeja admin (index).
 *
 * store: sin auth (throttle:10,1 en routes/api.php), copy en inglés.
 * index: solo admin (adminOnlyError; el 401 lo pone auth:sanctum en la ruta).
 */
class UsOrderController extends Controller
{
    /** Cap de la bandeja admin (más nuevos primero). */
    private const MAX_ORDERS = 200;

    public function __construct(private readonly UsOrderService $service)
    {
    }

    /**
     * POST /us/orders — PÚBLICO.
     *
     * Body: { name, email, phone, items: [{ listing_id, quantity }] }.
     * Precios SIEMPRE del server (snapshot en us_order_items); cualquier
     * monto que mande el cliente se ignora. Folio TUS-000001 secuencial.
     */
    public function store(StoreUsOrderRequest $request): JsonResponse
    {
        try {
            $order = $this->service->createOrder($request->validated());
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success([
            'order_number' => $order->order_number,
            'total_usd'    => number_format((float) $order->total_usd, 2, '.', ''),
        ], 'Order received', 201);
    }

    /**
     * GET /us/orders — SOLO ADMIN.
     * Pedidos con items embebidos, más nuevos primero (cap 200).
     */
    public function index(Request $request): JsonResponse
    {
        if ($resp = $this->adminOnlyError()) {
            return $resp;
        }

        $orders = UsOrder::query()
            ->with('items')
            ->orderByDesc('id')
            ->limit(self::MAX_ORDERS)
            ->get();

        return $this->success($orders->map(fn (UsOrder $o) => [
            'id'             => $o->id,
            'order_number'   => $o->order_number,
            'customer_name'  => $o->customer_name,
            'customer_email' => $o->customer_email,
            'customer_phone' => $o->customer_phone,
            'total_usd'      => number_format((float) $o->total_usd, 2, '.', ''),
            'status'         => $o->status,
            'created_at'     => $o->created_at?->toISOString(),
            'items'          => $o->items->map(fn ($i) => [
                'id'             => $i->id,
                'us_listing_id'  => $i->us_listing_id,
                'name'           => $i->name,
                'price_usd'      => number_format((float) $i->price_usd, 2, '.', ''),
                'quantity'       => $i->quantity,
                'line_total_usd' => number_format((float) $i->line_total_usd, 2, '.', ''),
            ])->values(),
        ])->values());
    }

    /** Estados válidos del workflow de contacto (pedido dummy, sin cobro). */
    private const STATUSES = ['new', 'contacted', 'completed', 'cancelled'];

    /**
     * PUT /us/orders/{usOrder}/status — SOLO ADMIN.
     * Transiciona el status del pedido (new → contacted → completed | cancelled).
     */
    public function updateStatus(Request $request, UsOrder $usOrder): JsonResponse
    {
        if ($resp = $this->adminOnlyError()) {
            return $resp;
        }

        $data = $request->validate([
            'status' => ['required', 'string', \Illuminate\Validation\Rule::in(self::STATUSES)],
        ]);

        $usOrder->update(['status' => $data['status']]);
        $usOrder->load('items');

        return $this->success([
            'id'             => $usOrder->id,
            'order_number'   => $usOrder->order_number,
            'customer_name'  => $usOrder->customer_name,
            'customer_email' => $usOrder->customer_email,
            'customer_phone' => $usOrder->customer_phone,
            'total_usd'      => number_format((float) $usOrder->total_usd, 2, '.', ''),
            'status'         => $usOrder->status,
            'created_at'     => $usOrder->created_at?->toISOString(),
            'items'          => $usOrder->items->map(fn ($i) => [
                'id'             => $i->id,
                'us_listing_id'  => $i->us_listing_id,
                'name'           => $i->name,
                'price_usd'      => number_format((float) $i->price_usd, 2, '.', ''),
                'quantity'       => $i->quantity,
                'line_total_usd' => number_format((float) $i->line_total_usd, 2, '.', ''),
            ])->values(),
        ], 'Status actualizado.');
    }
}
