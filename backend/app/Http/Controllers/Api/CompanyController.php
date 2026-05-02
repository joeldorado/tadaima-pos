<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\CreateCompanyRequest;
use App\Http\Requests\UpdateCompanyRequest;
use App\Http\Resources\CompanyResource;
use App\Models\Company;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CompanyController extends Controller
{
    /**
     * GET /companies
     * Filters: active
     */
    public function index(Request $request): JsonResponse
    {
        $companies = Company::withCount('stores')
            ->when($request->filled('active'), fn ($q) => $q->where('active', filter_var($request->active, FILTER_VALIDATE_BOOLEAN)))
            ->orderBy('name')
            ->get();

        return $this->success(CompanyResource::collection($companies));
    }

    /**
     * POST /companies
     */
    public function store(CreateCompanyRequest $request): JsonResponse
    {
        $company = Company::create($request->validated());
        $company->refresh();

        return $this->success(new CompanyResource($company), 'Empresa creada.', 201);
    }

    /**
     * PUT /companies/{company}
     */
    public function update(UpdateCompanyRequest $request, Company $company): JsonResponse
    {
        $company->update($request->validated());

        return $this->success(new CompanyResource($company), 'Empresa actualizada.');
    }
}
