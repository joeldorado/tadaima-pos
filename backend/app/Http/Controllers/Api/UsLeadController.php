<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreUsLeadRequest;
use App\Models\UsLead;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TadaimaUS — leads del sitio US.
 * store: PÚBLICO (throttle us-leads + honeypot; mensajes en inglés).
 * index: admin del POS (mensajes en español, como el resto del módulo).
 */
class UsLeadController extends Controller
{
    /** Cap del índice admin (contrato: sin paginación, como listings/orders). */
    private const MAX_LEADS = 500;

    /**
     * POST /us/leads — público.
     * newsletter: { source, email } ·
     * contact: { source, name, email, subject, message }.
     */
    public function store(StoreUsLeadRequest $request): JsonResponse
    {
        $data = $request->validated();

        $lead = UsLead::create([
            'source'            => $data['source'],
            'name'              => $data['name'] ?? null,
            'email'             => $data['email'],
            'subject'           => $data['subject'] ?? null,
            'message'           => $data['message'] ?? null,
            'marketing_consent' => (bool) ($data['marketing_consent'] ?? false),
        ]);

        return $this->success(
            ['id' => $lead->id],
            $data['source'] === UsLead::SOURCE_CONTACT
                ? 'Thanks for reaching out — a real person will reply soon.'
                : "You're in — welcome home!",
            201
        );
    }

    /**
     * GET /us/leads?source= — admin (bandeja del panel).
     * Más nuevos primero, cap 500.
     */
    public function index(Request $request): JsonResponse
    {
        if ($resp = $this->adminOnlyError()) {
            return $resp;
        }

        $leads = UsLead::query()
            ->when($request->filled('source'), fn ($q) => $q
                ->where('source', $request->input('source')))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(self::MAX_LEADS)
            ->get();

        return $this->success($leads->map(fn (UsLead $lead) => [
            'id'                => $lead->id,
            'source'            => $lead->source,
            'name'              => $lead->name,
            'email'             => $lead->email,
            'subject'           => $lead->subject,
            'message'           => $lead->message,
            'marketing_consent' => $lead->marketing_consent,
            'created_at'        => $lead->created_at?->toISOString(),
        ])->values());
    }
}
