import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [tailwindcss(), react()],
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
