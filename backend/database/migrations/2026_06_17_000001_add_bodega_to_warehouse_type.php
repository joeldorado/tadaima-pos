<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Agrega 'bodega' al enum `warehouses.type` para separar Bodega (backstock, no
 * vendible) de Exhibición (`type='store'`, vendible en Caja).
 *
 * En SQLite (tests / fresh installs) el enum ya incluye 'bodega' desde la
 * migración `create_warehouses_table` editada — aquí solo se altera la tabla
 * EXISTENTE de producción (MySQL).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement(
                "ALTER TABLE warehouses MODIFY COLUMN type "
                . "ENUM('central','store','bodega') NOT NULL DEFAULT 'store'"
            );
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement(
                "ALTER TABLE warehouses MODIFY COLUMN type "
                . "ENUM('central','store') NOT NULL DEFAULT 'store'"
            );
        }
    }
};
