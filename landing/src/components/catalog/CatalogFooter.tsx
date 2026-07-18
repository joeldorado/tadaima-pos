import { MapPin, MessageCircle, Phone } from "lucide-react"
import type { CatalogAppearance, CatalogFooterData } from "@tadaima/api"
import { buildWhatsAppLink } from "@/lib/catalogWhatsApp"

const DISPLAY = "'Space Grotesk', system-ui, sans-serif"

/**
 * Footer estático del Catálogo Online (Catálogo v3) — la tienda se siente
 * página web real: marca + descripción, sucursales con domicilio/contacto
 * (toggles del admin) y redes sociales. Responsivo 1→3 columnas.
 * Colores vía vars `--cat-*` para seguir el tema activo.
 */

interface CatalogFooterProps {
  appearance: CatalogAppearance
  footer: CatalogFooterData
  /** Slot de redes (SocialLinks) — inyectado para mantener este archivo chico. */
  socialsSlot: React.ReactNode
  hasSocials: boolean
}

export function CatalogFooter({ appearance, footer, socialsSlot, hasSocials }: CatalogFooterProps) {
  const showStores = footer.show_stores && footer.stores.length > 0
  const showBrand = !!appearance.description
  // Sin contenido configurado no pintamos secciones vacías — solo la barra ©.
  const columns = [showBrand, showStores, hasSocials].filter(Boolean).length

  return (
    <footer
      className="relative z-10 mt-16"
      style={{ background: "var(--cat-bar-bg, rgba(11,8,13,0.82))", borderTop: "1px solid var(--td-divider)" }}
    >
      {columns > 0 && (
        <div
          className="max-w-5xl mx-auto px-4 py-10 grid gap-8"
          style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(240px, 100%), 1fr))` }}
        >
          {/* Marca + descripción */}
          {showBrand && (
            <div>
              <div
                className="inline-block"
                style={{ background: "#fff", borderRadius: 12, padding: "5px 9px", boxShadow: "0 0 18px var(--cat-glow, rgba(204,34,0,0.45))" }}
              >
                <img src="/tadaima-logo.jpeg" alt="Tadaima" style={{ height: 30, display: "block", borderRadius: 5 }} />
              </div>
              <p className="text-[13px] mt-3.5 leading-relaxed" style={{ color: "var(--td-text-lo)", maxWidth: 340 }}>
                {appearance.description}
              </p>
            </div>
          )}

          {/* Sucursales */}
          {showStores && (
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest mb-3.5" style={{ fontFamily: DISPLAY, color: "var(--td-text-md)" }}>
                Sucursales
              </p>
              <div className="space-y-4">
                {footer.stores.map((s) => (
                  <div key={s.id}>
                    <p className="text-[13px] font-bold" style={{ color: "var(--td-text-hi)" }}>{s.name}</p>
                    {s.address && (
                      <p className="flex items-start gap-1.5 text-xs mt-1" style={{ color: "var(--td-text-lo)" }}>
                        <MapPin size={12} className="shrink-0 mt-0.5" style={{ color: "var(--cat-accent-text, #FF8A80)" }} />
                        {s.address}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      {s.phone && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: "var(--td-text-lo)" }}>
                          <Phone size={11} /> {s.phone}
                        </span>
                      )}
                      {s.whatsapp && (
                        <a
                          href={buildWhatsAppLink(s.whatsapp, `Hola ${s.name}, vi su catálogo en línea 🛍️`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-lg transition-all hover:brightness-125"
                          style={{ background: "rgba(16,185,129,0.14)", border: "1px solid rgba(16,185,129,0.35)", color: "var(--cat-good, #34D399)" }}
                        >
                          <MessageCircle size={11} /> WhatsApp
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Redes */}
          {hasSocials && (
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest mb-3.5" style={{ fontFamily: DISPLAY, color: "var(--td-text-md)" }}>
                Síguenos
              </p>
              {socialsSlot}
            </div>
          )}
        </div>
      )}

      {/* Barra inferior */}
      <div style={{ borderTop: "1px solid var(--td-divider)" }}>
        <p className="max-w-5xl mx-auto px-4 py-4 text-center text-[11px] font-bold" style={{ color: "var(--td-text-ghost)" }}>
          Tadaima © {new Date().getFullYear()} · Tienda en línea
        </p>
      </div>
    </footer>
  )
}
