<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// register_session_id se vuelve nullable para poder crear drafts sin caja abierta.
// El módulo de Caja lo populará cuando esté implementado.

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales_drafts', function (Blueprint $table) {
            $table->unsignedBigInteger('register_session_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('sales_drafts', function (Blueprint $table) {
            $table->unsignedBigInteger('register_session_id')->nullable(false)->change();
        });
    }
};
