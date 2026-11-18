<?php

namespace App\Support;

use App\Mail\FolioCreatedMail;
use App\Models\PreSaleOrder;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Correo de confirmación de un folio de preventa recién creado.
 *
 * Es de «mejor esfuerzo»: si el cliente no tiene correo no se manda, y una
 * falla del correo nunca tumba la respuesta. Se llama DESPUÉS de guardar el
 * folio (fuera de la transacción), nunca antes.
 */
final class FolioCreatedNotifier
{
    public static function send(PreSaleOrder $order): void
    {
        $email = $order->customer?->email;
        if (! $email) {
            return;
        }

        try {
            Mail::to($email)->send(new FolioCreatedMail($order));
        } catch (\Throwable) {
            Log::warning("FolioCreatedMail failed for order {$order->code}");
        }
    }
}
