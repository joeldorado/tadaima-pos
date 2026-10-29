<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Filtros ya validados del feed de Actividad (`GET /activity*`). Inmutable:
 * el servicio los recibe y los clona con `withNoise()` para los contadores.
 */
final readonly class ActivityFilters
{
    /**
     * @param  list<string>  $dates       fechas sueltas YYYY-MM-DD (ganan sobre from/to)
     * @param  list<int>     $productIds
     * @param  list<string>  $groups      subconjunto de ActivityGroups::GROUPS
     */
    public function __construct(
        public ?string $from = null,
        public ?string $to = null,
        public array $dates = [],
        public array $productIds = [],
        public ?int $userId = null,
        public ?int $storeId = null,
        public array $groups = [],
        public ?string $action = null,
        public ?string $search = null,
        public bool $includeNoise = false,
    ) {}

    public function withNoise(bool $include): self
    {
        return new self(
            from: $this->from,
            to: $this->to,
            dates: $this->dates,
            productIds: $this->productIds,
            userId: $this->userId,
            storeId: $this->storeId,
            groups: $this->groups,
            action: $this->action,
            search: $this->search,
            includeNoise: $include,
        );
    }

    /**
     * Un filtro "angosto" (producto, usuario o fechas sueltas) acota tanto que
     * no hace falta el tope de rango de 92 días.
     */
    public function isNarrow(): bool
    {
        return $this->productIds !== [] || $this->userId !== null || $this->dates !== [];
    }
}
