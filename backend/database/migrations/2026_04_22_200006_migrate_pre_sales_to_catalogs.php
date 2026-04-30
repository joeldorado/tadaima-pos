<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Migración de datos: copia los registros existentes de pre_sales hacia
// las nuevas tablas separadas. La tabla pre_sales NO se modifica ni elimina
// aquí — sigue funcionando como fuente de datos del código legado.
//
// Reglas de migración:
//   customer_id IS NULL  → pre_sale_catalogs  (catálogos creados por admin)
//   customer_id NOT NULL → pre_sale_orders + items + payments (folios de cliente)
//
// Status mapping catálogo:
//   live/paused → published  (estaban activos y visibles)
//   ready       → closed     (mercancía llegó, se cierra el catálogo)
//   completed/expired/cancelled → cancelled
//
// Status mapping folio:
//   live/paused → pending
//   ready       → ready
//   completed   → delivered
//   expired     → expired
//   cancelled   → cancelled

return new class extends Migration
{
    public function up(): void
    {
        DB::transaction(function () {
            $this->migrateCatalogs();
            $this->migrateOrders();
        });
    }

    private function migrateCatalogs(): void
    {
        $rows = DB::table('pre_sales')
            ->whereNull('customer_id')
            ->get();

        foreach ($rows as $row) {
            // Evitar duplicados si la migración se corre más de una vez
            $exists = DB::table('pre_sale_catalogs')->where('id', $row->id)->exists();
            if ($exists) continue;

            DB::table('pre_sale_catalogs')->insert([
                'id'              => $row->id,
                'category_id'     => $row->category_id,
                'supplier_id'     => $row->supplier_id ?? null,
                'product_id'      => $row->product_id,
                'created_by'      => $row->user_id,
                'product_name'    => $row->product_name,
                'image_path'      => $row->image_path ?? null,
                'cost'            => $row->cost,
                'margin_percent'  => $row->margin_percent,
                'price_1'         => $row->price_1,
                'price_2'         => $row->price_2,
                'price_3'         => $row->price_3,
                'price_4'         => $row->price_4,
                'price_5'         => $row->price_5,
                'advance_payment' => $row->advance_payment ?? 0,
                'preorder_limit'  => $row->preorder_limit ?: null,
                'arrival_date'    => $row->arrival_date,
                'pickup_deadline' => $row->pickup_deadline,
                'status'          => $this->mapCatalogStatus($row->status),
                'created_at'      => $row->created_at,
                'updated_at'      => $row->updated_at,
            ]);
        }
    }

    private function migrateOrders(): void
    {
        $rows = DB::table('pre_sales')
            ->whereNotNull('customer_id')
            ->get();

        foreach ($rows as $row) {
            $exists = DB::table('pre_sale_orders')->where('id', $row->id)->exists();
            if ($exists) continue;

            // Generar code si no tiene
            $code = $row->code ?? ('PREV-' . str_pad($row->id, 5, '0', STR_PAD_LEFT));

            // store_id es NOT NULL en pre_sale_orders — usar 1 como fallback
            // si el registro legado no tiene tienda asignada
            $storeId = $row->store_id ?? 1;

            DB::table('pre_sale_orders')->insert([
                'id'              => $row->id,
                'code'            => $code,
                'store_id'        => $storeId,
                'user_id'         => $row->user_id,
                'customer_id'     => $row->customer_id,
                'status'          => $this->mapOrderStatus($row->status),
                'pickup_deadline' => $row->pickup_deadline,
                'notes'           => null,
                'created_at'      => $row->created_at,
                'updated_at'      => $row->updated_at,
            ]);

            // Migrar items del folio
            $items = DB::table('pre_sale_items')
                ->where('pre_sale_id', $row->id)
                ->get();

            foreach ($items as $item) {
                // pre_sale_catalog_id: el catálogo que el folio referencia.
                // En el modelo legado no existe este link explícito —
                // usamos el pre_sale_id original como aproximación si el catálogo
                // fue migrado con ese mismo ID. Si el producto tiene un catálogo
                // con el mismo ID en pre_sale_catalogs, lo enlazamos.
                $catalogId = DB::table('pre_sale_catalogs')
                    ->where('product_id', $item->product_id)
                    ->value('id');

                if (!$catalogId) continue; // ítem huérfano sin catálogo — saltar

                DB::table('pre_sale_order_items')->insert([
                    'pre_sale_order_id'   => $row->id,
                    'pre_sale_catalog_id' => $catalogId,
                    'product_id'          => $item->product_id,
                    'quantity'            => max(1, (int) $item->quantity),
                    'price_level'         => $item->price_level ?? 1,
                    'unit_price'          => $item->price,
                    'status'              => $item->status === 'delivered' ? 'delivered' : 'pending',
                    'delivered_at'        => $item->status === 'delivered' ? $item->updated_at : null,
                    'created_at'          => $item->created_at,
                ]);
            }

            // Migrar pagos del folio
            $payments = DB::table('pre_sale_payments')
                ->where('pre_sale_id', $row->id)
                ->get();

            foreach ($payments as $payment) {
                DB::table('pre_sale_order_payments')->insert([
                    'pre_sale_order_id' => $row->id,
                    'amount'            => $payment->amount,
                    'payment_method_id' => $payment->payment_method_id ?? null,
                    'cashier_id'        => $row->user_id,
                    'notes'             => null,
                    'created_at'        => $payment->created_at,
                ]);
            }
        }
    }

    private function mapCatalogStatus(string $status): string
    {
        return match ($status) {
            'live', 'paused' => 'published',
            'ready'          => 'closed',
            default          => 'cancelled',
        };
    }

    private function mapOrderStatus(string $status): string
    {
        return match ($status) {
            'live', 'paused' => 'pending',
            'ready'          => 'ready',
            'completed'      => 'delivered',
            'expired'        => 'expired',
            default          => 'cancelled',
        };
    }

    public function down(): void
    {
        DB::table('pre_sale_order_logs')->truncate();
        DB::table('pre_sale_order_payments')->truncate();
        DB::table('pre_sale_order_items')->truncate();
        DB::table('pre_sale_orders')->truncate();
        DB::table('pre_sale_catalogs')->truncate();
    }
};
