<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// TadaimaUS — liga pedido ↔ cuenta de cliente + snapshot de dirección de
// entrega (flujo Wix replicado). Todo NULLABLE: los pedidos anteriores a las
// cuentas no tienen ni cliente ni dirección y deben seguir listándose igual.
// La dirección se CONGELA en el pedido a propósito (igual que los items):
// si el cliente cambia su dirección default después, el histórico no se mueve.
//
// Idempotente (hasColumn) — corre con `migrate --force` en cada arranque.

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('us_orders') || Schema::hasColumn('us_orders', 'us_customer_id')) {
            return;
        }

        Schema::table('us_orders', function (Blueprint $table) {
            // nullOnDelete: borrar una cuenta NO borra sus pedidos (histórico).
            $table->foreignId('us_customer_id')
                ->nullable()
                ->after('id')
                ->constrained('us_customers')
                ->nullOnDelete();
            $table->string('shipping_address', 190)->nullable()->after('customer_phone');
            $table->string('shipping_city', 120)->nullable()->after('shipping_address');
            $table->string('shipping_state', 60)->nullable()->after('shipping_city');
            $table->string('shipping_zip', 20)->nullable()->after('shipping_state');
            $table->string('shipping_country', 60)->nullable()->after('shipping_zip');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('us_orders', 'us_customer_id')) {
            return;
        }

        Schema::table('us_orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('us_customer_id');
            $table->dropColumn([
                'shipping_address', 'shipping_city', 'shipping_state',
                'shipping_zip', 'shipping_country',
            ]);
        });
    }
};
