import React from 'react'
import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@tadaima/auth'
import { StoreProvider } from '@/contexts/StoreContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { router } from '@/router'
import { localStorageTokenStorage } from '@/lib/tokenStorage'
import { Toaster } from 'sonner'

function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <AuthProvider storage={localStorageTokenStorage}>
        <StoreProvider>
          <RouterProvider router={router} />
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#1e293b',
                color: '#f1f5f9',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '14px',
                fontSize: '13px',
                fontWeight: 600,
              },
            }}
          />
        </StoreProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
