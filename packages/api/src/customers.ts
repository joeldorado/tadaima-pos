import { apiClient } from './client'
import type {
  Customer,
  CreateCustomerInput,
  UpdateCustomerInput,
  GetCustomersParams,
  PaginatedResponse,
} from './types'

/**
 * Lista de clientes con búsqueda y paginación.
 * GET /customers
 */
export async function getCustomers(
  params?: GetCustomersParams
): Promise<PaginatedResponse<Customer>> {
  const response = await apiClient.get<PaginatedResponse<Customer> | Customer[]>(
    '/customers',
    { params }
  )
  const raw = response.data

  if (Array.isArray(raw)) {
    return { data: raw, current_page: 1, last_page: 1, per_page: raw.length, total: raw.length }
  }
  return raw
}

/**
 * Detalle de un cliente con su historial de crédito.
 * GET /customers/{id}
 */
export async function getCustomer(id: number): Promise<Customer> {
  const response = await apiClient.get<Customer>(`/customers/${id}`)
  return response.data
}

/**
 * Crea un nuevo cliente.
 * POST /customers
 */
export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  const response = await apiClient.post<Customer>('/customers', input)
  return response.data
}

/**
 * Actualiza datos de un cliente.
 * PUT /customers/{id}
 */
export async function updateCustomer(id: number, input: UpdateCustomerInput): Promise<Customer> {
  const response = await apiClient.put<Customer>(`/customers/${id}`, input)
  return response.data
}

/**
 * Elimina un cliente.
 * DELETE /customers/{id}
 */
export async function deleteCustomer(id: number): Promise<void> {
  await apiClient.delete(`/customers/${id}`)
}

/**
 * Agrega saldo a favor (crédito) a un cliente.
 * POST /customers/{id}/credit
 */
export async function addCustomerCredit(
  id: number,
  input: { amount: number; notes?: string }
): Promise<{ balance: number }> {
  const response = await apiClient.post<{ balance: number }>(`/customers/${id}/credit`, input)
  return response.data
}

/**
 * Consulta el saldo de crédito de un cliente.
 * GET /customers/{id}/credit
 */
export async function getCustomerCredit(id: number): Promise<{ balance: number }> {
  const response = await apiClient.get<{ balance: number }>(`/customers/${id}/credit`)
  return response.data
}
