<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SystemSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SystemSettingController extends Controller
{
    /**
     * GET /settings
     * Returns all settings for the authenticated user's company as a key→value map.
     */
    public function index(Request $request): JsonResponse
    {
        $companyId = $request->user()->company_id;

        $settings = SystemSetting::where('company_id', $companyId)
            ->orderBy('key')
            ->get()
            ->mapWithKeys(fn ($s) => [$s->key => $s->value]);

        return $this->success($settings);
    }

    /**
     * GET /settings/{key}
     * Returns a single setting by key.
     */
    public function show(Request $request, string $key): JsonResponse
    {
        $companyId = $request->user()->company_id;

        $setting = SystemSetting::where('company_id', $companyId)
            ->where('key', $key)
            ->first();

        if (!$setting) {
            return $this->error("Configuración '{$key}' no encontrada.", 404);
        }

        return $this->success(['key' => $setting->key, 'value' => $setting->value]);
    }

    /**
     * PUT /settings/{key}
     * Upserts a single setting.
     *
     * Body: { "value": "..." }
     */
    public function update(Request $request, string $key): JsonResponse
    {
        $request->validate([
            'value' => ['present', 'nullable', 'string', 'max:5000'],
        ]);

        // Las llaves catalog_* controlan el Catálogo Online público — solo
        // admin o usuarios con can_edit_catalog (Catálogo v3, hardening).
        if (str_starts_with($key, 'catalog_') && ($resp = $this->catalogEditError())) {
            return $resp;
        }

        $companyId = $request->user()->company_id;

        $setting = SystemSetting::updateOrCreate(
            ['company_id' => $companyId, 'key' => $key],
            ['value'      => $request->input('value')]
        );

        return $this->success(['key' => $setting->key, 'value' => $setting->value], 'Configuración guardada.');
    }

    /**
     * PUT /settings
     * Batch upsert — accepts a flat key→value object.
     *
     * Body: { "app_name": "Tadaima", "currency": "MXN", ... }
     */
    public function batchUpdate(Request $request): JsonResponse
    {
        $companyId = $request->user()->company_id;
        $payload   = $request->all();

        // Strip any non-scalar values
        $payload = array_filter($payload, fn ($v) => is_null($v) || is_scalar($v));

        if (empty($payload)) {
            return $this->error('El body no puede estar vacío.', 422);
        }

        // Hardening Catálogo v3: escrituras a llaves catalog_* requieren
        // permiso de edición de catálogo. Otras llaves conservan su gating.
        $touchesCatalog = collect($payload)->keys()->contains(fn ($k) => str_starts_with((string) $k, 'catalog_'));
        if ($touchesCatalog && ($resp = $this->catalogEditError())) {
            return $resp;
        }

        // Espejo del límite del endpoint single-key (max:5000).
        foreach ($payload as $key => $value) {
            if (is_string($value) && strlen($value) > 5000) {
                return $this->error("El valor de '{$key}' excede el máximo de 5000 caracteres.", 422);
            }
        }

        foreach ($payload as $key => $value) {
            SystemSetting::updateOrCreate(
                ['company_id' => $companyId, 'key' => (string) $key],
                ['value'      => $value !== null ? (string) $value : null]
            );
        }

        // Return full updated settings map
        $all = SystemSetting::where('company_id', $companyId)
            ->orderBy('key')
            ->get()
            ->mapWithKeys(fn ($s) => [$s->key => $s->value]);

        return $this->success($all, count($payload) . ' configuración(es) guardada(s).');
    }
}
