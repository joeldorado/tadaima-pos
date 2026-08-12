<?php

namespace App\Services;

use App\Models\UsListing;
use App\Models\UsOrder;
use App\Models\UsOrderItem;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * TadaimaUS — creación de pedidos del checkout dummy.
 *
 * Reglas de negocio:
 *  - Cada listing_id debe existir y estar VISIBLE — si no, DomainException
 *    (→ 422). Mensajes en INGLÉS: el consumidor es el cliente final US.
 *  - Precios SIEMPRE de us_listings (jamás del payload del cliente): name,
 *    price_usd y line_total_usd quedan congelados en us_order_items y
 *    total_usd en us_orders (snapshot).
 *  - Folio TUS-000001 secuencial por id, seguro bajo concurrencia: se inserta
 *    con placeholder ÚNICO (uuid — dos checkouts simultáneos no chocan el
 *    unique de order_number) y se fija a TUS-{id} en la misma transacción.
 */
class UsOrderService
{
    /**
     * @param array $data Payload validado: { name, email, phone, items: [{ listing_id, quantity }] }
     * @throws \DomainException si un listing no existe o no está visible
     */
    public function createOrder(array $data): UsOrder
    {
        return DB::transaction(function () use ($data) {
            $lines      = $data['items'];
            $listingIds = array_values(array_unique(
                array_map(fn ($line) => (int) $line['listing_id'], $lines)
            ));

            // ── Listings visibles, con lock (precio estable en la transacción) ─
            $listings = UsListing::query()
                ->whereIn('id', $listingIds)
                ->where('visible', true)
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            foreach ($listingIds as $listingId) {
                if (! $listings->has($listingId)) {
                    throw new \DomainException('One or more items are no longer available.');
                }

                // Agotado manual (badge "Sold Out" en la tienda): el carrito
                // persistido puede traer un item marcado DESPUÉS de agregarlo.
                $listing = $listings->get($listingId);
                if ($listing->sold_out) {
                    throw new \DomainException(
                        "\"{$listing->name}\" is sold out and can no longer be ordered."
                    );
                }
            }

            // ── Total server-side (nunca confiar en montos del cliente) ───────
            $totalUsd = 0.0;
            $rows     = [];
            foreach ($lines as $line) {
                $listing   = $listings->get((int) $line['listing_id']);
                $quantity  = (int) $line['quantity'];
                $lineTotal = round((float) $listing->price_usd * $quantity, 2);
                $totalUsd += $lineTotal;

                $rows[] = [
                    'us_listing_id'  => $listing->id,
                    'name'           => $listing->name,
                    'price_usd'      => (float) $listing->price_usd,
                    'quantity'       => $quantity,
                    'line_total_usd' => $lineTotal,
                ];
            }

            // ── Pedido + folio TUS-000001 ─────────────────────────────────────
            $order = UsOrder::create([
                'order_number'   => 'TUS-TMP-' . Str::uuid(),
                'customer_name'  => $data['name'],
                'customer_email' => $data['email'],
                'customer_phone' => $data['phone'],
                'total_usd'      => round($totalUsd, 2),
                'status'         => UsOrder::STATUS_NEW,
            ]);

            $order->update([
                'order_number' => 'TUS-' . str_pad((string) $order->id, 6, '0', STR_PAD_LEFT),
            ]);

            // ── Items (snapshots congelados) ──────────────────────────────────
            foreach ($rows as $row) {
                UsOrderItem::create($row + ['us_order_id' => $order->id]);
            }

            return $order->load('items');
        });
    }
}
