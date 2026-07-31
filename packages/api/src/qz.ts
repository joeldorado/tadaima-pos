import { apiClient } from './client'

// ─── QZ Tray (impresión silenciosa de tickets) ────────────────────────────────
// La llave privada vive en el backend; aquí solo se piden el certificado
// público y firmas SHA512withRSA de los requests que arma qz-tray.js.

export async function getQzCertificate(): Promise<string> {
  const response = await apiClient.get<{ certificate: string }>('/qz/cert')
  return response.data.certificate
}

export async function signQzRequest(toSign: string): Promise<string> {
  const response = await apiClient.post<{ signature: string }>('/qz/sign', { request: toSign })
  return response.data.signature
}
