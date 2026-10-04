import { useEffect, useState } from "react";
import { motion as Motion, AnimatePresence } from "motion/react";
import { getLightPrice, type ProductLight } from "@tadaima/api";
import type { LightPromo } from "@/lib/promoVigentes";
import { promoDisplay } from "./promoDisplay";

const GREEN = "#34d399";

// ══════════════════════════════════════════════════════════════════════════════
// Modo TV — pantalla completa que rota las promos vigentes (para la tienda).
// ══════════════════════════════════════════════════════════════════════════════
const TV_ROTATE_MS = 8000;

export function TvMode({ items, onExit }: {
  items: { product: ProductLight; promo: LightPromo }[];
  onExit: () => void;
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const id = window.setInterval(() => setIdx(i => (i + 1) % items.length), TV_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [items.length]);

  // Fullscreen + salir con Esc (el browser dispara fullscreenchange al salir).
  useEffect(() => {
    const el = document.documentElement;
    void el.requestFullscreen?.().catch(() => { /* sin fullscreen igual funciona */ });
    const onFsChange = () => { if (!document.fullscreenElement) onExit(); };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = items.length ? items[idx % items.length] : null;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 400, cursor: "none", overflow: "hidden", background: "radial-gradient(1400px 900px at 25% -10%, #3a0a06 0%, #16090c 45%, #0a0a0f 100%)", color: "#fff", fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif" }}
      onDoubleClick={onExit}
      data-testid="tv-mode"
    >
      {/* Glow */}
      <div style={{ position: "absolute", top: "-15%", right: "-10%", width: "45vw", height: "45vw", borderRadius: "50%", background: "radial-gradient(circle, rgba(224,34,26,0.3) 0%, transparent 70%)" }} />
      <div style={{ position: "absolute", bottom: "-20%", left: "-12%", width: "50vw", height: "50vw", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,68,34,0.15) 0%, transparent 70%)" }} />

      {/* Logo esquina */}
      <div style={{ position: "absolute", top: "3vh", left: "3vw", display: "flex", alignItems: "center", gap: 14, zIndex: 2 }}>
        <div style={{ width: "5vh", height: "5vh", minWidth: 40, minHeight: 40, borderRadius: 12, background: "#fff", padding: 4, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src="/tadaima-logo.jpeg" alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </div>
        <span style={{ fontSize: "3.2vh", fontWeight: 900 }}>Tadaima</span>
      </div>
      <div style={{ position: "absolute", top: "3.6vh", right: "3vw", fontSize: "2vh", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.3em", color: "rgba(255,255,255,0.5)", zIndex: 2 }}>
        Promociones vigentes
      </div>

      <AnimatePresence mode="wait">
        {current ? (
          <Motion.div
            key={`${current.product.id}-${current.promo.id}`}
            initial={{ opacity: 0, scale: 0.96, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.02, y: -24 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: "6vw", padding: "0 6vw", zIndex: 1 }}
          >
            {/* Foto */}
            <div style={{ width: "34vw", maxWidth: "58vh", aspectRatio: "1 / 1", borderRadius: "3vh", overflow: "hidden", background: "rgba(255,255,255,0.04)", border: "2px solid rgba(255,255,255,0.12)", boxShadow: "0 30px 90px rgba(0,0,0,0.6), 0 0 80px rgba(224,34,26,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {current.product.image
                ? <img src={current.product.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: "8vh", fontWeight: 900, color: "rgba(255,255,255,0.15)" }}>Tadaima</span>}
            </div>

            {/* Texto */}
            <div style={{ maxWidth: "44vw" }}>
              {(() => {
                const disp = promoDisplay(current.promo, getLightPrice(current.product, 1));
                return (
                  <>
                    <div style={{
                      fontSize: `${Math.round(22 * disp.badgeScale)}vh`, fontWeight: 900, lineHeight: 0.9, letterSpacing: "-0.04em",
                      background: "linear-gradient(135deg, #FF3322 0%, #FFB199 100%)",
                      WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
                    }}>
                      {disp.badge}
                    </div>
                    <div style={{ marginTop: "1vh", fontSize: "3vh", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.2em", color: GREEN }}>
                      {disp.sub}
                    </div>
                    <div style={{ marginTop: "3vh", fontSize: "5.4vh", fontWeight: 900, lineHeight: 1.1 }}>{current.product.name}</div>
                    <div style={{ marginTop: "1.6vh", fontSize: "3.4vh", fontWeight: 800, color: "rgba(255,255,255,0.85)" }}>
                      {disp.cta}
                    </div>
                  </>
                );
              })()}
            </div>
          </Motion.div>
        ) : (
          <Motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
            <div style={{ fontSize: "9vh", fontWeight: 900 }}>Bienvenido a Tadaima</div>
            <div style={{ marginTop: "2vh", fontSize: "3vh", fontWeight: 700, color: "rgba(255,255,255,0.55)" }}>Pregunta por nuestras promociones</div>
          </Motion.div>
        )}
      </AnimatePresence>

      {/* Dots de progreso */}
      {items.length > 1 && (
        <div style={{ position: "absolute", bottom: "3.4vh", left: 0, right: 0, display: "flex", justifyContent: "center", gap: 10, zIndex: 2 }}>
          {items.map((it, i) => (
            <div key={`${it.product.id}-${it.promo.id}`} style={{ width: i === idx ? 26 : 9, height: 9, borderRadius: 99, background: i === idx ? "#FF3322" : "rgba(255,255,255,0.25)", transition: "all 0.4s" }} />
          ))}
        </div>
      )}
    </div>
  );
}
