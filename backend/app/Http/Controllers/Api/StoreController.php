<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AttachStorePaymentMethodRequest;
use App\Http\Requests\CreateStoreRequest;
use App\Http\Requests\UpdateStoreRequest;
use App\Http\Resources\PaymentMethodResource;
use App\Http\Resources\StoreResource;
use App\Models\Store;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StoreController extends Controller
{
    /**
     * GET /stores
     * Filters: company_id, active
     */
    public function index(Request $request): JsonResponse
    {
        $stores = Store::with(['company', 'manager'])
            ->when($request->filled('company_id'), fn ($q) => $q->where('company_id', $request->company_id))
            ->when($request->filled('active'),     fn ($q) => $q->where('active', filter_var($request->active, FILTER_VALIDATE_BOOLEAN)))
            ->orderBy('name')
            ->get();

        return $this->success(StoreResource::collection($stores));
    }

    /**
     * POST /stores
     * Si no se envía company_id, se deriva del usuario autenticado para evitar
     * que el cliente tenga que conocer/inyectar el id de su company.
     */
    public function store(CreateStoreRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['company_id'] ??= $request->user()?->company_id;

        if (empty($data['company_id'])) {
            return $this->error('No se pudo determinar la empresa para crear la tienda.', 422);
        }

        $store = Store::create($data);
        $store->refresh()->load(['company', 'manager']);

        return $this->success(new StoreResource($store), 'Tienda creada.', 201);
    }

    /**
     * PUT /stores/{store}
     */
    public function update(UpdateStoreRequest $request, Store $store): JsonResponse
    {
        $store->update($request->validated());
        $store->load(['company', 'manager']);

        return $this->success(new StoreResource($store), 'Tienda actualizada.');
    }

    /**
     * GET /stores/{store}/payment-methods
     * Returns the payment methods attached to this store (with pivot status).
     */
    public function paymentMethods(Store $store): JsonResponse
    {
        $store->load('paymentMethods');

        return $this->success(PaymentMethodResource::collection($store->paymentMethods));
    }

    /**
     * POST /stores/{store}/payment-methods
     * Attach (or re-activate) a payment method to the store.
     * Idempotent: if already attached, updates the pivot's active flag.
     */
    public function addPaymentMethod(AttachStorePaymentMethodRequest $request, Store $store): JsonResponse
    {
        $data     = $request->validated();
        $methodId = $data['payment_method_id'];
        $active   = $data['active'] ?? true;

        // syncWithoutDetaching so existing rows are updated, not re-inserted
        $store->paymentMethods()->syncWithoutDetaching([
            $methodId => ['active' => $active],
        ]);

        $store->load('paymentMethods');

        return $this->success(PaymentMethodResource::collection($store->paymentMethods), 'Método de pago asignado.');
    }
}
