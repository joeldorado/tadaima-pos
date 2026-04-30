import type { TokenStorage } from '@tadaima/auth'

const TOKEN_KEY = 'tadaima_token'

export const localStorageTokenStorage: TokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => { localStorage.setItem(TOKEN_KEY, token) },
  clear: () => { localStorage.removeItem(TOKEN_KEY) },
}
