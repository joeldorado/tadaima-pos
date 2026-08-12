<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\UsAccountExistsException;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreUsOrderRequest;
use App\Models\UsOrder;
use App\Services\UsOrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TadaimaUS — pedidos: checkout PÚBLICO (store) + bandeja admin (index).
 *
 * store: sin auth middleware (throttle us-orders); la sesión de CLIENTE es
 *        opcional — $request->user('us'). Copy en inglés.
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
     * POST /us/orders — PÚBLICO (sesión de cliente opcional).
     *
     * Body: { name, email, phone, address, city, state, zip, country,
     *         password?, items: [{ listing_id, quantity }] }.
     * Precios SIEMPRE del server (snapshot en us_order_items); cualquier
     * monto que mande el cliente se ignora. Folio TUS-000001 secuencial.
     * Guest → crea la cuenta del cliente y devuelve `token` (auto-login).
     * Email ya registrado → 422 con code 'account_exists' (CTA de login).
     */
    public function store(StoreUsOrderRequest $request): JsonResponse
    {
        $customer = $request->user('us');

        try {
            $result = $this->service->createOrder($request->validated(), $customer);
        } catch (UsAccountExistsException $e) {
            // `code` es aditivo al envelope — el checkout lo detecta sin
            // string-matching y pinta el CTA "Sign in to continue".
            return response()->json([
                'success' => false,
                'code'    => 'account_exists',
                'error'   => $e->getMessage(),
                'errors'  => ['email' => ['An account with this email already exists.']],
            ], 422);
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        $order = $result['order'];

        $payload = [
            'order_number' => $order->order_number,
            'total_usd'    => number_format((float) $order->total_usd, 2, '.', ''),
            'items'        => $this->formatItems($order),
            'shipping'     => $this->formatShipping($order),
            'customer'     => [
                'id'    => $result['customer']->id,
                'name'  => $result['customer']->name,
                'email' => $result['customer']->email,
            ],
        ];

        // Token SOLO cuando la cuenta se creó en este checkout → el storefront
        // adopta la sesión (auto-login, "My Orders" al instante).
        if ($result['created_account']) {
            $payload['token'] = $result['customer']->createToken('us-customer')->plainTextToken;
        }

        return $this->success($payload, 'Order received', 201);
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

        return $this->success($orders->map(fn (UsOrder $o) => $this->formatOrder($o))->values());
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

        return $this->success($this->formatOrder($usOrder), 'Status actualizado.');
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /**
     * Shape del pedido para los paneles admin (tienda #/admin y POS).
     * `shipping` con nulls en pedidos legacy (anteriores a cuentas) — los
     * fronts lo toleran y pintan "order placed before accounts".
     */
    private function formatOrder(UsOrder $o): array
    {
        return [
            'id'             => $o->id,
            'us_customer_id' => $o->us_customer_id,
            'order_number'   => $o->order_number,
            'customer_name'  => $o->customer_name,
            'customer_email' => $o->customer_email,
            'customer_phone' => $o->customer_phone,
            'total_usd'      => number_format((float) $o->total_usd, 2, '.', ''),
            'status'         => $o->status,
            'created_at'     => $o->created_at?->toISOString(),
            'shipping'       => $this->formatShipping($o),
            'items'          => $this->formatItems($o),
        ];
    }

    private function formatShipping(UsOrder $o): array
    {
        return [
            'address' => $o->shipping_address,
            'city'    => $o->shipping_city,
            'state'   => $o->shipping_state,
            'zip'     => $o->shipping_zip,
            'country' => $o->shipping_country,
        ];
    }

    private function formatItems(UsOrder $o): array
    {
        return $o->items->map(fn ($i) => [
            'id'             => $i->id,
            'us_listing_id'  => $i->us_listing_id,
            'name'           => $i->name,
            'price_usd'      => number_format((float) $i->price_usd, 2, '.', ''),
            'quantity'       => $i->quantity,
            'line_total_usd' => number_format((float) $i->line_total_usd, 2, '.', ''),
        ])->values()->all();
    }
}
