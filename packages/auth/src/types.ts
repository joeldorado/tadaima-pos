import type { User } from '@tadaima/api'

// `User` is intentionally NOT re-exported — import it from `@tadaima/api` directly
// to keep a single source of truth and avoid duplicate type declarations.

// ─── Token storage abstraction ────────────────────────────────────────────────
// Implementación concreta vive en cada app (landing/src/lib/tokenStorage.ts).
// El package solo define el contrato.

export interface TokenStorage {
  get(): string | null
  set(token: string): void
  clear(): void
}

// ─── AuthContext shape ────────────────────────────────────────────────────────

export interface AuthContextValue {
  user: User | null
  isLoading: boolean
  /**
   * Authenticates the user and persists the session token.
   *
   * @throws {ApiError} On invalid credentials (401/422) or network errors.
   *   Callers must catch and surface the error to the UI.
   */
  login(email: string, password: string): Promise<void>
  logout(): Promise<void>
}

// ─── useCurrentUser shape ─────────────────────────────────────────────────────

export interface CurrentUser {
  user: User
  /** Fase 5: store selection — null until implemented */
  storeId: number | null
  /** Derivado de user.company_id */
  companyId: number | null
  /** Fase 4: role-based permissions — empty until implemented */
  roles: readonly string[]
  /** Fase 4: real permission check — always true until implemented */
  can(permission: string): boolean
}
