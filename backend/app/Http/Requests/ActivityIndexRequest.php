<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Support\ActivityFilters;
use App\Support\ActivityGroups;
use App\Support\DateRange;
use Carbon\Carbon;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Filtros de `GET /activity`, `/activity/summary` y `/activity/export`.
 *
 * Sin producto, usuario ni fechas sueltas el rango se limita a 92 días
 * (default: últimos 30) para que el UNION de las dos tablas no crezca sin
 * control; con un filtro angosto el rango es libre.
 */
class ActivityIndexRequest extends FormRequest
{
    public const DEFAULT_RANGE_DAYS = 30;

    public const MAX_RANGE_DAYS = 92;

    public const MAX_PRODUCT_IDS = 50;

    public const DEFAULT_PER_PAGE = 50;

    public const MAX_PER_PAGE = 200;

    /** Más allá de este offset el paginado deja de tener sentido: exportar. */
    public const MAX_OFFSET = 10000;

    public function authorize(): bool
    {
        return true; // el gate admin vive en el controller (adminOnlyError)
    }

    public function rules(): array
    {
        return [
            'from'          => ['nullable', 'date_format:Y-m-d'],
            'to'            => ['nullable', 'date_format:Y-m-d'],
            'dates'         => ['nullable'],
            'product_id'    => ['nullable', 'integer', 'min:1'],
            'product_ids'   => ['nullable', 'array', 'max:'.self::MAX_PRODUCT_IDS],
            'product_ids.*' => ['integer', 'min:1'],
            'user_id'       => ['nullable', 'integer', 'min:1'],
            'store_id'      => ['nullable', 'integer', 'min:1'],
            'group'         => ['nullable'],
            'group.*'       => [Rule::in(ActivityGroups::GROUPS)],
            'action'        => ['nullable', 'string', 'max:100'],
            'search'        => ['nullable', 'string', 'max:100'],
            'include_noise' => ['nullable', 'boolean'],
            'per_page'      => ['nullable', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
            'page'          => ['nullable', 'integer', 'min:1'],
        ];
    }

    protected function prepareForValidation(): void
    {
        // `group=stock,venta` (string) o `group[]=stock` (array): ambos valen.
        if (is_string($this->input('group'))) {
            $this->merge(['group' => array_values(array_filter(explode(',', $this->input('group'))))]);
        }
    }

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->isNotEmpty()) {
                    return;
                }

                $filters = $this->filters();
                if (! $filters->isNarrow()) {
                    $from = Carbon::parse($filters->from);
                    $to = Carbon::parse($filters->to);
                    if ($from->diffInDays($to, false) > self::MAX_RANGE_DAYS) {
                        $validator->errors()->add('from', 'Acota el rango a '.self::MAX_RANGE_DAYS.' días o filtra por producto o usuario.');
                    }
                }

                if ($this->page() * $this->perPage() > self::MAX_OFFSET) {
                    $validator->errors()->add('page', 'Demasiadas páginas: acota el rango o usa Exportar.');
                }
            },
        ];
    }

    public function filters(): ActivityFilters
    {
        $dates = DateRange::parseDatesParam($this->input('dates'));

        $productIds = array_map('intval', (array) $this->input('product_ids', []));
        if ($this->filled('product_id')) {
            $productIds[] = (int) $this->input('product_id');
        }
        $productIds = array_values(array_unique(array_filter($productIds)));

        $userId = $this->filled('user_id') ? (int) $this->input('user_id') : null;

        $from = $this->input('from');
        $to = $this->input('to');
        $narrow = $productIds !== [] || $userId !== null || $dates !== [];
        if (! $narrow && ! $from && ! $to) {
            $today = Carbon::now(DateRange::timezone());
            $to = $today->toDateString();
            $from = $today->copy()->subDays(self::DEFAULT_RANGE_DAYS)->toDateString();
        } elseif (! $narrow) {
            // Solo un extremo: completar el otro para poder acotar el rango.
            $from ??= Carbon::parse($to)->subDays(self::DEFAULT_RANGE_DAYS)->toDateString();
            $to ??= Carbon::parse($from)->addDays(self::DEFAULT_RANGE_DAYS)->toDateString();
        }

        $search = trim((string) $this->input('search', ''));

        return new ActivityFilters(
            from: $from,
            to: $to,
            dates: $dates,
            productIds: $productIds,
            userId: $userId,
            storeId: $this->filled('store_id') ? (int) $this->input('store_id') : null,
            groups: array_values(array_unique((array) $this->input('group', []))),
            action: $this->filled('action') ? (string) $this->input('action') : null,
            search: $search !== '' ? $search : null,
            includeNoise: $this->boolean('include_noise'),
        );
    }

    public function perPage(): int
    {
        return min((int) ($this->input('per_page') ?: self::DEFAULT_PER_PAGE), self::MAX_PER_PAGE);
    }

    public function page(): int
    {
        return max(1, (int) ($this->input('page') ?: 1));
    }
}
