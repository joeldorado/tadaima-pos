import React from 'react'
import { RouterProvider } from 'react-router-dom'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { AuthProvider } from '@tadaima/auth'
import { StoreProvider } from '@/contexts/StoreContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { router } from '@/router'
import { localStorageTokenStorage } from '@/lib/tokenStorage'
import { queryClient, queryPersister } from '@/lib/queryClient'
import { AppToaster } from '@/components/AppToaster'

const ONE_DAY_MS = 24 * 60 * 60_000

interface ErrorBoundaryState { error: Error | null }

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', background: '#0a0a0a', color: '#ff6b6b', minHeight: '100vh' }}>
          <h2 style={{ color: '#E0221A', marginBottom: 16 }}>Error en la aplicación</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, background: '#111', padding: 16, borderRadius: 8, border: '1px solid #333' }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

function App(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: queryPersister, maxAge: ONE_DAY_MS }}
      >
        <ThemeProvider>
          <AuthProvider storage={localStorageTokenStorage}>
            <StoreProvider>
              <RouterProvider router={router} />
              <AppToaster />
            </StoreProvider>
          </AuthProvider>
        </ThemeProvider>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
