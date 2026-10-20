<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Models\Product;
use Illuminate\Validation\Validator;

/**
 * Reglas compartidas de la composición de un paquete (Paquetes, 2026-10-07):
 * 2+ productos distintos, cantidad 1..999, sin paquetes anidados ni inactivos.
 */
trait BundleComponentsRules
{
    /** @return array<string, list<string>> */
    protected function componentRules(bool $required = true): array
    {
        return [
            'components' => [$required ? 'required' : 'sometimes', 'array', 'min:2'],
            'components.*.product_id' => ['required', 'integer', 'distinct', 'exists:products,id'],
            'components.*.quantity' => ['required', 'integer', 'min:1', 'max:999'],
        ];
    }

    /** @return array<string, string> */
    protected function componentMessages(): array
    {
        return [
            'components.required' => 'Un paquete necesita al menos 2 productos distintos.',
            'components.min' => 'Un paquete necesita al menos 2 productos distintos.',
            'components.*.product_id.required' => 'Hay un componente sin producto.',
            'components.*.product_id.distinct' => 'Hay productos repetidos; súmalos en una sola línea.',
            'components.*.product_id.exists' => 'Uno de los productos ya no existe.',
            'components.*.quantity.required' => 'Cada producto necesita cantidad de 1 o más.',
            'components.*.quantity.min' => 'Cada producto necesita cantidad de 1 o más.',
            'components.*.quantity.max' => 'La cantidad por paquete no puede pasar de 999.',
        ];
    }

    /** Una sola query: marca paquetes anidados, inactivos y auto-referencia. */
    protected function validateComponentProducts(Validator $v, ?int $selfId = null): void
    {
        $components = $this->input('components');
        if (! is_array($components) || $components === []) {
            return;
        }
        $ids = [];
        foreach ($components as $i => $line) {
            $pid = (int) (is_array($line) ? ($line['product_id'] ?? 0) : 0);
            if ($pid > 0) {
                $ids[$i] = $pid;
            }
        }
        if ($ids === []) {
            return;
        }
        $products = Product::query()->whereIn('id', array_values($ids))->get(['id', 'name', 'active', 'product_type'])->keyBy('id');
        foreach ($ids as $i => $pid) {
            $product = $products->get($pid);
            if (! $product) {
                continue; // lo reporta exists:
            }
            if ($selfId !== null && $pid === $selfId) {
                $v->errors()->add("components.{$i}.product_id", 'Un paquete no puede contenerse a sí mismo.');
                continue;
            }
            if ($product->product_type === Product::TYPE_BUNDLE) {
                $v->errors()->add("components.{$i}.product_id", "«{$product->name}» es un paquete; un paquete no puede contener otro paquete.");
                continue;
            }
            if (! $product->active) {
                $v->errors()->add("components.{$i}.product_id", "«{$product->name}» está inactivo y no puede ir en un paquete.");
            }
        }
    }
}
