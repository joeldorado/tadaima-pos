import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      // Service Worker SOLO para cachear imágenes del bucket GCS. No registramos
      // prompt PWA ni precache de assets — el bundle ya tiene su propio caching
      // y React Query maneja datos.
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // SW activo también en `npm run dev` para validar el cache de imágenes en
      // local. Tip: si editas imagen y no la ves cambiar en dev, abre DevTools
      // → Application → Storage → Clear site data → recarga.
      devOptions: { enabled: true, type: 'module' },
      manifest: false,
      workbox: {
        // CacheFirst para imágenes: 1 año, hasta 2000 imágenes. El filename hash
        // garantiza cache busting al editar (URL vieja queda huérfana, nueva URL
        // se descarga la primera vez y queda cacheada).
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/storage\.googleapis\.com\/tadaima-media\/.+\.(png|jpe?g|webp|gif|svg)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tadaima-images',
              expiration: {
                maxEntries: 2000,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        globPatterns: [],
        navigateFallback: null,
      },
    }),
  ],
  envPrefix: 'VITE_',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tadaima/api':         path.resolve(__dirname, '../packages/api/src/index.ts'),
      '@tadaima/hooks':       path.resolve(__dirname, '../packages/hooks/src/index.ts'),
      '@tadaima/auth':        path.resolve(__dirname, '../packages/auth/src/index.ts'),
      '@tadaima/permissions': path.resolve(__dirname, '../packages/permissions/src/index.ts'),
      '@tadaima/utils':       path.resolve(__dirname, '../packages/utils/src/index.ts'),
    },
  },
  server: {
    port: 5173,
  },
})
