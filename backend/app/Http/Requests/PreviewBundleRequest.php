<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/** POST /bundles/preview — "¿cuántos podría armar?" antes de guardar. */
class PreviewBundleRequest extends FormRequest
{
    use BundleComponentsRules;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return array_merge([
            'store_id' => ['nullable', 'integer', 'exists:stores,id'],
            'bundle_id' => ['nullable', 'integer', 'exists:products,id'],
        ], [
            // El preview acepta desde 1 producto: el asistente lo consulta
            // mientras el usuario va agregando (el mínimo de 2 se exige al guardar).
            'components' => ['required', 'array', 'min:1'],
            'components.*.product_id' => ['required', 'integer', 'distinct', 'exists:products,id'],
            'components.*.quantity' => ['required', 'integer', 'min:1', 'max:999'],
        ]);
    }

    public function withValidator(Validator $validator): void
    {
        $self = $this->input('bundle_id') ? (int) $this->input('bundle_id') : null;
        $validator->after(function (Validator $v) use ($self): void {
            if ($self !== null && \App\Models\Product::query()->whereKey($self)->value('product_type') !== \App\Models\Product::TYPE_BUNDLE) {
                $v->errors()->add('bundle_id', 'El producto indicado no es un paquete.');
            }
            $this->validateComponentProducts($v, $self);
        });
    }

    public function messages(): array
    {
        return $this->componentMessages();
    }
}
