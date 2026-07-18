import { useState } from "react";
import { createPortal } from "react-dom";
import { motion as Motion } from "motion/react";
import { ExternalLink, Monitor, Smartphone, X } from "lucide-react";
import type { CatalogBackgroundSlug, CatalogLayoutSlug, CatalogThemeSlug } from "@tadaima/api";

/**
 * Preview de la tienda ANTES de publicar (Catálogo v5).
 *
 * Enmarca la tienda real en un <iframe> con la combinación seleccionada vía
 * ?preview_* — no una maqueta. Así el preview nunca se desincroniza de la
 * página: es la página.
 *
 * Requiere `X-Frame-Options: SAMEORIGIN` en docker/nginx.conf (era DENY). Ojo
 * al hacer QA: `vite dev` NO manda ese header, así que un preview roto solo se
 * nota contra un build servido por nginx.
 */

/** Ancho real de un iPhone moderno: el iframe dispara las media queries de verdad. */
const MOBILE_WIDTH = 390;

export interface PreviewSelection {
  theme: CatalogThemeSlug;
  background: CatalogBackgroundSlug;
  layout: CatalogLayoutSlug;
}

export function previewUrl({ theme, background, layout }: PreviewSelection): string {
  const qs = new URLSearchParams({
    preview_theme: theme,
    preview_bg: background,
    preview_layout: layout,
  });
  return `/catalogo?${qs.toString()}`;
}

interface Props {
  selection: PreviewSelection;
  onClose: () => void;
}

export function StorePreviewModal({ selection, onClose }: Props) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  // La URL se congela al montar: cada cambio de params rebootea el SPA de la
  // tienda y vuelve a pedir el catálogo completo.
  const [src] = useState(() => previewUrl(selection));

  // Portal a <body> OBLIGATORIO: el panel que lo monta usa `backdrop-filter`
  // (GLASS), y eso crea un bloque contenedor para los descendientes `fixed` —
  // sin portal el modal se ancla al panel en vez de a la ventana.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />

      <Motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18 }}
        role="dialog"
        aria-modal="true"
        aria-label="Vista previa de la tienda"
        className="relative w-full max-w-6xl h-[85vh] rounded-[28px] overflow-hidden flex flex-col"
        style={{ background: "#0B080D", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-xs font-black text-white uppercase tracking-[0.1em]">Vista previa</h2>
            <p className="text-[9px] font-black uppercase text-white/25 tracking-widest mt-0.5">
              Así queda — todavía sin guardar
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-xl overflow-hidden border border-white/10">
              {([
                { id: "desktop", label: "Escritorio", icon: Monitor },
                { id: "mobile", label: "Celular", icon: Smartphone },
              ] as const).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setDevice(id)}
                  title={label}
                  aria-pressed={device === id}
                  className="px-3 py-2 transition-colors cursor-pointer"
                  style={
                    device === id
                      ? { background: "rgba(255,255,255,0.1)", color: "#fff" }
                      : { background: "transparent", color: "rgba(255,255,255,0.35)" }
                  }
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>

            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir en una pestaña nueva"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white/35 hover:text-white/80 border border-white/10 transition-colors"
            >
              <ExternalLink size={14} />
            </a>

            <button
              onClick={onClose}
              aria-label="Cerrar vista previa"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white/35 hover:text-white/80 border border-white/10 transition-colors cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 flex justify-center bg-black/40 p-3">
          <iframe
            // key: cambiar el src navega el iframe y esas navegaciones se apilan
            // en el historial del ADMIN. Recrear el elemento no.
            key={`${src}-${device}`}
            src={src}
            title="Vista previa de la tienda"
            className="h-full rounded-2xl bg-black"
            style={{
              width: device === "mobile" ? MOBILE_WIDTH : "100%",
              maxWidth: "100%",
              // content-box para que el ancho sea EXACTAMENTE 390 (el borde no
              // se lo come) y las media queries se disparen como en el celular.
              boxSizing: device === "mobile" ? "content-box" : "border-box",
              border: device === "mobile" ? "1px solid rgba(255,255,255,0.12)" : "none",
            }}
          />
        </div>
      </Motion.div>
    </div>,
    document.body
  );
}
