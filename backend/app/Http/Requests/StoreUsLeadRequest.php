<?php

namespace App\Http\Requests;

use App\Models\UsLead;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * TadaimaUS — validación del alta pública de leads (POST /us/leads).
 *
 * Contrato: { source: newsletter|contact, email, name?, message? }.
 * newsletter = solo email (Sign Up del "We hear you!") ·
 * contact = requiere name + message (formulario de contacto).
 *
 * Mensajes en INGLÉS: el consumidor es el cliente final de la tienda US.
 * El envelope 422 { success:false, error, errors } lo pone bootstrap/app.php.
 */
class StoreUsLeadRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'source'  => ['required', Rule::in(UsLead::SOURCES)],
            'email'   => ['required', 'email', 'max:190'],
            'name'    => ['required_if:source,contact', 'nullable', 'string', 'max:120'],
            'message' => ['required_if:source,contact', 'nullable', 'string', 'max:1000'],

            // Asunto del formulario de contacto ("Subject *" del sitio original).
            // El newsletter no lo manda, por eso required_if y no required.
            'subject' => ['required_if:source,contact', 'nullable', 'string', 'max:150'],

            // Consentimiento explícito para email marketing (checkbox del
            // newsletter). Opcional: sin él el lead se guarda igual, pero
            // marcado como NO consentido.
            'marketing_consent' => ['sometimes', 'boolean'],

            // Honeypot: campo oculto en el form; un humano nunca lo llena.
            // max:0 = cualquier contenido lo tira con 422 (mensaje neutro).
            'website' => ['nullable', 'string', 'max:0'],
        ];
    }

    public function messages(): array
    {
        return [
            'source.required'     => 'Unable to process this request.',
            'source.in'           => 'Unable to process this request.',
            'email.required'      => 'Please enter your email address.',
            'email.email'         => 'Please enter a valid email address.',
            'email.max'           => 'Email is too long.',
            'name.required_if'    => 'Please enter your name.',
            'name.max'            => 'Name is too long.',
            'message.required_if' => 'Please write a short message.',
            'message.max'         => 'Message is limited to 1000 characters.',
            'subject.required_if' => 'Please enter a subject.',
            'subject.max'         => 'Subject is too long.',
            'website.max'         => 'Unable to process this request.',
        ];
    }
}
