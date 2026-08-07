import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// TadaimaUS demo storefront.
// Deliberately standalone: NO Tailwind, NO monorepo aliases, no PWA.
// The SPA only talks to the public /us/catalog + /us/orders endpoints
// through its own tiny fetch client (src/lib/api.ts).
export default defineConfig({
  plugins: [react()],
  server: {
    // 5173 belongs to landing/ (the POS) — keep this one out of its way.
    port: 5178,
  },
})
