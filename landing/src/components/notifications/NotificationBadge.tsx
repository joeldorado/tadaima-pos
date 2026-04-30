import { useState, useEffect, useRef } from "react";
import { Bell, Check, X, Loader2 } from "lucide-react";
import { getNotifications, markNotificationRead } from "@tadaima/api";
import type { Notification } from "@tadaima/api";
import { motion as Motion, AnimatePresence } from "motion/react";

const POLL_INTERVAL = 30_000;

export function NotificationBadge() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter(n => !n.read_at).length;

  const fetchNotifications = async () => {
    try {
      const data = await getNotifications({ unread_only: false });
      setNotifications(data.slice(0, 20));
    } catch {
      // silent — non-critical
    }
  };

  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => clearInterval(id);
  }, []);

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
    setLoading(true);
    try {
      await markNotificationRead(id);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)
      );
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.read_at).map(n => n.id);
    await Promise.allSettled(unreadIds.map(id => markNotificationRead(id)));
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  };

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
            className="absolute left-12 top-0 z-50 rounded-2xl overflow-hidden shadow-2xl"
            style={{
              background: "var(--td-popup-bg)",
              border: "1px solid var(--td-popup-border)",
              width: 300,
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid var(--td-divider)" }}
            >
              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--td-text-hi)" }}>
                Notificaciones
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
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
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
                    {!n.read_at && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        title="Marcar como leída"
                        className="shrink-0 mt-0.5"
                        style={{ color: "var(--td-text-lo)" }}
                      >
                        <Check size={13} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Close */}
            <div
              className="flex justify-end px-4 py-2"
              style={{ borderTop: "1px solid var(--td-divider)" }}
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
