<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SuppliersController extends Controller
{
    /** GET /suppliers */
    public function index(Request $request): JsonResponse
    {
        $query = Supplier::orderBy('name');

        if ($request->filled('active')) {
            $query->where('active', filter_var($request->active, FILTER_VALIDATE_BOOLEAN));
        }

        return $this->success($query->get());
    }

    /** POST /suppliers */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'   => ['required', 'string', 'max:255', 'unique:suppliers,name'],
            'active' => ['boolean'],
        ]);

        $supplier = Supplier::create($data);

        return $this->success($supplier, 'Proveedor creado.', 201);
    }

    /** PUT /suppliers/{supplier} */
    public function update(Request $request, Supplier $supplier): JsonResponse
    {
        $data = $request->validate([
            'name'   => ['sometimes', 'string', 'max:255', "unique:suppliers,name,{$supplier->id}"],
            'active' => ['boolean'],
        ]);

        $supplier->update($data);

        return $this->success($supplier, 'Proveedor actualizado.');
    }

    /** DELETE /suppliers/{supplier} */
    public function destroy(Supplier $supplier): JsonResponse
    {
        $supplier->delete();

        return $this->success(null, 'Proveedor eliminado.');
    }
}
