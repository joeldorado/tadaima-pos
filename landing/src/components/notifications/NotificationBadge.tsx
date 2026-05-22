import { useState, useEffect, useRef } from "react";
import { Bell, Check, X, Loader2, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { markNotificationRead, deleteNotification } from "@tadaima/api";
import type { Notification } from "@tadaima/api";
import { motion as Motion, AnimatePresence } from "motion/react";
import { useNotificationsQuery } from "@/hooks/queries/useNotifications";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Badge + popup de notificaciones.
 *
 * Migrado a React Query (15s polling + refetchOnWindowFocus). Cualquier
 * mutación local invalida `queryKeys.notifications.all` para forzar refetch
 * inmediato y, gracias al `BroadcastChannel` del QueryClient global, otros
 * tabs del mismo navegador se sincronizan también.
 *
 * Para flujos que generen notificaciones desde otra parte del app (ej.
 * después de mandar un stock-alert) emitir el evento global
 * `tadaima:notifications-changed` y este componente refetch al instante.
 */
export function NotificationBadge() {
  const queryClient = useQueryClient();
  const notificationsQuery = useNotificationsQuery({ unreadOnly: false });
  const notifications: Notification[] = (notificationsQuery.data ?? []).slice(0, 20);
  const unread = notifications.filter(n => !n.read_at).length;

  const [open, setOpen] = useState(false);
  const [mutating, setMutating] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
  };

  // Cuando el popup se abre, fuerza un refetch inmediato (no espera al
  // siguiente tick del interval) para mostrar lo más fresco posible.
  useEffect(() => {
    if (open) invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Permite a otros módulos (ej. ProductsPage tras enviar stock-alert)
  // disparar refetch global emitiendo `tadaima:notifications-changed`.
  useEffect(() => {
    const handler = () => invalidate();
    window.addEventListener("tadaima:notifications-changed", handler);
    return () => window.removeEventListener("tadaima:notifications-changed", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Click fuera del popup → cerrar
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleMarkRead = async (id: number) => {
    setMutating(true);
    try {
      await markNotificationRead(id);
      invalidate();
    } catch {
      // silent
    } finally {
      setMutating(false);
    }
  };

  const handleDelete = async (id: number) => {
    // Optimistic: quito de la cache local; si falla la mutación, RQ refetch
    // al invalidar restaura el estado real.
    queryClient.setQueryData<Notification[]>(
      queryKeys.notifications.list({ unread_only: false }),
      prev => (prev ?? []).filter(n => n.id !== id),
    );
    try {
      await deleteNotification(id);
    } catch {
      // restaura
    } finally {
      invalidate();
    }
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.read_at).map(n => n.id);
    setMutating(true);
    try {
      await Promise.allSettled(unreadIds.map(id => markNotificationRead(id)));
    } finally {
      setMutating(false);
      invalidate();
    }
  };

  const loading = mutating || notificationsQuery.isFetching;

  return (
    <div ref={dropRef} className="relative flex flex-col items-center">
      <button
        onClick={() => setOpen(v => !v)}
        className="relative w-10 h-10 rounded-xl flex items-center justify-center transition-all"
        style={{
          background: open ? "var(--td-nav-active-bg)" : "transparent",
          border: open ? "1px solid var(--td-nav-active-border)" : "1px solid transparent",
        }}
        title="Notificaciones"
      >
        <Bell
          size={18}
          strokeWidth={open ? 2.3 : 1.8}
          style={{ color: open ? "var(--td-icon-active)" : "var(--td-icon-inactive)" }}
        />
        {unread > 0 && (
          <span
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white"
            style={{ background: "#CC2200", boxShadow: "0 0 8px rgba(204,34,0,0.6)" }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      <span style={{ fontSize: "9px", fontWeight: 600, color: "var(--td-text-lo)" }}>
        Avisos
      </span>

      <AnimatePresence>
        {open && (
          <Motion.div
            initial={{ opacity: 0, x: -8, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            // Popup ancla left-12 + bottom-0 → crece HACIA ARRIBA. Antes con
            // top-0 se iba abajo del viewport cuando el botón Avisos vive al
            // fondo del sidebar.
            className="absolute left-12 bottom-0 z-50 rounded-2xl overflow-hidden shadow-2xl"
            style={{
              background: "var(--td-popup-bg)",
              border: "1px solid var(--td-popup-border)",
              width: 320,
              maxHeight: "min(calc(100vh - 64px), 480px)",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid var(--td-divider)", flexShrink: 0 }}
            >
              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--td-text-hi)" }}>
                Notificaciones {unread > 0 && <span style={{ color: "#CC2200" }}>· {unread} sin leer</span>}
              </span>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-[9px] font-black uppercase tracking-wider"
                    style={{ color: "#CC2200" }}
                    title="Marcar todas como leídas"
                  >
                    Leer todo
                  </button>
                )}
                {loading && <Loader2 size={11} className="animate-spin" style={{ color: "var(--td-text-lo)" }} />}
              </div>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 opacity-30">
                  <Bell size={22} />
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Sin notificaciones
                  </p>
                </div>
              ) : (
                notifications.map(n => (
                  <div
                    key={n.id}
                    className="flex items-start gap-3 px-4 py-3 transition-colors"
                    style={{
                      borderBottom: "1px solid var(--td-divider)",
                      background: n.read_at ? "transparent" : "rgba(204,34,0,0.04)",
                    }}
                  >
                    {!n.read_at && (
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
                        style={{ background: "#CC2200" }}
                      />
                    )}
                    <div className="flex-1 min-w-0" style={{ marginLeft: n.read_at ? "10px" : 0 }}>
                      <p style={{ fontSize: 11, fontWeight: n.read_at ? 500 : 700, color: "var(--td-text-hi)", lineHeight: 1.4 }}>
                        {n.message}
                      </p>
                      <p style={{ fontSize: 9, color: "var(--td-text-ghost)", marginTop: 2 }}>
                        {new Date(n.created_at).toLocaleString("es-MX", {
                          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      {!n.read_at && (
                        <button
                          onClick={() => void handleMarkRead(n.id)}
                          title="Marcar como leída"
                          style={{
                            width: 24, height: 24, borderRadius: 6,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: "transparent", border: "1px solid transparent",
                            color: "var(--td-text-lo)", cursor: "pointer",
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(34,197,94,0.12)"; (e.currentTarget as HTMLButtonElement).style.color = "#22C55E"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--td-text-lo)"; }}
                        >
                          <Check size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => void handleDelete(n.id)}
                        title="Eliminar notificación"
                        style={{
                          width: 24, height: 24, borderRadius: 6,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: "transparent", border: "1px solid transparent",
                          color: "var(--td-text-lo)", cursor: "pointer",
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(220,38,38,0.12)"; (e.currentTarget as HTMLButtonElement).style.color = "#DC2626"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--td-text-lo)"; }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div
              className="flex justify-end px-4 py-2"
              style={{ borderTop: "1px solid var(--td-divider)", flexShrink: 0 }}
            >
              <button
                onClick={() => setOpen(false)}
                className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider"
                style={{ color: "var(--td-text-lo)" }}
              >
                <X size={10} /> Cerrar
              </button>
            </div>
          </Motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
