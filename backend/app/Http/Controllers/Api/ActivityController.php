<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ActivityIndexRequest;
use App\Services\ActivityFeedService;
use App\Support\DateRange;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Actividad del sistema (solo admin, 2026-10-29): quién hizo qué, con qué
 * producto y en qué tienda. Mezcla `inventory_movements` + `system_logs`.
 */
class ActivityController extends Controller
{
    public const EXPORT_MAX_ROWS = 20000;

    /** GET /activity */
    public function index(ActivityIndexRequest $request, ActivityFeedService $service): JsonResponse
    {
        if ($resp = $this->adminOnlyError()) {
            return $resp;
        }

        return $this->success($service->feed($request->filters(), $request->perPage(), $request->page()));
    }

    /** GET /activity/summary */
    public function summary(ActivityIndexRequest $request, ActivityFeedService $service): JsonResponse
    {
        if ($resp = $this->adminOnlyError()) {
            return $resp;
        }

        return $this->success($service->summary($request->filters()));
    }

    /** GET /activity/export — CSV (UTF-8 con BOM) con los mismos filtros. */
    public function export(ActivityIndexRequest $request, ActivityFeedService $service): StreamedResponse|JsonResponse
    {
        if ($resp = $this->adminOnlyError()) {
            return $resp;
        }

        $filters = $request->filters();
        $tz = DateRange::timezone();
        $filename = 'actividad-'.Carbon::now($tz)->format('Ymd-Hi').'.csv';

        return response()->streamDownload(function () use ($service, $filters, $tz): void {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, [
                'fecha_local', 'hora_local', 'usuario', 'grupo', 'accion', 'titulo', 'producto', 'sku',
                'tipo_producto', 'tienda', 'almacen', 'delta', 'stock_antes', 'stock_despues', 'referencia', 'detalle',
            ]);
            foreach ($service->export($filters, self::EXPORT_MAX_ROWS) as $e) {
                $at = $e['at'] ? Carbon::parse($e['at'])->setTimezone($tz) : null;
                fputcsv($out, [
                    $at?->toDateString(),
                    $at?->format('H:i:s'),
                    $e['user']['name'] ?? 'Sistema',
                    $e['group'],
                    $e['action'],
                    $e['title'],
                    $e['product']['name'] ?? '',
                    $e['product']['sku'] ?? '',
                    $e['product']['type'] ?? '',
                    $e['store']['name'] ?? '',
                    $e['warehouse']['name'] ?? '',
                    $e['qty_delta'],
                    $e['stock_before'],
                    $e['stock_after'],
                    $e['reference'] ?? '',
                    $e['description'] ?? ($e['meta']['notes'] ?? ''),
                ]);
            }
            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }
}
