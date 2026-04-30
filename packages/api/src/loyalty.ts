import { apiClient } from './client'
import type { AwardPointsInput, AwardPointsResult, PointTransaction } from './types'

/**
 * Otorga puntos a un cliente por una venta o preventa completada.
 * POST /loyalty/award
 */
export async function awardPoints(input: AwardPointsInput): Promise<AwardPointsResult> {
  const response = await apiClient.post<AwardPointsResult>('/loyalty/award', input)
  return response.data
}

/**
 * Historial de puntos de un cliente.
 * GET /loyalty/customers/{id}/history
 */
export async function getCustomerPointHistory(customerId: number): Promise<PointTransaction[]> {
  const response = await apiClient.get<PointTransaction[]>(
    `/loyalty/customers/${customerId}/history`
  )
  return Array.isArray(response.data) ? response.data : []
}
