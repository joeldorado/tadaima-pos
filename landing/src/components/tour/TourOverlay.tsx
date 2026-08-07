import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { motion as Motion } from "motion/react";
import { toast } from "sonner";
import { TriangleAlert, X } from "lucide-react";
import { useAuth } from "@tadaima/auth";
import { primaryRole } from "@/lib/permisos";
import { findTour, stepsForRole, TOUR_CHECKS } from "@/content/tours";
import type { TourStep } from "@/content/tours";
import { useTourStore } from "@/stores/tourStore";

/**
 * Motor de tours guiados (Documentación 2.0 · F1B).
 *
 * Spotlight sobre anclas `data-tour` + popover propio (sin floating-ui).
 * Va por createPortal a document.body — GOTCHA real del repo: el
 * `backdrop-filter` de los panels (glass) crea containing block para
 * `position: fixed`, así que un overlay renderizado dentro del árbol de la
 * página se "encierra" en su panel (ya mordió en producción).
 *
 * El dim/spotlight lleva `pointer-events: none` para que la página siga viva
 * debajo (las preconditions REQUIEREN que el usuario interactúe, p.ej. abrir
 * la caja). En estado bloqueado ni siquiera se dimea: solo un anillo ámbar
 * sobre el CTA + popover, para no tapar los modales del app (z-50).
 *
 * El estado por-paso (phase/anclas) vive en UN solo objeto keyado por
 * `tour:paso#nonce`: al cambiar de paso los valores se DERIVAN frescos en
 * render (sin resets setState dentro del effect → sin renders en cascada).
 */

const WAIT_FOR_TIMEOUT_MS = 5_000;
const NO_WAIT_TIMEOUT_MS = 1_500;
const TARGET_POLL_MS = 150;
const BLOCKED_RECHECK_MS = 1_000;
const MUTATION_THROTTLE_MS = 120;
const SPOT_PADDING = 6;
const POPOVER_WIDTH = 324;
const POPOVER_GAP = 14;
const VIEWPORT_EDGE = 8;
const Z_SPOTLIGHT = 9990;
const Z_POPOVER = 9995;

type Side = "top" | "bottom" | "left" | "right";
type Phase = "resolving" | "ready" | "missing" | "centered";

/** Estado por-paso, keyado para derivarse fresco al cambiar de paso. */
interface StepUi {
  key: string;
  phase: Phase;
  anchorEl: HTMLElement | null;
  blockedEl: HTMLElement | null;
}

const POPUP_STYLE: React.CSSProperties = {
  background: "var(--td-popup-bg)",
  border: "1px solid var(--td-popup-border)",
  borderRadius: 16,
  boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
  color: "var(--td-text-hi)",
  width: POPOVER_WIDTH,
  maxWidth: "min(92vw, 380px)",
  padding: "16px 18px",
  outline: "none",
  pointerEvents: "auto",
};

const BTN_GHOST: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 10, cursor: "pointer",
  background: "transparent", border: "1px solid var(--td-divider)",
  color: "var(--td-text-md)", fontSize: 11, fontWeight: 800,
};

const BTN_PRIMARY: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 10, cursor: "pointer",
  background: "linear-gradient(135deg, #CC2200, #FF4422)",
  border: "1px solid rgba(255,120,90,0.3)",
  color: "#fff", fontSize: 11, fontWeight: 900,
};

const BTN_AMBER: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 10, cursor: "pointer",
  background: "#F59E0B", border: "1px solid rgba(245,158,11,0.5)",
  color: "#1a1206", fontSize: 11, fontWeight: 900,
};

/**
 * Rect del elemento, re-medido con ResizeObserver + scroll/resize (rAF).
 * El estado va keyado al elemento: si `el` cambia, la medición previa se
 * descarta por derivación (nada de resets síncronos dentro del effect).
 * ResizeObserver SIEMPRE notifica al observar → la medición inicial llega
 * sola, sin llamadas directas.
 */
function useTrackedRect(el: HTMLElement | null): DOMRect | null {
  const [measured, setMeasured] = useState<{ el: HTMLElement; rect: DOMRect } | null>(null);
  useEffect(() => {
    if (!el) return;
    let raf = 0;
    const measure = () => { raf = 0; setMeasured({ el, rect: el.getBoundingClientRect() }); };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(measure); };
    const ro = new ResizeObserver(schedule);
    ro.observe(el); // ← dispara la medición inicial
    // capture:true — también atrapa scroll de contenedores internos (listas).
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [el]);
  return el && measured?.el === el ? measured.rect : null;
}

interface PopoverPos { top: number; left: number; side: Side }

/** Coloca el popover junto al rect según placement, con clamp al viewport. */
function computePopoverPos(
  rect: DOMRect,
  size: { w: number; h: number },
  placement: TourStep["placement"],
): PopoverPos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const space: Record<Side, number> = {
    top: rect.top, bottom: vh - rect.bottom, left: rect.left, right: vw - rect.right,
  };
  const side: Side =
    placement && placement !== "auto"
      ? placement
      : (["bottom", "right", "top", "left"] as const).reduce((best, s) =>
          space[s] > space[best] ? s : best, "bottom" as Side);

  let top = 0;
  let left = 0;
  if (side === "bottom") { top = rect.bottom + POPOVER_GAP; left = rect.left + rect.width / 2 - size.w / 2; }
  if (side === "top")    { top = rect.top - POPOVER_GAP - size.h; left = rect.left + rect.width / 2 - size.w / 2; }
  if (side === "right")  { left = rect.right + POPOVER_GAP; top = rect.top + rect.height / 2 - size.h / 2; }
  if (side === "left")   { left = rect.left - POPOVER_GAP - size.w; top = rect.top + rect.height / 2 - size.h / 2; }

  left = Math.min(Math.max(VIEWPORT_EDGE, left), Math.max(VIEWPORT_EDGE, vw - size.w - VIEWPORT_EDGE));
  top = Math.min(Math.max(VIEWPORT_EDGE, top), Math.max(VIEWPORT_EDGE, vh - size.h - VIEWPORT_EDGE));
  return { top, left, side };
}

/** Flecha CSS: cuadrito rotado con borde en las 2 caras que apuntan al target. */
function Arrow({ pos, rect, size, borderColor }: {
  pos: PopoverPos; rect: DOMRect; size: { w: number; h: number }; borderColor: string;
}) {
  const base: React.CSSProperties = {
    position: "absolute", width: 12, height: 12,
    background: "var(--td-popup-bg)", transform: "rotate(45deg)",
  };
  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
  if (pos.side === "bottom" || pos.side === "top") {
    const left = clamp(rect.left + rect.width / 2 - pos.left - 6, 14, size.w - 26);
    if (pos.side === "bottom") {
      return <span style={{ ...base, top: -7, left, borderLeft: `1px solid ${borderColor}`, borderTop: `1px solid ${borderColor}` }} />;
    }
    return <span style={{ ...base, bottom: -7, left, borderRight: `1px solid ${borderColor}`, borderBottom: `1px solid ${borderColor}` }} />;
  }
  const top = clamp(rect.top + rect.height / 2 - pos.top - 6, 14, size.h - 26);
  if (pos.side === "right") {
    return <span style={{ ...base, left: -7, top, borderLeft: `1px solid ${borderColor}`, borderBottom: `1px solid ${borderColor}` }} />;
  }
  return <span style={{ ...base, right: -7, top, borderTop: `1px solid ${borderColor}`, borderRight: `1px solid ${borderColor}` }} />;
}

export function TourOverlay() {
  const activeTourId = useTourStore(s => s.activeTourId);
  const stepIndex = useTourStore(s => s.stepIndex);
  const status = useTourStore(s => s.status);
  const next = useTourStore(s => s.next);
  const prev = useTourStore(s => s.prev);
  const stop = useTourStore(s => s.stop);
  const complete = useTourStore(s => s.complete);
  const setBlocked = useTourStore(s => s.setBlocked);

  const { user } = useAuth();
  const role = primaryRole(user?.roles);
  const navigate = useNavigate();

  const isActive = status !== "idle";
  const tour = useMemo(() => findTour(activeTourId), [activeTourId]);
  // Filtro por rol al arrancar: stepIndex indexa la lista YA filtrada.
  const steps = useMemo(() => (tour ? stepsForRole(tour.steps, role) : []), [tour, role]);
  const step: TourStep | undefined = steps[Math.min(stepIndex, Math.max(0, steps.length - 1))];
  const isLast = stepIndex >= steps.length - 1;
  const stepKey = `${activeTourId ?? ""}:${step?.id ?? ""}`;

  const reducedMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // "Ya lo hice" re-dispara todo el ciclo del paso (nav + check + target).
  const [recheckNonce, setRecheckNonce] = useState(0);
  const uiKey = `${stepKey}#${recheckNonce}`;
  const [ui, setUi] = useState<StepUi>({ key: "", phase: "centered", anchorEl: null, blockedEl: null });
  // Derivación keyada: al cambiar de paso, los valores arrancan frescos sin
  // ningún setState de reset (evita renders en cascada).
  const phase: Phase = ui.key === uiKey ? ui.phase : (step?.target ? "resolving" : "centered");
  const anchorEl = ui.key === uiKey ? ui.anchorEl : null;
  const blockedEl = ui.key === uiKey ? ui.blockedEl : null;

  // Tour inválido / sin pasos para este rol → salir limpio.
  useEffect(() => {
    if (isActive && (!tour || steps.length === 0)) stop();
  }, [isActive, tour, steps.length, stop]);

  // ── Ciclo de vida del paso: navegar → precondición → resolver target ──────
  useEffect(() => {
    if (!isActive || !step) return;
    let cancelled = false;
    const timers: number[] = [];
    const observers: MutationObserver[] = [];

    const freshUi = (): StepUi => ({
      key: uiKey,
      phase: step.target ? "resolving" : "centered",
      anchorEl: null,
      blockedEl: null,
    });
    const patchUi = (patch: Partial<StepUi>) =>
      setUi(prevUi => (prevUi.key === uiKey ? { ...prevUi, ...patch } : { ...freshUi(), ...patch }));

    // Navegación: pathname real del history (leer useLocation aquí re-correría
    // el effect en cada navegación y reiniciaría el paso a media resolución).
    if (step.route && step.route !== window.location.pathname) {
      void navigate(step.route);
    }

    const observeDom = (cb: () => void) => {
      const mo = new MutationObserver(cb);
      mo.observe(document.body, { childList: true, subtree: true, attributes: true });
      observers.push(mo);
    };

    // — Resolución del target del paso (polling 150ms + MutationObserver) —
    let resolutionStarted = false;
    let targetSettled = false;
    const startTargetResolution = () => {
      if (resolutionStarted || cancelled) return;
      resolutionStarted = true;
      const targetSel = step.target;
      if (!targetSel) return;
      const deadline = Date.now() + (step.waitFor ? WAIT_FOR_TIMEOUT_MS : NO_WAIT_TIMEOUT_MS);
      const trySettle = (): boolean => {
        if (cancelled || targetSettled) return true;
        const el = document.querySelector<HTMLElement>(`[data-tour="${targetSel}"]`);
        if (!el) return false;
        targetSettled = true;
        patchUi({ phase: "ready", anchorEl: el });
        el.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
        return true;
      };
      if (trySettle()) return;
      observeDom(() => { void trySettle(); });
      const tick = () => {
        if (cancelled || targetSettled) return;
        if (trySettle()) return;
        if (Date.now() > deadline) {
          targetSettled = true;
          patchUi({ phase: "missing" });
          return;
        }
        timers.push(window.setTimeout(tick, TARGET_POLL_MS));
      };
      timers.push(window.setTimeout(tick, TARGET_POLL_MS));
    };

    // — Precondición (check DOM) —
    const pre = step.precondition;
    if (!pre) {
      startTargetResolution();
    } else {
      let blockedAnchorFound = false;
      const passes = (): boolean => {
        const fn = TOUR_CHECKS[pre.check];
        try { return fn ? fn() : true; } catch { return false; }
      };
      const evaluate = () => {
        if (cancelled) return;
        if (passes()) {
          if (useTourStore.getState().status === "blocked") setBlocked(false);
          startTargetResolution();
          return;
        }
        setBlocked(true);
        if (pre.target && !blockedAnchorFound) {
          const el = document.querySelector<HTMLElement>(`[data-tour="${pre.target}"]`);
          if (el) {
            blockedAnchorFound = true;
            patchUi({ blockedEl: el });
            el.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
          }
        }
      };
      evaluate();
      // Re-check automático: MutationObserver (throttle) + polling 1s.
      let throttled = false;
      observeDom(() => {
        if (throttled || cancelled) return;
        throttled = true;
        timers.push(window.setTimeout(() => { throttled = false; evaluate(); }, MUTATION_THROTTLE_MS));
      });
      const loop = () => {
        if (cancelled) return;
        if (useTourStore.getState().status === "blocked") evaluate();
        timers.push(window.setTimeout(loop, BLOCKED_RECHECK_MS));
      };
      timers.push(window.setTimeout(loop, BLOCKED_RECHECK_MS));
    }

    return () => {
      cancelled = true;
      timers.forEach(t => window.clearTimeout(t));
      observers.forEach(o => o.disconnect());
    };
  }, [isActive, step, uiKey, navigate, reducedMotion, setBlocked]);

  // ── Esc = salir, mientras el tour corre ──────────────────────────────────
  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") stop(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive, stop]);

  // ── Foco al popover al cambiar de paso / estado ──────────────────────────
  const popRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (isActive) popRef.current?.focus({ preventScroll: true });
  }, [isActive, uiKey, status, phase]);

  // Medición del popover (para colocación con clamp). ResizeObserver notifica
  // al observar → también cubre la medición inicial de cada popover nuevo.
  const [popSize, setPopSize] = useState({ w: POPOVER_WIDTH, h: 180 });
  useLayoutEffect(() => {
    const el = popRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      // Un nodo recién (des)montado puede medir ~0 — ignorarlo, porque un
      // ancho fantasma rompe el clamp al viewport (popover fuera de pantalla).
      if (r.width < 2 || r.height < 2) return;
      setPopSize(s =>
        Math.abs(s.w - r.width) < 1 && Math.abs(s.h - r.height) < 1 ? s : { w: r.width, h: r.height },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isActive, uiKey, status, phase]);

  const isBlocked = status === "blocked";
  const spotEl = isBlocked ? blockedEl : (phase === "ready" ? anchorEl : null);
  const rect = useTrackedRect(spotEl);

  if (!isActive || !tour || !step) return null;

  const spring = reducedMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 300, damping: 30 };

  const handleAdvance = () => {
    if (isLast) {
      complete();
      toast.success(`¡Completaste "${tour.title}"! 🎉`);
    } else {
      next();
    }
  };
  // Saltar el último paso también cierra el tour como completado.
  const handleSkip = handleAdvance;

  const stepCounter = (
    <p style={{ margin: 0, fontSize: 9, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--td-text-lo)" }}>
      Paso {Math.min(stepIndex + 1, steps.length)} de {steps.length}
    </p>
  );

  const closeBtn = (
    <button
      onClick={stop}
      aria-label="Salir del tour"
      title="Salir del tour (Esc)"
      style={{ position: "absolute", top: 10, right: 10, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, background: "transparent", border: "none", cursor: "pointer", color: "var(--td-text-lo)" }}
    >
      <X size={14} />
    </button>
  );

  // ── Contenido del popover según estado ───────────────────────────────────
  let popoverBody: React.ReactNode;
  let popoverBorderColor = "var(--td-popup-border)";
  if (isBlocked && step.precondition) {
    popoverBorderColor = "rgba(245,158,11,0.55)";
    popoverBody = (
      <>
        {closeBtn}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <TriangleAlert size={15} style={{ color: "#F59E0B", flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: "#F59E0B" }}>{step.precondition.failTitle}</p>
        </div>
        <div aria-live="polite">
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: "var(--td-text-md)" }}>{step.precondition.failBody}</p>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
          {step.precondition.allowSkip && (
            <button onClick={handleSkip} style={BTN_GHOST}>Saltar paso</button>
          )}
          <button onClick={() => setRecheckNonce(n => n + 1)} style={BTN_AMBER}>Ya lo hice</button>
        </div>
      </>
    );
  } else if (phase === "missing") {
    popoverBody = (
      <>
        {closeBtn}
        {stepCounter}
        <p style={{ margin: "6px 0 0", fontSize: 13, fontWeight: 900 }}>Este paso no está en pantalla</p>
        <div aria-live="polite">
          <p style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.55, color: "var(--td-text-md)" }}>
            No encontré el elemento a resaltar — puede depender del estado actual de la página. Puedes saltarlo y seguir con el tour.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
          <button onClick={stop} style={BTN_GHOST}>Salir</button>
          <button onClick={handleSkip} style={BTN_PRIMARY}>{isLast ? "Finalizar" : "Saltar paso"}</button>
        </div>
      </>
    );
  } else if (phase === "resolving") {
    popoverBody = null;
  } else {
    popoverBody = (
      <>
        {closeBtn}
        {stepCounter}
        <p style={{ margin: "6px 0 0", fontSize: 14, fontWeight: 900, letterSpacing: "-0.01em" }}>{step.title}</p>
        <div aria-live="polite">
          <p style={{ margin: "7px 0 0", fontSize: 12, lineHeight: 1.6, color: "var(--td-text-md)" }}>{step.body}</p>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 15, justifyContent: "flex-end" }}>
          {stepIndex > 0 && (
            <button onClick={prev} style={BTN_GHOST}>Anterior</button>
          )}
          <button onClick={handleAdvance} style={BTN_PRIMARY}>{isLast ? "Finalizar" : "Siguiente"}</button>
        </div>
      </>
    );
  }

  // ── Composición: dim / spotlight / popover ───────────────────────────────
  const showDim = !isBlocked && (phase === "centered" || phase === "missing" || phase === "resolving");
  const anchoredPopover = popoverBody !== null && rect !== null;
  const pos = anchoredPopover && rect
    ? computePopoverPos(rect, popSize, isBlocked ? "auto" : step.placement)
    : null;

  return createPortal(
    <div data-testid="tour-overlay">
      {/* Dim completo (pasos centrados / missing / resolviendo). */}
      {showDim && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: Z_SPOTLIGHT, background: "rgba(0,0,0,0.55)", pointerEvents: "none" }}
        />
      )}

      {/* Spotlight sobre el target (agujero vía box-shadow gigante, animado
          con Motion spring). En bloqueado: solo anillo ámbar, sin dim, para
          no tapar los modales que el usuario necesita usar. */}
      {rect && (
        <Motion.div
          initial={false}
          animate={{
            x: rect.left - SPOT_PADDING,
            y: rect.top - SPOT_PADDING,
            width: rect.width + SPOT_PADDING * 2,
            height: rect.height + SPOT_PADDING * 2,
          }}
          transition={spring}
          style={{
            position: "fixed", top: 0, left: 0, zIndex: Z_SPOTLIGHT,
            borderRadius: 12, pointerEvents: "none",
            border: isBlocked ? "2px solid rgba(245,158,11,0.9)" : "1px solid rgba(255,255,255,0.35)",
            boxShadow: isBlocked
              ? "0 0 0 4px rgba(245,158,11,0.25)"
              : "0 0 0 9999px rgba(0,0,0,0.55)",
          }}
        />
      )}

      {/* Popover anclado al rect… (animación vía tw-animate-css; el spotlight
          es el que lleva Motion, como pide el patrón del repo). */}
      {anchoredPopover && pos && rect && (
        <div
          key={`${uiKey}:${status}:${phase}`}
          ref={popRef}
          role="dialog"
          aria-label={isBlocked && step.precondition ? step.precondition.failTitle : step.title}
          tabIndex={-1}
          data-testid="tour-popover"
          className={reducedMotion ? "" : "animate-in fade-in slide-in-from-bottom-2 duration-200"}
          style={{ ...POPUP_STYLE, position: "fixed", top: pos.top, left: pos.left, zIndex: Z_POPOVER, border: `1px solid ${popoverBorderColor}` }}
        >
          <Arrow pos={pos} rect={rect} size={popSize} borderColor={popoverBorderColor} />
          {popoverBody}
        </div>
      )}

      {/* …o tarjeta sin ancla: centrada (normal/missing) o abajo (bloqueado,
          para no tapar el modal que el usuario necesita usar). */}
      {popoverBody !== null && !anchoredPopover && (
        <div
          style={
            isBlocked
              ? { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: Z_POPOVER, pointerEvents: "none" }
              : { position: "fixed", inset: 0, zIndex: Z_POPOVER, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }
          }
        >
          <div
            key={`${uiKey}:${status}:${phase}:card`}
            ref={popRef}
            role="dialog"
            aria-label={isBlocked && step.precondition ? step.precondition.failTitle : step.title}
            tabIndex={-1}
            data-testid="tour-popover"
            className={reducedMotion ? "" : "animate-in fade-in zoom-in-95 duration-200"}
            style={{ ...POPUP_STYLE, position: "relative", width: "min(440px, 92vw)", maxWidth: "92vw", padding: "20px 22px", border: `1px solid ${popoverBorderColor}` }}
          >
            {popoverBody}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
