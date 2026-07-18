import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { getSystemSettings, batchUpdateSystemSettings } from "@tadaima/api";
import type { CatalogSocials } from "@tadaima/api";
import { PanelCard, PanelLoader, SaveButton } from "./shared";

type SocialKey = keyof CatalogSocials;

const NETWORKS: { key: SocialKey; label: string; placeholder: string }[] = [
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/tadaima" },
  { key: "facebook",  label: "Facebook",  placeholder: "https://facebook.com/tadaima" },
  { key: "tiktok",    label: "TikTok",    placeholder: "https://tiktok.com/@tadaima" },
  { key: "x",         label: "X",         placeholder: "https://x.com/tadaima" },
  { key: "youtube",   label: "YouTube",   placeholder: "https://youtube.com/@tadaima" },
  { key: "discord",   label: "Discord",   placeholder: "https://discord.gg/tadaima" },
];

interface Props {
  canEdit: boolean;
}

/** URLs de redes sociales del footer — solo se pintan las configuradas. */
export function SocialsPanel({ canEdit }: Props) {
  const [urls, setUrls] = useState<Record<SocialKey, string>>({
    instagram: "", facebook: "", tiktok: "", x: "", youtube: "", discord: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSystemSettings()
      .then((s) => {
        const raw = s["catalog_socials"];
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          setUrls((prev) => {
            const next = { ...prev };
            NETWORKS.forEach(({ key }) => {
              const v = parsed[key];
              if (typeof v === "string") next[key] = v;
            });
            return next;
          });
        } catch { /* JSON corrupto → campos vacíos */ }
      })
      .catch(() => toast.error("Error al cargar redes"))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    // Validación suave: vacío o https://
    const bad = NETWORKS.find(({ key }) => {
      const v = urls[key].trim();
      return v !== "" && !v.startsWith("https://");
    });
    if (bad) {
      toast.error(`La URL de ${bad.label} debe empezar con https://`);
      return;
    }

    setSaving(true);
    try {
      const clean: Record<string, string> = {};
      NETWORKS.forEach(({ key }) => {
        const v = urls[key].trim();
        if (v) clean[key] = v;
      });
      await batchUpdateSystemSettings({ catalog_socials: JSON.stringify(clean) });
      toast.success("Redes sociales guardadas");
    } catch {
      toast.error("Error al guardar redes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PanelCard
      icon={<Share2 size={20} />}
      iconColor="#60A5FA"
      title="Redes Sociales"
      subtitle="Aparecen como botones animados en el footer del catálogo"
    >
      {loading ? (
        <PanelLoader />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {NETWORKS.map(({ key, label, placeholder }) => (
              <div key={key}>
                <p className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1">{label}</p>
                <input
                  type="url"
                  value={urls[key]}
                  disabled={!canEdit}
                  onChange={(e) => setUrls((m) => ({ ...m, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full px-4 py-2.5 rounded-xl outline-none border border-white/5 bg-white/[0.03] font-bold text-sm text-white placeholder:text-white/15 focus:border-white/20 transition-all disabled:opacity-50"
                />
              </div>
            ))}
          </div>
          <p className="text-[9px] font-bold text-white/20 ml-1">
            Deja vacías las que no uses — solo se muestran las configuradas.
          </p>

          <SaveButton saving={saving} disabled={!canEdit} onClick={save} label="Guardar Redes" />
        </div>
      )}
    </PanelCard>
  );
}
