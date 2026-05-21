<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        apiPrefix: 'api/v1',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'auth' => \App\Http\Middleware\Authenticate::class,
        ]);
        // Toca users.last_seen_at en cada request /api/* autenticada (dedupe 30s).
        // Admin/gerente lo lee vía GET /users/online para saber quién está
        // conectado al POS aunque no haya abierto caja todavía.
        $middleware->api(append: [\App\Http\Middleware\TouchLastSeen::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // No autenticado → 401 JSON (evita redirigir a ruta "login" inexistente)
        $exceptions->render(function (\Illuminate\Auth\AuthenticationException $e, $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json(['success' => false, 'error' => 'No autenticado.'], 401);
            }
        });

        // Sin permisos → 403 JSON
        $exceptions->render(function (\Illuminate\Auth\Access\AuthorizationException $e, $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json(['success' => false, 'error' => 'Sin permisos.'], 403);
            }
        });

        // Validación → JSON consistente para todas las rutas /api/*
        $exceptions->render(function (\Illuminate\Validation\ValidationException $e, $request) {
            if ($request->is('api/*')) {
                return response()->json([
                    'success' => false,
                    'error'   => 'Los datos enviados no son válidos.',
                    'errors'  => $e->errors(),
                ], 422);
            }
        });

        // Modelo no encontrado → 404 JSON
        $exceptions->render(function (\Illuminate\Database\Eloquent\ModelNotFoundException $e, $request) {
            if ($request->is('api/*')) {
                $model = class_basename($e->getModel());
                return response()->json([
                    'success' => false,
                    'error'   => "{$model} no encontrado.",
                ], 404);
            }
        });

        // Ruta no encontrada → 404 JSON
        $exceptions->render(function (\Symfony\Component\HttpKernel\Exception\NotFoundHttpException $e, $request) {
            if ($request->is('api/*')) {
                return response()->json(['success' => false, 'error' => 'Ruta no encontrada.'], 404);
            }
        });
    })->create();
