import type { ReactNode } from "react";
import { PromoDialog } from "./PromoDialog";
import { PromoButton } from "./PromoButton";
import { TEXT_MD } from "./promoTokens";

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
  confirmTestId?: string;
}

/** Confirmación de acciones que quitan algo (borrar promo, quitar un grupo). */
export function ConfirmDialog({
  title, children, confirmLabel, busyLabel, busy = false, onConfirm, onCancel, testId, confirmTestId,
}: ConfirmDialogProps) {
  return (
    <PromoDialog
      title={title}
      size="sm"
      busy={busy}
      onClose={onCancel}
      {...(testId ? { testId } : {})}
      footer={(
        <>
          <PromoButton onClick={onCancel} disabled={busy}>No, regresar</PromoButton>
          <PromoButton
            variant="dangerSolid"
            onClick={onConfirm}
            loading={busy}
            {...(confirmTestId ? { "data-testid": confirmTestId } : {})}
          >
            {busy ? busyLabel ?? confirmLabel : confirmLabel}
          </PromoButton>
        </>
      )}
    >
      <div className="text-[15px] font-semibold leading-relaxed" style={{ color: TEXT_MD }}>{children}</div>
    </PromoDialog>
  );
}
