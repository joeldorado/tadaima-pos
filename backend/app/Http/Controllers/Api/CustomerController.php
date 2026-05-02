<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCreditRequest;
use App\Http\Requests\StoreCustomerRequest;
use App\Http\Requests\UpdateCustomerRequest;
use App\Http\Resources\CustomerCreditResource;
use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    /**
     * GET /customers
     *
     * Query params:
     *   ?search=   filtra por name / email / phone / external_member_id
     *   ?tier=     filtra por loyalty_tier  (Bronce|Plata|Oro|Leyenda)
     */
    public function index(Request $request): JsonResponse
    {
        $customers = Customer::query()
            ->withSum('credit', 'amount')
            ->when($request->filled('search'), fn ($q) => $q->search($request->search))
            ->when($request->filled('tier'), fn ($q) => $q->where('loyalty_tier', $request->tier))
            ->orderBy('name')
            ->get();

        return $this->success(CustomerResource::collection($customers));
    }

    /**
     * GET /customers/{customer}
     */
    public function show(Customer $customer): JsonResponse
    {
        $customer->loadSum('credit', 'amount');

        return $this->success(new CustomerResource($customer));
    }

    /**
     * POST /customers
     *
     * Acepta 'tier' como alias de 'loyalty_tier' (compatibilidad frontend).
     */
    public function store(StoreCustomerRequest $request): JsonResponse
    {
        $customer = Customer::create(
            $request->only([
                'name', 'phone', 'email', 'address',
                'notes', 'external_member_id', 'loyalty_tier', 'points',
            ])
        );

        $customer->loadSum('credit', 'amount');

        return $this->success(new CustomerResource($customer), 'Cliente registrado', 201);
    }

    /**
     * PUT /customers/{customer}
     */
    public function update(UpdateCustomerRequest $request, Customer $customer): JsonResponse
    {
        $customer->update(
            $request->only([
                'name', 'phone', 'email', 'address',
                'notes', 'external_member_id', 'loyalty_tier', 'points',
            ])
        );

        $customer->loadSum('credit', 'amount');

        return $this->success(new CustomerResource($customer), 'Cliente actualizado');
    }

    /**
     * DELETE /customers/{customer}
     */
    public function destroy(Customer $customer): JsonResponse
    {
        $customer->delete();

        return $this->success(null, 'Cliente eliminado');
    }

    // ─── Credit / Saldo a favor ────────────────────────────────────────────────

    /**
     * GET /customers/{customer}/credit
     *
     * Devuelve el historial de créditos y el balance total.
     */
    public function credit(Customer $customer): JsonResponse
    {
        $customer->load('credit')->loadSum('credit', 'amount');

        return $this->success([
            'customer_id'    => $customer->id,
            'credit_balance' => (float) ($customer->credit_sum_amount ?? 0),
            'history'        => CustomerCreditResource::collection($customer->credit),
        ]);
    }

    /**
     * POST /customers/{customer}/credit
     *
     * Registra un movimiento de saldo a favor.
     * Usa amount negativo para descontar saldo.
     *
     * Body: { amount: number, reason: string }
     */
    public function addCredit(StoreCreditRequest $request, Customer $customer): JsonResponse
    {
        $entry = $customer->credit()->create($request->only(['amount', 'reason']));

        $customer->loadSum('credit', 'amount');

        return $this->success([
            'entry'          => new CustomerCreditResource($entry),
            'credit_balance' => (float) ($customer->credit_sum_amount ?? 0),
        ], 'Crédito registrado', 201);
    }
}
