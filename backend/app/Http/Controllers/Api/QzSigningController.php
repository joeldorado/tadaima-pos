<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Firma de requests de QZ Tray (impresión silenciosa de tickets, 2026-07-30).
 *
 * La llave privada nunca sale del backend; el front solo recibe firmas
 * SHA512withRSA en base64 que el QZ Tray de cada caja valida contra el
 * certificado público (instalado como override.crt). Sin gating por rol:
 * la firma solo autoriza imprimir en la máquina del propio usuario.
 */
class QzSigningController extends Controller
{
    /** GET /qz/cert — certificado público PEM (el mismo que se instala en las cajas). */
    public function certificate(): JsonResponse
    {
        $cert = base64_decode((string) config('services.qz.certificate'), true);
        if ($cert === false || $cert === '') {
            return $this->error('Impresión silenciosa no configurada en el servidor.', 503);
        }

        return $this->success(['certificate' => $cert]);
    }

    /** POST /qz/sign — firma el payload que arma qz-tray.js (incluye el HTML del ticket + timestamp). */
    public function sign(Request $request): JsonResponse
    {
        // 256KB: el payload trae el HTML completo del ticket/corte. Límite
        // defensivo — un ticket real ronda los 10-30KB.
        $validated = $request->validate([
            'request' => ['required', 'string', 'max:262144'],
        ]);

        $pem = base64_decode((string) config('services.qz.private_key'), true);
        if ($pem === false || $pem === '') {
            return $this->error('Impresión silenciosa no configurada en el servidor.', 503);
        }

        $key = openssl_pkey_get_private($pem);
        if ($key === false) {
            return $this->error('La llave de firma QZ es inválida.', 500);
        }

        $signature = '';
        if (! openssl_sign($validated['request'], $signature, $key, OPENSSL_ALGO_SHA512)) {
            return $this->error('No se pudo firmar la petición de impresión.', 500);
        }

        return $this->success(['signature' => base64_encode($signature)]);
    }
}
