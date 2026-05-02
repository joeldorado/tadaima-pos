<?php

namespace App\Http\Middleware;

use Illuminate\Auth\Middleware\Authenticate as Middleware;
use Illuminate\Http\Request;

class Authenticate extends Middleware
{
    protected function redirectTo(Request $request): ?string
    {
        // API routes never redirect — unauthenticated throws AuthenticationException
        // which the exception handler converts to a 401 JSON response.
        return null;
    }
}
