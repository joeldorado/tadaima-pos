import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// TadaimaUS demo storefront.
// Deliberately standalone: NO Tailwind, NO monorepo aliases, no PWA.
// The SPA only talks to the public /us/catalog + /us/orders endpoints
// through its own tiny fetch client (src/lib/api.ts).
export default defineConfig({
  plugins: [react()],
  // Base RELATIVA: el mismo bundle sirve montado en /tadaimaus/ del POS (hoy)
  // y en la raíz de su propio dominio/proyecto (fase futura) sin rebuilds.
  // Seguro porque el router es hash-based: el path del documento nunca cambia,
  // así que ./assets y ./img siempre resuelven contra el index.html real.
  base: './',
  server: {
    // 5173 belongs to landing/ (the POS) — keep this one out of its way.
    port: 5178,
  },
})
