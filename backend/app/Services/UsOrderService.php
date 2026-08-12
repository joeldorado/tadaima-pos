<?php

namespace App\Services;

use App\Exceptions\UsAccountExistsException;
use App\Models\UsCustomer;
use App\Models\UsListing;
use App\Models\UsOrder;
use App\Models\UsOrderItem;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * TadaimaUS — creación de pedidos del checkout (sin cobro online).
 *
 * Reglas de negocio:
 *  - Cada listing_id debe existir, estar VISIBLE y NO estar sold_out — si no,
 *    DomainException (→ 422). Mensajes en INGLÉS (cliente final US).
 *  - Precios SIEMPRE de us_listings (jamás del payload del cliente): name,
 *    price_usd y line_total_usd quedan congelados en us_order_items y
 *    total_usd en us_orders (snapshot). La dirección de entrega también se
 *    congela (shipping_*).
 *  - CUENTA DEL CLIENTE (flujo Wix): guest → se crea UsCustomer con la
 *    contraseña del checkout EN LA MISMA transacción (falla el pedido ⇒ no
 *    queda cuenta fantasma); email ya registrado → UsAccountExistsException.
 *    Logueado → la orden se liga y sus datos/dirección default se actualizan.
 *  - Folio TUS-000001 secuencial por id, seguro bajo concurrencia: se inserta
 *    con placeholder ÚNICO (uuid — dos checkouts simultáneos no chocan el
 *    unique de order_number) y se fija a TUS-{id} en la misma transacción.
 */
class UsOrderService
{
    /**
     * @param array $data Payload validado: { name, email, phone, address, city,
     *                    state, zip, country, password?, items: [...] }
     * @param UsCustomer|null $customer Sesión de cliente (null = guest)
     * @return array{order: UsOrder, customer: UsCustomer, created_account: bool}
     * @throws \DomainException|UsAccountExistsException
     */
    public function createOrder(array $data, ?UsCustomer $customer = null): array
    {
        return DB::transaction(function () use ($data, $customer) {
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

            // ── Cuenta del cliente (misma transacción que el pedido) ──────────
            $createdAccount = false;
            if ($customer === null) {
                $email = strtolower(trim($data['email']));

                if (UsCustomer::whereRaw('LOWER(email) = ?', [$email])->exists()) {
                    throw new UsAccountExistsException();
                }

                try {
                    $customer = UsCustomer::create([
                        'name'     => $data['name'],
                        'email'    => $email,
                        'phone'    => UsCustomer::normalizePhone($data['phone']),
                        'password' => $data['password'], // cast hashed
                        'address'  => $data['address'],
                        'city'     => $data['city'],
                        'state'    => $data['state'],
                        'zip'      => $data['zip'],
                        'country'  => $data['country'],
                    ]);
                } catch (QueryException $e) {
                    // Carrera contra el unique de email (dos checkouts a la
                    // vez): mismo trato que el exists() de arriba.
                    throw new UsAccountExistsException();
                }
                $createdAccount = true;
            } else {
                // Checkout logueado: lo capturado es la nueva dirección
                // default de la cuenta (patrón "Change" del Wix). El email de
                // la cuenta NO cambia — es la llave.
                $customer->update([
                    'name'    => $data['name'],
                    'phone'   => UsCustomer::normalizePhone($data['phone']),
                    'address' => $data['address'],
                    'city'    => $data['city'],
                    'state'   => $data['state'],
                    'zip'     => $data['zip'],
                    'country' => $data['country'],
                ]);
            }

            // ── Pedido + folio TUS-000001 ─────────────────────────────────────
            $order = UsOrder::create([
                'us_customer_id'   => $customer->id,
                'order_number'     => 'TUS-TMP-' . Str::uuid(),
                'customer_name'    => $data['name'],
                'customer_email'   => $data['email'],
                'customer_phone'   => $data['phone'],
                // Snapshot de entrega — congelado como los items.
                'shipping_address' => $data['address'],
                'shipping_city'    => $data['city'],
                'shipping_state'   => $data['state'],
                'shipping_zip'     => $data['zip'],
                'shipping_country' => $data['country'],
                'total_usd'        => round($totalUsd, 2),
                'status'           => UsOrder::STATUS_NEW,
            ]);

            $order->update([
                'order_number' => 'TUS-' . str_pad((string) $order->id, 6, '0', STR_PAD_LEFT),
            ]);

            // ── Items (snapshots congelados) ──────────────────────────────────
            foreach ($rows as $row) {
                UsOrderItem::create($row + ['us_order_id' => $order->id]);
            }

            return [
                'order'           => $order->load('items'),
                'customer'        => $customer,
                'created_account' => $createdAccount,
            ];
        });
    }
}
