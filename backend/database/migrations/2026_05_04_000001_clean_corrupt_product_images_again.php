<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('product_images')
            ->where(function ($q) {
                $q->whereNull('image_path')
                  ->orWhere('image_path', '')
                  ->orWhere('image_path', '0');
            })
            ->delete();
    }

    public function down(): void {}
};
