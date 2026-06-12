<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CloseCashSessionRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'closing_cash' => ['required', 'numeric', 'min:0'],
            // Fecha de negocio del corte según el DISPOSITIVO del cajero
            // (a las 11:30pm Tijuana, closed_at UTC ya cae en "mañana" —
            // esta fecha fija sin ambigüedad a qué día pertenece el corte).
            'local_date'   => ['nullable', 'date_format:Y-m-d'],
        ];
    }
}
