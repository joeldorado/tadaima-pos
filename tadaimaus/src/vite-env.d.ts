/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin (e.g. http://127.0.0.1:8000) or full base ending in /api/v1. */
  readonly VITE_API_URL?: string
}
