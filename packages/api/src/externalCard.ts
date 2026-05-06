import { apiClient } from './client'
import type { ExternalCardLookup } from './types'

/**
 * STUB — busca datos del cliente por código de tarjeta del sistema externo.
 * GET /external/card/{code}
 *
 * En producción este endpoint llama al sistema de Tadaima loyalty.
 * Para tests usa el stub en ExternalCardController.
 */
export async function lookupCardCode(code: string): Promise<ExternalCardLookup | null> {
  try {
    const response = await apiClient.get<ExternalCardLookup>(
      `/external/card/${encodeURIComponent(code)}`
    )
    return response.data ?? null
  } catch {
    return null
  }
}

/**
 * Busca socios en Supabase por id_socio, nombre, apellidos o email.
 * GET /external/customers?q={term}
 */
export async function searchExternalCustomers(q: string): Promise<ExternalCardLookup[]> {
  if (!q || q.trim().length < 2) return []
  try {
    const response = await apiClient.get<ExternalCardLookup[]>('/external/customers', {
      params: { q: q.trim() },
    })
    return Array.isArray(response.data) ? response.data : []
  } catch {
    return []
  }
}

/**
 * STUB — registra al cliente en el sistema externo (echo para testing).
 * POST /external/customer
 */
export async function registerExternalCustomer(
  input: { name: string; email: string; phone?: string | null }
): Promise<ExternalCardLookup> {
  const response = await apiClient.post<ExternalCardLookup>('/external/customer', input)
  return response.data
}
