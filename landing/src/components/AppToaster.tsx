import { Toaster } from 'sonner'
import { useTheme } from '@/contexts/ThemeContext'

/**
 * Toasts de la app (sonner) con look "cristal on-brand".
 *
 * - `theme` sincronizado con el ThemeContext → se ve bien en dark Y light
 *   (antes el <Toaster> tenía fondo hardcodeado y no seguía el tema).
 * - `closeButton`: botón ✕ para cerrar.
 * - Estilo cristal con tokens --td-* (se adapta al tema) + sombra fuerte para
 *   que no "se pierda" contra el fondo.
 * - El acento de color por tipo y la posición del ✕ viven en styles/toast.css.
 */
export function AppToaster() {
  const { theme } = useTheme()

  return (
    <Toaster
      theme={theme}
      position="top-right"
      closeButton
      gap={10}
      visibleToasts={4}
      toastOptions={{
        className: 'td-toast',
        style: {
          background: 'var(--td-popup-bg)',
          color: 'var(--td-text-hi)',
          border: '1px solid var(--td-popup-border)',
          borderRadius: '16px',
          padding: '14px 16px',
          fontSize: '13px',
          fontWeight: 600,
          boxShadow: '0 16px 44px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        },
      }}
    />
  )
}
