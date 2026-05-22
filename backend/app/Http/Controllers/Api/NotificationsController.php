<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppNotification;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class NotificationsController extends Controller
{
    private const ADMIN_ROLES = ['admin', 'super_admin', 'owner', 'dueño'];

    /**
     * GET /notifications
     *
     * Returns notifications for the authenticated user.
     * Optionally filter to unread only: ?unread_only=true
     */
    public function index(Request $request): JsonResponse
    {
        $query = AppNotification::where('user_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->limit(100);

        if ($request->boolean('unread_only')) {
            $query->whereNull('read_at');
        }

        return $this->success($query->get());
    }

    /**
     * PATCH /notifications/{notification}/read
     *
     * Marks a notification as read. Only the owning user can mark their own.
     */
    public function markRead(Request $request, int $id): JsonResponse
    {
        $notification = AppNotification::where('id', $id)
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        if ($notification->read_at === null) {
            $notification->update(['read_at' => now()]);
        }

        return $this->success($notification);
    }

    /**
     * DELETE /notifications/{notification}
     *
     * Borra una notificación del usuario autenticado. Solo el dueño puede.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $notification = AppNotification::where('id', $id)
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        $notification->delete();

        return $this->success(null, 'Notificación eliminada.');
    }

    /**
     * POST /notifications/stock-alert
     *
     * Crea o actualiza avisos de "por agotarse / agotado" para:
     *  - cajero  -> gerente de su tienda + admins
     *  - gerente -> admins
     *
     * Si el mismo producto ya fue reportado antes para la misma tienda y
     * destinatario, NO duplica: actualiza mensaje/stock y lo vuelve unread.
     */
    public function storeStockAlert(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'product_id' => ['required', 'integer', 'exists:products,id'],
            'stock'      => ['required', 'numeric', 'min:0'],
            'kind'       => ['nullable', 'string', 'in:product,manga'],
        ]);

        $sender = $request->user();
        $isAdmin = $sender->hasRole(self::ADMIN_ROLES);
        $isManager = $sender->hasRole(['gerente']) && ! $isAdmin;
        $isCashier = $sender->hasRole(['cajero']) && ! $isAdmin;

        if (! $isManager && ! $isCashier) {
            return $this->error('Solo gerente o cajero pueden enviar avisos de stock.', 403);
        }

        if (! $sender->store_id) {
            return $this->error('El usuario no tiene tienda asignada.', 422);
        }

        $store = Store::with('manager')->findOrFail($sender->store_id);
        $product = Product::query()
            ->with('mangaDetails')
            ->findOrFail((int) $payload['product_id']);

        $kind = ($payload['kind'] ?? null) === Product::TYPE_MANGA || $product->product_type === Product::TYPE_MANGA
            ? 'manga'
            : 'product';
        $stock = (int) round((float) $payload['stock']);

        $recipients = $this->resolveRecipients($sender, $store, $isCashier, $isManager);
        if ($recipients->isEmpty()) {
            return $this->success([
                'created_or_updated' => 0,
                'recipients' => [],
            ], 'No hay destinatarios para este aviso.');
        }

        $notificationType = sprintf('stock_alert_s%d', $store->id);
        $message = $this->buildStockAlertMessage($sender, $store, $product, $kind, $stock);

        $createdOrUpdated = [];
        foreach ($recipients as $recipient) {
            $notification = AppNotification::updateOrCreate(
                [
                    'user_id'      => $recipient->id,
                    'type'         => $notificationType,
                    'reference_id' => $product->id,
                ],
                [
                    'message'    => $message,
                    'read_at'    => null,
                    'created_at' => now(),
                ],
            );

            $createdOrUpdated[] = [
                'notification_id' => $notification->id,
                'user_id' => $recipient->id,
                'user_name' => $recipient->name,
            ];
        }

        return $this->success([
            'created_or_updated' => count($createdOrUpdated),
            'recipients' => $createdOrUpdated,
        ], 'Aviso enviado correctamente.', 201);
    }

    private function resolveRecipients(User $sender, Store $store, bool $isCashier, bool $isManager): Collection
    {
        $recipients = collect();

        if ($isCashier && $store->manager_id && $store->manager_id !== $sender->id) {
            $manager = $store->manager;
            if ($manager && $manager->active) {
                $recipients->push($manager);
            }
        }

        if ($isCashier || $isManager) {
            $admins = User::query()
                ->where('active', true)
                ->whereExists(function ($query) {
                    $query->selectRaw('1')
                        ->from('model_has_roles')
                        ->join('roles', 'roles.id', '=', 'model_has_roles.role_id')
                        ->whereColumn('model_has_roles.model_id', 'users.id')
                        ->where('model_has_roles.model_type', User::class)
                        ->whereIn('roles.name', self::ADMIN_ROLES);
                })
                ->get();

            foreach ($admins as $admin) {
                if ($admin->id !== $sender->id) {
                    $recipients->push($admin);
                }
            }
        }

        return $recipients->unique('id')->values();
    }

    private function buildStockAlertMessage(User $sender, Store $store, Product $product, string $kind, int $stock): string
    {
        $roleLabel = $sender->hasRole(['gerente']) ? 'Gerente' : 'Cajero';
        $itemLabel = $kind === 'manga' ? 'tomo' : 'producto';
        $stockLabel = $stock <= 0 ? 'agotado' : "stock actual: {$stock}";

        $name = $product->name;
        if ($kind === 'manga' && $product->mangaDetails?->volume_number) {
            $name .= ' Vol. ' . $product->mangaDetails->volume_number;
        }

        return sprintf(
            '%s %s reportó %s "%s" en %s: %s.',
            $roleLabel,
            $sender->name,
            $itemLabel,
            $name,
            $store->name,
            $stockLabel,
        );
    }
}
