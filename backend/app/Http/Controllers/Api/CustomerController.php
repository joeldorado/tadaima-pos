<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCreditRequest;
use App\Http\Requests\StoreCustomerRequest;
use App\Http\Requests\UpdateCustomerRequest;
use App\Http\Resources\CustomerCreditResource;
use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use App\Services\TadaimaMemberService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

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
        $data = $request->only([
            'name', 'phone', 'email', 'address',
            'notes', 'external_member_id', 'loyalty_tier', 'points',
            'member_status', 'member_level', 'member_expires_at', 'member_debt',
        ]);

        // Socio Tadaima (external_member_id): se importa de Supabase a la base
        // local. Si ese socio ya fue importado antes, reusar/actualizar su ficha
        // en vez de reventar contra el unique — así el cajero puede re-asignarlo
        // a una venta sin el error "No se pudo asignar al cliente" (idempotente).
        if (! empty($data['external_member_id'])) {
            // El snapshot llega fresco de Supabase en el alta → marca la sync.
            $data['member_synced_at'] = now();
            $customer = Customer::updateOrCreate(
                ['external_member_id' => $data['external_member_id']],
                $data,
            );
        } else {
            $customer = Customer::create($data);
        }

        $customer->loadSum('credit', 'amount');

        return $this->success(
            new CustomerResource($customer),
            $customer->wasRecentlyCreated ? 'Cliente registrado' : 'Socio reutilizado',
            $customer->wasRecentlyCreated ? 201 : 200,
        );
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
                'member_status', 'member_level', 'member_expires_at', 'member_debt',
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

    /**
     * POST /customers/{customer}/refresh-member
     *
     * Refresca el snapshot del socio Tadaima desde Supabase (solo lectura). Se
     * llama al abrir/asignar un socio para que estatus/nivel/vigencia estén al
     * día (Supabase y la BD local están desconectados). Reglas:
     *  - Si el cliente no es socio (sin external_member_id) → 422.
     *  - Si Supabase no responde → 502.
     *  - Si el socio ya no existe en Supabase (404) → NO borra el snapshot local
     *    (se queda "stale", mejor que perderlo).
     *  - Solo actualiza los campos member_* + member_synced_at; NO pisa
     *    name/phone/email que se hayan editado localmente.
     */
    public function refreshMember(Customer $customer, TadaimaMemberService $members): JsonResponse
    {
        if (empty($customer->external_member_id)) {
            return $this->error('El cliente no es socio Tadaima.', 422);
        }

        try {
            $snap = $members->lookup($customer->external_member_id);
        } catch (RuntimeException) {
            return $this->error('Error al consultar el sistema de socios.', 502);
        }

        if ($snap === null) {
            return $this->error('Membresía no encontrada en socios Tadaima.', 404);
        }

        $customer->update([
            'member_status'     => $snap['estatus']  ?? null,
            'member_level'      => $snap['nivel']    ?? null,
            'member_expires_at' => $snap['vigencia'] ?? null,
            'member_debt'       => $snap['debt']     ?? null,
            'member_synced_at'  => now(),
        ]);

        $customer->loadSum('credit', 'amount');

        return $this->success(new CustomerResource($customer), 'Estatus de socio actualizado');
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
