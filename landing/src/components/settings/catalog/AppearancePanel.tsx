import { useEffect, useState } from "react";
import { Check, Palette } from "lucide-react";
import { toast } from "sonner";
import { getSystemSettings, batchUpdateSystemSettings } from "@tadaima/api";
import type { CatalogThemeSlug } from "@tadaima/api";
import { CATALOG_THEMES } from "@/lib/catalogThemes";
import { PanelCard, PanelLoader, SaveButton } from "./shared";

const MAX_DESC = 600;

interface Props {
  canEdit: boolean;
}

/** Tema de color del catálogo (6 presets, incl. festivos) + descripción de la marca. */
export function AppearancePanel({ canEdit }: Props) {
  const [theme, setTheme] = useState<CatalogThemeSlug>("tadaima");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSystemSettings()
      .then((s) => {
        const raw = s["catalog_theme"];
        if (raw && raw in CATALOG_THEMES) setTheme(raw as CatalogThemeSlug);
        setDescription(s["catalog_description"] ?? "");
      })
      .catch(() => toast.error("Error al cargar apariencia"))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await batchUpdateSystemSettings({
        catalog_theme: theme,
        catalog_description: description.trim().slice(0, MAX_DESC),
      });
      toast.success(`Tema "${CATALOG_THEMES[theme].label}" aplicado`);
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
      subtitle="Tema de color del catálogo · modos festivos · descripción"
    >
      {loading ? (
        <PanelLoader />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.values(CATALOG_THEMES).map((t) => {
              const active = theme === t.slug;
              return (
                <button
                  key={t.slug}
                  disabled={!canEdit}
                  onClick={() => setTheme(t.slug)}
                  className="text-left rounded-2xl overflow-hidden transition-all disabled:opacity-50 cursor-pointer"
                  style={{
                    border: `1px solid ${active ? "var(--td-red-brd)" : "rgba(255,255,255,0.08)"}`,
                    boxShadow: active ? "0 0 0 1px var(--td-red-brd), 0 8px 24px rgba(224,34,26,0.15)" : "none",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  {/* Swatch: fondo del tema + franja del gradiente de acento */}
                  <div className="h-14 relative" style={{ background: t.vars["--cat-page-bg"] ?? "#0b080d" }}>
                    <div className="absolute bottom-0 left-0 right-0 h-2.5" style={{ background: t.vars["--cat-accent-g"] }} />
                    {active && (
                      <span className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "var(--td-red)", color: "#fff" }}>
                        <Check size={12} />
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-[11px] font-black text-white">{t.label}</p>
                    <p className="text-[9px] font-bold text-white/30 mt-0.5 leading-snug">{t.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">
              Descripción de la tienda <span className="text-white/20">(footer del catálogo)</span>
            </p>
            <textarea
              value={description}
              disabled={!canEdit}
              maxLength={MAX_DESC}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Tu tienda de mangas, coleccionables y electrónica en Tijuana. Preventas, promos y envíos…"
              rows={3}
              className="w-full px-4 py-3 rounded-xl outline-none border border-white/5 bg-white/[0.03] font-bold text-sm text-white placeholder:text-white/15 focus:border-white/20 transition-all resize-none disabled:opacity-50"
            />
            <p className="text-[9px] font-bold text-white/20 mt-1 text-right">{description.length}/{MAX_DESC}</p>
          </div>

          <SaveButton saving={saving} disabled={!canEdit} onClick={save} label="Guardar Apariencia" />
        </div>
      )}
    </PanelCard>
  );
}
