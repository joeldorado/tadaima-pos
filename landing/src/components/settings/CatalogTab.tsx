import { useState } from "react";
import { Globe, MessageCircle, Package, Palette, Share2 } from "lucide-react";
import { useAuth } from "@tadaima/auth";
import { isAdmin } from "@/lib/permisos";
import { VisibilityPanel } from "./catalog/VisibilityPanel";
import { AppearancePanel } from "./catalog/AppearancePanel";
import { SocialsPanel } from "./catalog/SocialsPanel";
import { WhatsAppPanel } from "./catalog/WhatsAppPanel";
import { ProductFlagsPanel } from "./catalog/ProductFlagsPanel";

type SubTab = "visibility" | "appearance" | "products" | "socials" | "whatsapp";

const SUB_TABS: { id: SubTab; label: string; icon: typeof Globe }[] = [
  { id: "visibility", label: "Visibilidad", icon: Globe },
  { id: "appearance", label: "Apariencia", icon: Palette },
  { id: "products",   label: "Productos",  icon: Package },
  { id: "socials",    label: "Redes",      icon: Share2 },
  { id: "whatsapp",   label: "WhatsApp",   icon: MessageCircle },
];

/**
 * Catálogo Online (Catálogo v3) — shell con sub-tabs. Cada panel vive en
 * `settings/catalog/` y se guarda por separado:
 *  - Visibilidad: toggles globales + orden de entrada (system_settings)
 *  - Apariencia: tema de color (6 presets) + descripción (footer)
 *  - Productos: destacar / ocultar productos del catálogo público
 *  - Redes: URLs de redes sociales del footer
 *  - WhatsApp: número de pedidos por sucursal (catalog_settings)
 */
export function CatalogTab() {
  const { user } = useAuth();
  const canEdit = isAdmin(user?.roles) || !!user?.can_edit_catalog;
  const [subTab, setSubTab] = useState<SubTab>("visibility");

  return (
    <div className="space-y-6">
      {/* Barra de sub-tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {SUB_TABS.map(({ id, label, icon: Icon }) => {
          const active = subTab === id;
          return (
            <button
              key={id}
              onClick={() => setSubTab(id)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
              style={active
                ? { background: "linear-gradient(135deg, #BB1100 0%, #E0221A 100%)", color: "#fff", boxShadow: "0 0 20px rgba(224,34,26,0.25)" }
                : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)" }}
            >
              <Icon size={13} />
              {label}
            </button>
          );
        })}
      </div>

      {subTab === "visibility" && <VisibilityPanel canEdit={canEdit} />}
      {subTab === "appearance" && <AppearancePanel canEdit={canEdit} />}
      {subTab === "products" && <ProductFlagsPanel canEdit={canEdit} />}
      {subTab === "socials" && <SocialsPanel canEdit={canEdit} />}
      {subTab === "whatsapp" && <WhatsAppPanel canEdit={canEdit} />}
    </div>
  );
}
