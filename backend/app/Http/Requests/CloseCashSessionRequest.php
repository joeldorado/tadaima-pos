<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CloseCashSessionRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            // Solo PESOS contados; los dólares van en su propio campo.
            'closing_cash'     => ['required', 'numeric', 'min:0'],
            // Dólares físicos contados al cierre (US$). Nullable: si no se
            // manda, el corte se comporta como antes (un solo número MXN).
            'closing_cash_usd' => ['nullable', 'numeric', 'min:0'],
            // Fecha de negocio del corte según el DISPOSITIVO del cajero
            // (a las 11:30pm Tijuana, closed_at UTC ya cae en "mañana" —
            // esta fecha fija sin ambigüedad a qué día pertenece el corte).
            'local_date'       => ['nullable', 'date_format:Y-m-d'],
        ];
    }
}
