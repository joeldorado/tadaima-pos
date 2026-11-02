<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePaymentMethodRequest;
use App\Http\Requests\UpdatePaymentMethodRequest;
use App\Http\Resources\PaymentMethodResource;
use App\Models\PaymentMethod;
use App\Support\ModelAudit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentMethodController extends Controller
{
    /**
     * GET /payment-methods
     * Filters: active
     */
    public function index(Request $request): JsonResponse
    {
        $methods = PaymentMethod::query()
            ->when($request->filled('active'), fn ($q) => $q->where('active', filter_var($request->active, FILTER_VALIDATE_BOOLEAN)))
            ->orderBy('name')
            ->get();

        return $this->success(PaymentMethodResource::collection($methods));
    }

    /**
     * POST /payment-methods
     */
    public function store(StorePaymentMethodRequest $request): JsonResponse
    {
        $method = PaymentMethod::create($request->validated());
        ModelAudit::created($method, 'payment_method.created', "Método de pago «{$method->name}» creado", 'payment_method', array_keys($request->validated()), $request->user()->id);
        $method->refresh();

        return $this->success(new PaymentMethodResource($method), 'Método de pago creado.', 201);
    }

    /**
     * PUT /payment-methods/{payment_method}
     */
    public function update(UpdatePaymentMethodRequest $request, PaymentMethod $payment_method): JsonResponse
    {
        $fields = array_keys($request->validated());
        $before = ModelAudit::snapshot($payment_method, $fields);
        $payment_method->update($request->validated());
        ModelAudit::updated($payment_method, $before, 'payment_method.updated', "Método de pago «{$payment_method->name}» editado", 'payment_method', $fields, $request->user()->id);

        return $this->success(new PaymentMethodResource($payment_method), 'Método de pago actualizado.');
    }
}
