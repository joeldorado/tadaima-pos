import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { toast } from 'sonner'

// Estado del motor de tours guiados (Documentación 2.0 · F1B).
// Mismo patrón que cartDraftStore: zustand + persist con partialize.
//
// Solo `completedTours` se persiste (key `tadaima-tours`): un tour a medias
// NO debe sobrevivir una recarga (la página puede haber cambiado de estado y
// el paso quedaría huérfano). `pickerOpen` vive aquí A PROPÓSITO: la
// integración del menú del avatar (fase posterior) solo tendrá que llamar
// `openPicker()` — y el listener del evento `tadaima:open-tour-picker`
// (TourPickerDialog) hace lo mismo para e2e.

/** Media query bajo la cual los tours NO arrancan (pantallas chicas / touch). */
const SMALL_SCREEN_MQ = '(max-width: 767px), (pointer: coarse)'

export type TourStatus = 'idle' | 'running' | 'blocked'

interface TourState {
  /** Tour activo (id de `content/tours`), null sin tour corriendo. */
  activeTourId: string | null
  /** Índice del paso actual DENTRO de los pasos ya filtrados por rol. */
  stepIndex: number
  status: TourStatus
  pickerOpen: boolean
  /** Tours completados: id → fecha ISO en que se terminó. */
  completedTours: Record<string, string>

  openPicker: () => void
  closePicker: () => void
  start: (id: string) => void
  next: () => void
  prev: () => void
  stop: () => void
  /** Marca el tour activo como completado (fecha de hoy) y vuelve a idle. */
  complete: () => void
  /** La usa el overlay cuando una precondición falla / se resuelve. */
  setBlocked: (blocked: boolean) => void
}

export const useTourStore = create<TourState>()(
  persist(
    (set, get) => ({
      activeTourId: null,
      stepIndex: 0,
      status: 'idle',
      pickerOpen: false,
      completedTours: {},

      openPicker: () => set({ pickerOpen: true }),
      closePicker: () => set({ pickerOpen: false }),

      start: (id) => {
        // Los tours dependen de anclas de la UI de escritorio (sidebar, barra
        // de Caja); en pantallas chicas o touch esos elementos cambian o no
        // existen — mejor un aviso honesto que un tour roto.
        if (typeof window !== 'undefined' && window.matchMedia(SMALL_SCREEN_MQ).matches) {
          toast('Los tours están disponibles en pantalla grande')
          return
        }
        set({ activeTourId: id, stepIndex: 0, status: 'running', pickerOpen: false })
      },

      next: () =>
        set(state => ({ stepIndex: state.stepIndex + 1, status: 'running' })),

      prev: () =>
        set(state => ({ stepIndex: Math.max(0, state.stepIndex - 1), status: 'running' })),

      stop: () => set({ activeTourId: null, stepIndex: 0, status: 'idle' }),

      complete: () => {
        const id = get().activeTourId
        set(state => ({
          activeTourId: null,
          stepIndex: 0,
          status: 'idle',
          completedTours: id
            ? { ...state.completedTours, [id]: new Date().toISOString() }
            : state.completedTours,
        }))
      },

      setBlocked: (blocked) =>
        set(state => {
          if (state.status === 'idle') return state
          return { ...state, status: blocked ? 'blocked' : 'running' }
        }),
    }),
    {
      name: 'tadaima-tours',
      // Solo los tours completados sobreviven recargas; el tour en curso no.
      partialize: (state) => ({ completedTours: state.completedTours }),
    },
  ),
)
