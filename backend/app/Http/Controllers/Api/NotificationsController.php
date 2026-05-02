<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationsController extends Controller
{
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
}
