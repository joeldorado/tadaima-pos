import type { ReactNode } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { X } from "lucide-react";
import { POPUP_BG, POPUP_BORDER, TEXT_HI, TEXT_MD } from "./promoTokens";

type Size = "sm" | "md" | "lg";

interface PromoDialogProps {
  title: string;
  subtitle?: string;
  size?: Size;
  /** Mientras guarda no se puede cerrar (ni con Esc ni con la X). */
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Pie fijo (botones). El cuerpo hace scroll; el pie siempre queda a la vista. */
  footer?: ReactNode;
  testId?: string;
}

const MAX_WIDTH: Record<Size, string> = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" };

/**
 * Cascarón de los modales de Promos. Usa el Modal de react-aria (el mismo
 * sistema del calendario, así el selector de fecha convive adentro): foco
 * atrapado, Esc para cerrar, `role="dialog"` y scroll del fondo bloqueado.
 * No se cierra con clic afuera: aquí hay formularios y un clic perdido no debe
 * tirar lo capturado.
 */
export function PromoDialog({
  title, subtitle, size = "md", busy = false, onClose, children, footer, testId,
}: PromoDialogProps) {
  return (
    <ModalOverlay
      isOpen
      isKeyboardDismissDisabled={busy}
      onOpenChange={open => { if (!open && !busy) onClose(); }}
      className="fixed inset-0 z-[300] flex items-end justify-center sm:items-center sm:p-4"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }}
    >
      <Modal className={`w-full ${MAX_WIDTH[size]}`}>
        <Dialog
          className="flex max-h-[94dvh] flex-col rounded-t-3xl outline-none sm:rounded-3xl"
          style={{ background: POPUP_BG, border: POPUP_BORDER }}
          {...(testId ? { "data-testid": testId } : {})}
        >
          <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
            <div className="min-w-0">
              <Heading slot="title" className="text-[20px] font-black leading-tight" style={{ color: TEXT_HI }}>
                {title}
              </Heading>
              {subtitle && (
                <p className="mt-1 text-[14px] font-semibold" style={{ color: TEXT_MD }}>{subtitle}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Cerrar"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-white/10 disabled:opacity-40"
              style={{ color: TEXT_MD, cursor: busy ? "not-allowed" : "pointer" }}
            >
              <X size={20} aria-hidden />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5">
            <div className="pb-5">{children}</div>
          </div>
          {footer && (
            <footer className="flex flex-wrap items-center justify-end gap-2 px-5 py-4" style={{ borderTop: POPUP_BORDER }}>
              {footer}
            </footer>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
