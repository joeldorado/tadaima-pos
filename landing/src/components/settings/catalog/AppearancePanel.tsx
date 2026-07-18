import { useEffect, useState } from "react";
import { Check, ExternalLink, Eye, Palette } from "lucide-react";
import { toast } from "sonner";
import { getSystemSettings, batchUpdateSystemSettings } from "@tadaima/api";
import type { CatalogBackgroundSlug, CatalogLayoutSlug, CatalogThemeSlug } from "@tadaima/api";
import {
  CATALOG_BACKGROUNDS,
  CATALOG_LAYOUTS,
  CATALOG_THEMES,
  resolveCatalogBackground,
  type CatalogTheme,
} from "@/lib/catalogThemes";
import { BackgroundPreviewStrip } from "./BackgroundPreviewStrip";
import { PanelCard, PanelLoader, SaveButton } from "./shared";
import { StorePreviewModal, previewUrl, type PreviewSelection } from "./StorePreviewModal";

const MAX_DESC = 600;

interface Props {
  canEdit: boolean;
}

/**
 * Apariencia de la tienda online: los TRES ejes que se combinan libremente
 * (color · fondo · diseño) + la descripción de marca del footer.
 *
 * Las miniaturas de fondo se pintan con los colores del tema SELECCIONADO en
 * este momento, así que Joel ve la combinación real antes de guardar en vez de
 * elegir a ciegas.
 */

/** Base oscura fija: el tema puede traer `var(--td-page-bg)`, que aquí depende del POS. */
function baseBg(theme: CatalogTheme): string {
  const pageBg = theme.vars["--cat-page-bg"] ?? "";
  return pageBg.includes("var(") ? "#0B080D" : pageBg;
}

/** Miniatura de cada fondo, ya teñida con el tema activo. */
function backgroundPreview(theme: CatalogTheme, slug: CatalogBackgroundSlug): string {
  const glow = theme.vars["--cat-glow"] ?? "rgba(224,34,26,0.4)";
  const base = baseBg(theme);

  switch (slug) {
    case "shader":
      return `radial-gradient(65% 75% at 28% 36%, ${glow} 0%, transparent 62%), radial-gradient(55% 65% at 78% 70%, ${glow} 0%, transparent 60%), ${base}`;
    case "gradient":
      return theme.gradientBg;
    case "galaxy":
      return `radial-gradient(22% 30% at 50% 50%, ${theme.galaxyColors.core} 0%, ${theme.galaxyColors.core}00 60%), radial-gradient(75% 60% at 50% 50%, ${theme.galaxyColors.edge}77 0%, transparent 72%), ${base}`;
  }
}

/** Diagrama del acomodo: bloques que insinúan header, menú y productos. */
function LayoutDiagram({ slug }: { slug: CatalogLayoutSlug }) {
  const bar = "rgba(255,255,255,0.22)";
  const tile = "rgba(255,255,255,0.13)";

  if (slug === "sidebar") {
    return (
      <div className="h-14 p-1.5 flex flex-col gap-1">
        <div className="h-2 rounded-sm" style={{ background: bar }} />
        <div className="flex-1 flex gap-1">
          <div className="w-1/4 rounded-sm" style={{ background: bar }} />
          <div className="flex-1 grid grid-cols-3 gap-1">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="rounded-sm" style={{ background: tile }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (slug === "masonry") {
    // Alturas dispares = el efecto revista.
    const heights = ["60%", "100%", "75%", "45%", "85%", "55%", "95%", "65%"];
    return (
      <div className="h-14 p-1.5 flex flex-col gap-1">
        <div className="h-2 rounded-sm" style={{ background: bar }} />
        <div className="flex-1 grid grid-cols-4 gap-1 items-start">
          {heights.map((h, i) => (
            <div key={i} className="rounded-sm" style={{ background: tile, height: h, minHeight: 4 }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-14 p-1.5 flex flex-col gap-1">
      <div className="h-2 rounded-sm" style={{ background: bar }} />
      <div className="flex-1 grid grid-cols-4 grid-rows-2 gap-1">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="rounded-sm" style={{ background: tile }} />
        ))}
      </div>
    </div>
  );
}

/** Tarjeta seleccionable compartida por los tres pickers. */
function OptionCard({
  active,
  disabled,
  onClick,
  preview,
  label,
  description,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  preview: React.ReactNode;
  label: string;
  description: string;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="text-left rounded-2xl overflow-hidden transition-all disabled:opacity-50 cursor-pointer"
      style={{
        border: `1px solid ${active ? "var(--td-red-brd)" : "rgba(255,255,255,0.08)"}`,
        boxShadow: active ? "0 0 0 1px var(--td-red-brd), 0 8px 24px rgba(224,34,26,0.15)" : "none",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div className="relative">
        {preview}
        {active && (
          <span
            className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
            style={{ background: "var(--td-red)", color: "#fff" }}
          >
            <Check size={12} />
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-[11px] font-black text-white">{label}</p>
        <p className="text-[9px] font-bold text-white/30 mt-0.5 leading-snug">{description}</p>
      </div>
    </button>
  );
}

function SectionLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">
      {children} {hint && <span className="text-white/20">{hint}</span>}
    </p>
  );
}

export function AppearancePanel({ canEdit }: Props) {
  const [theme, setTheme] = useState<CatalogThemeSlug>("tadaima");
  const [background, setBackground] = useState<CatalogBackgroundSlug | null>(null);
  const [layout, setLayout] = useState<CatalogLayoutSlug>("classic");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    getSystemSettings()
      .then((s) => {
        const raw = s["catalog_theme"];
        if (raw && raw in CATALOG_THEMES) setTheme(raw as CatalogThemeSlug);

        const bg = s["catalog_background"];
        if (bg && bg in CATALOG_BACKGROUNDS) setBackground(bg as CatalogBackgroundSlug);

        const lay = s["catalog_layout"];
        if (lay && lay in CATALOG_LAYOUTS) setLayout(lay as CatalogLayoutSlug);

        setDescription(s["catalog_description"] ?? "");
      })
      .catch(() => toast.error("Error al cargar apariencia"))
      .finally(() => setLoading(false));
  }, []);

  const activeTheme = CATALOG_THEMES[theme];
  // Nunca configurado → se muestra marcado el que hereda del tema, para que la
  // selección refleje lo que el cliente realmente está viendo.
  const activeBackground = resolveCatalogBackground(background, activeTheme);

  /** Lo que se está viendo AHORA en el panel — lo que abre el preview. */
  const selection: PreviewSelection = { theme, background: activeBackground, layout };

  const save = async () => {
    setSaving(true);
    try {
      await batchUpdateSystemSettings({
        catalog_theme: theme,
        catalog_background: activeBackground,
        catalog_layout: layout,
        catalog_description: description.trim().slice(0, MAX_DESC),
      });
      toast.success(
        `${activeTheme.label} · ${CATALOG_BACKGROUNDS[activeBackground].label} · ${CATALOG_LAYOUTS[layout].label}`
      );
    } catch {
      toast.error("Error al guardar apariencia");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PanelCard
      icon={<Palette size={20} />}
      iconColor="#FFB020"
      title="Apariencia"
      subtitle="Color · fondo · diseño de la tienda online — se combinan libremente"
    >
      {loading ? (
        <PanelLoader />
      ) : (
        <div className="space-y-7">
          <div>
            <SectionLabel hint="(la paleta de toda la tienda)">Color</SectionLabel>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.values(CATALOG_THEMES).map((t) => (
                <OptionCard
                  key={t.slug}
                  active={theme === t.slug}
                  disabled={!canEdit}
                  onClick={() => setTheme(t.slug)}
                  label={t.label}
                  description={t.description}
                  preview={
                    <div className="h-14" style={{ background: baseBg(t) }}>
                      <div
                        className="absolute bottom-0 left-0 right-0 h-2.5"
                        style={{ background: t.vars["--cat-accent-g"] }}
                      />
                    </div>
                  }
                />
              ))}
            </div>
          </div>

          <div>
            <SectionLabel hint="(en el color que elegiste arriba)">Fondo</SectionLabel>
            <div className="grid grid-cols-3 gap-3">
              {Object.values(CATALOG_BACKGROUNDS).map((b) => (
                <OptionCard
                  key={b.slug}
                  active={activeBackground === b.slug}
                  disabled={!canEdit}
                  onClick={() => setBackground(b.slug)}
                  label={b.label}
                  description={b.description}
                  preview={<div className="h-14" style={{ background: backgroundPreview(activeTheme, b.slug) }} />}
                />
              ))}
            </div>

            {/* El efecto real, en el color real, antes de guardar nada. */}
            <div className="mt-3">
              <BackgroundPreviewStrip
                theme={activeTheme}
                background={activeBackground}
                base={baseBg(activeTheme)}
              />
            </div>
          </div>

          <div>
            <SectionLabel hint="(cómo se acomodan los productos)">Diseño</SectionLabel>
            <div className="grid grid-cols-3 gap-3">
              {Object.values(CATALOG_LAYOUTS).map((l) => (
                <OptionCard
                  key={l.slug}
                  active={layout === l.slug}
                  disabled={!canEdit}
                  onClick={() => setLayout(l.slug)}
                  label={l.label}
                  description={l.description}
                  preview={
                    <div style={{ background: "rgba(255,255,255,0.03)" }}>
                      <LayoutDiagram slug={l.slug} />
                    </div>
                  }
                />
              ))}
            </div>
          </div>

          <div>
            <SectionLabel hint="(footer del catálogo)">Descripción de la tienda</SectionLabel>
            <textarea
              value={description}
              disabled={!canEdit}
              maxLength={MAX_DESC}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Tu tienda de mangas, coleccionables y electrónica en Tijuana. Preventas, promos y envíos…"
              rows={3}
              className="w-full px-4 py-3 rounded-xl outline-none border border-white/5 bg-white/[0.03] font-bold text-sm text-white placeholder:text-white/15 focus:border-white/20 transition-all resize-none disabled:opacity-50"
            />
            <p className="text-[9px] font-bold text-white/20 mt-1 text-right">
              {description.length}/{MAX_DESC}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <SaveButton saving={saving} disabled={!canEdit} onClick={save} label="Guardar Apariencia" />

            <button
              onClick={() => setPreviewing(true)}
              className="inline-flex items-center gap-2 px-5 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white border border-white/10 hover:border-white/25 transition-colors cursor-pointer"
            >
              <Eye size={13} />
              Ver preview
            </button>

            <a
              // Lleva la selección actual: abre lo que estás viendo aquí,
              // aunque todavía no lo guardes.
              href={previewUrl(selection)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 transition-colors"
            >
              <ExternalLink size={12} />
              Abrir tienda
            </a>
          </div>
        </div>
      )}

      {previewing && <StorePreviewModal selection={selection} onClose={() => setPreviewing(false)} />}
    </PanelCard>
  );
}
