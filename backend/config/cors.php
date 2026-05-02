<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    | Orígenes del frontend React (Vite: 5173) y cualquier build de producción.
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_filter([
        'http://localhost:5173',
        'http://localhost:3000',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000',
        'https://tadaima.poslite.com.mx',
        env('APP_URL'),           // Cloud Run URL — se inyecta en producción
        env('CORS_ORIGIN'),       // override puntual si se necesita
    ]),

    'allowed_origins_patterns' => [
        '#^https://tadaima-[a-z0-9]+-uc\.a\.run\.app$#',
        '#^https://tadaima-[0-9]+-[a-z0-9-]+\.run\.app$#',
        '#^https://[a-z0-9-]+\.poslite\.com\.mx$#',  // subdominos poslite
    ],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
