<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('product_images')
            ->where('image_path', '')
            ->orWhere('image_path', '0')
            ->orWhereNull('image_path')
            ->delete();
    }

    public function down(): void {}
};
