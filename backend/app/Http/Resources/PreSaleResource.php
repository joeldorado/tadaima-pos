<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PreSaleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $itemsLoaded    = $this->relationLoaded('items');
        $paymentsLoaded = $this->relationLoaded('payments');

        $total      = $itemsLoaded    ? $this->total       : null;
        $paidAmount = $paymentsLoaded ? $this->paid_amount : null;
        $balance    = ($total !== null && $paidAmount !== null) ? round($total - $paidAmount, 2) : null;

        return [
            'id'                => $this->id,
            'product_id'        => $this->product_id,
            'store_id'          => $this->store_id,
            'user_id'           => $this->user_id,
            'customer_id'       => $this->customer_id,
            'code'              => $this->code,
            'product_name'      => $this->product_name,
            'advance_payment'   => $this->advance_payment,
            'preorder_limit'    => $this->preorder_limit,
            'reserved_quantity' => $this->reserved_quantity,
            'pickup_deadline'   => $this->pickup_deadline?->toDateString(),
            'status'            => $this->status,
            'cost'              => $this->cost,
            'margin_percent'    => $this->margin_percent,
            'category_id'       => $this->category_id,
            'supplier_id'       => $this->supplier_id,
            'price_1'           => $this->price_1,
            'price_2'           => $this->price_2,
            'price_3'           => $this->price_3,
            'price_4'           => $this->price_4,
            'price_5'           => $this->price_5,
            'image_path'        => $this->image_path,
            'image_url'         => $this->image_path ? url(\Illuminate\Support\Facades\Storage::url($this->image_path)) : null,

            'category' => $this->when(
                $this->category_id !== null,
                fn () => ['id' => $this->category_id, 'name' => $this->category?->name],
            ),

            'supplier' => $this->when(
                $this->supplier_id !== null,
                fn () => ['id' => $this->supplier_id, 'name' => $this->supplier?->name],
            ),

            'total'       => $total,
            'paid_amount' => $paidAmount,
            'balance'     => $balance,

            'customer' => $this->when(
                $this->relationLoaded('customer') && $this->customer,
                fn () => [
                    'id'   => $this->customer->id,
                    'name' => $this->customer->name,
                    'tier' => $this->customer->loyalty_tier,
                ],
            ),

            'items' => $this->when(
                $itemsLoaded,
                fn () => PreSaleItemResource::collection($this->items),
            ),

            'payments' => $this->when(
                $paymentsLoaded,
                fn () => PreSalePaymentResource::collection($this->payments),
            ),

            'logs' => $this->when(
                $this->relationLoaded('logs'),
                fn () => PreSaleLogResource::collection($this->logs),
            ),

            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
