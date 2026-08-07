import { useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, ClipboardList, Compass, Package, ShoppingCart, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@tadaima/auth";
import { primaryRole } from "@/lib/permisos";
import { stepsForRole, toursForRole } from "@/content/tours";
import { useTourStore } from "@/stores/tourStore";

/**
 * Picker de tours guiados (Documentación 2.0 · F1B).
 *
 * Dialog Radix controlado por `pickerOpen` del tourStore. La integración del
 * menú del avatar (fase posterior) solo llamará `openPicker()`; mientras
 * tanto, el picker también se abre con el evento global
 * `tadaima:open-tour-picker` — hook de integración y de los e2e:
 *
 *   window.dispatchEvent(new CustomEvent("tadaima:open-tour-picker"))
 */

export const OPEN_TOUR_PICKER_EVENT = "tadaima:open-tour-picker";

/** Mapa local icon (kebab-case del JSON) → Lucide. Fallback: Compass. */
const TOUR_ICONS: Record<string, LucideIcon> = {
  "shopping-cart": ShoppingCart,
  "clipboard-list": ClipboardList,
  wallet: Wallet,
  package: Package,
};

const fmtFecha = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
};

export function TourPickerDialog() {
  const pickerOpen = useTourStore(s => s.pickerOpen);
  const openPicker = useTourStore(s => s.openPicker);
  const closePicker = useTourStore(s => s.closePicker);
  const start = useTourStore(s => s.start);
  const completedTours = useTourStore(s => s.completedTours);

  const { user } = useAuth();
  const role = primaryRole(user?.roles);
  const tours = toursForRole(role);

  // Hook de integración/e2e: abrir el picker sin tocar el store desde fuera.
  useEffect(() => {
    const onOpen = () => openPicker();
    window.addEventListener(OPEN_TOUR_PICKER_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TOUR_PICKER_EVENT, onOpen);
  }, [openPicker]);

  return (
    <Dialog.Root open={pickerOpen} onOpenChange={(open) => { if (!open) closePicker(); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{ position: "fixed", inset: 0, zIndex: 9980, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            zIndex: 9981, width: "min(520px, 94vw)", maxHeight: "84vh", overflowY: "auto",
            background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)",
            borderRadius: 20, boxShadow: "0 24px 64px rgba(0,0,0,0.5)", padding: "22px 22px 18px",
            outline: "none",
          }}
        >
          <Dialog.Title asChild>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em", color: "var(--td-text-hi)" }}>
              Tours guiados
            </h2>
          </Dialog.Title>
          <p style={{ margin: "5px 0 14px", fontSize: 12, color: "var(--td-text-md)" }}>
            Recorridos paso a paso sobre la pantalla real. Puedes salir cuando quieras con Esc.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {tours.map(tour => {
              const Icon = (tour.icon && TOUR_ICONS[tour.icon]) || Compass;
              const completedAt = completedTours[tour.id];
              const stepCount = stepsForRole(tour.steps, role).length;
              return (
                <div
                  key={tour.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 13, padding: "13px 14px",
                    borderRadius: 15, background: "var(--td-surface-soft)",
                    border: "1px solid var(--td-card-border)",
                  }}
                >
                  <div
                    style={{
                      width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "rgba(224,34,26,0.10)", border: "1px solid rgba(224,34,26,0.25)",
                    }}
                  >
                    <Icon size={18} style={{ color: "var(--td-red)" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: "var(--td-text-hi)" }}>{tour.title}</p>
                      {completedAt && (
                        <span
                          title={`Completado el ${fmtFecha(completedAt)}`}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em",
                            padding: "2px 7px", borderRadius: 7, color: "#10b981",
                            background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.3)",
                          }}
                        >
                          <CheckCircle2 size={10} /> Completado
                        </span>
                      )}
                    </div>
                    <p style={{ margin: "3px 0 0", fontSize: 11, lineHeight: 1.45, color: "var(--td-text-md)" }}>
                      {tour.description}
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--td-text-lo)" }}>
                      {stepCount} pasos{completedAt ? ` · ${fmtFecha(completedAt)}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => start(tour.id)}
                    data-testid={`tour-start-${tour.id}`}
                    style={{
                      flexShrink: 0, padding: "9px 16px", borderRadius: 11, cursor: "pointer",
                      background: completedAt ? "transparent" : "linear-gradient(135deg, #CC2200, #FF4422)",
                      border: completedAt ? "1px solid var(--td-divider)" : "1px solid rgba(255,120,90,0.3)",
                      color: completedAt ? "var(--td-text-md)" : "#fff",
                      fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em",
                    }}
                  >
                    {completedAt ? "Repetir" : "Iniciar"}
                  </button>
                </div>
              );
            })}
            {tours.length === 0 && (
              <p style={{ margin: 0, fontSize: 12, color: "var(--td-text-md)" }}>
                No hay tours disponibles para tu rol todavía.
              </p>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
            <Dialog.Close asChild>
              <button
                style={{
                  padding: "8px 16px", borderRadius: 10, cursor: "pointer",
                  background: "transparent", border: "1px solid var(--td-divider)",
                  color: "var(--td-text-md)", fontSize: 11, fontWeight: 800,
                }}
              >
                Cerrar
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
