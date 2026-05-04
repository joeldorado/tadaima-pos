<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

return new class extends Migration
{
    public function up(): void
    {
        $rows = DB::table('product_images')
            ->whereNotNull('image_path')
            ->where('image_path', '!=', '')
            ->where('image_path', '!=', '0')
            ->get(['id', 'image_path']);

        $orphans = $rows->filter(fn ($row) => ! Storage::disk('gcs')->exists($row->image_path));

        if ($orphans->isNotEmpty()) {
            DB::table('product_images')
                ->whereIn('id', $orphans->pluck('id'))
                ->delete();
        }
    }

    public function down(): void {}
};
