import { apiClient } from './client'
import type { AuthResponse, User } from './types'

/**
 * Autentica al usuario.
 * POST /auth/login — body: { email, password }
 *
 * El response interceptor de apiClient desenvuelve response.data.data,
 * pero /auth/login retorna { token, user } directamente en .data (sin .data.data),
 * por lo que aquí lo leemos desde response.data.
 */
export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/login', { email, password })
  return response.data
}

/**
 * Retorna el usuario autenticado actualmente.
 * GET /auth/me
 */
export async function me(): Promise<User> {
  const response = await apiClient.get<User>('/auth/me')
  return response.data
}

/**
 * Cierra la sesión del usuario.
 * POST /auth/logout — retorna 204 sin body.
 */
export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout')
}
