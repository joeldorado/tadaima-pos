<?php

declare(strict_types=1);

use App\Support\CategoryPivotRepair;
use Illuminate\Database\Migrations\Migration;

/**
 * Repara productos con `category_id` pero sin renglón en el pivote de
 * categorías múltiples (2026-08-18). Los escribió el servicio viejo
 * (tadaima.poslite.com.mx, código previo a categorías múltiples) contra la
 * misma base — ver App\Support\CategoryPivotRepair. Idempotente.
 */
return new class extends Migration
{
    public function up(): void
    {
        CategoryPivotRepair::run();
    }

    public function down(): void
    {
        // No-op: el pivote es la fuente de verdad; category_id sigue ahí.
    }
};
