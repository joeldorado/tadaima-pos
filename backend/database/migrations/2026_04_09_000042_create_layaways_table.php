<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('layaways', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();              // AP-YYYYMM-XXXX
            $table->foreignId('store_id')->constrained('stores');
            $table->foreignId('user_id')->constrained('users');
            $table->foreignId('customer_id')->constrained('customers');
            $table->foreignId('product_id')->constrained('products');
            $table->foreignId('warehouse_id')->nullable()->constrained('warehouses');
            $table->unsignedInteger('quantity')->default(1);
            $table->decimal('price', 12, 2);               // precio unitario
            $table->decimal('total', 12, 2);               // price * quantity
            $table->decimal('down_payment', 12, 2);        // anticipo inicial
            $table->enum('status', [
                'pending', 'active', 'paid', 'delivered', 'cancelled', 'expired',
            ])->default('active');
            $table->date('expires_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('layaways');
    }
};
