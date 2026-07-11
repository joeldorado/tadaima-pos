import { useEffect, useState } from "react";
import {
  Globe, Save, Loader2, Eye, EyeOff, CheckCircle2, AlertCircle,
  MessageCircle, Search as SearchIcon, Tags, FileText, ShoppingCart, PackageX, Store,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@tadaima/auth";
import { isAdmin } from "@/lib/permisos";
import {
  getSystemSettings, batchUpdateSystemSettings,
  getStores, getCatalogSettings, updateCatalogSettings,
} from "@tadaima/api";
import type { Store as StoreType } from "@tadaima/api";

const GLASS: React.CSSProperties = {
  background: "var(--td-panel-bg)",
  backdropFilter: "blur(28px) saturate(160%)",
  WebkitBackdropFilter: "blur(28px) saturate(160%)",
  border: "1px solid var(--td-panel-border)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)",
};

type FlagKey =
  | "show_price" | "show_stock" | "hide_out_of_stock" | "cart_enabled"
  | "show_search" | "show_categories" | "show_description";

const FLAG_DEFAULTS: Record<FlagKey, boolean> = {
  show_price: true, show_stock: true, hide_out_of_stock: false, cart_enabled: true,
  show_search: true, show_categories: true, show_description: true,
};

const TOGGLES: { key: FlagKey; label: string; desc: string; on: typeof Eye; off: typeof Eye }[] = [
  { key: "show_price",        label: "Mostrar Precios",      desc: "Precios visibles en el catálogo",                on: Eye,          off: EyeOff },
  { key: "show_stock",        label: "Mostrar Existencias",   desc: "Desglose de stock por sucursal + total",         on: CheckCircle2, off: AlertCircle },
  { key: "hide_out_of_stock", label: "Ocultar Agotados",      desc: "Esconde productos sin stock en ninguna tienda",  on: PackageX,     off: PackageX },
  { key: "cart_enabled",      label: "Carrito",               desc: "Activa el carrito; si no, pedido por producto",  on: ShoppingCart, off: ShoppingCart },
  { key: "show_search",       label: "Buscador",              desc: "Permite buscar productos",                       on: SearchIcon,   off: SearchIcon },
  { key: "show_categories",   label: "Filtro de Categorías",  desc: "Muestra el selector de categorías",              on: Tags,         off: Tags },
  { key: "show_description",  label: "Descripciones",         desc: "Muestra la descripción del producto",            on: FileText,     off: FileText },
];

/**
 * Editor del Catálogo Online v2 (de cadena). La configuración de visibilidad es
 * GLOBAL (system_settings, keys `catalog_*`). El WhatsApp de pedidos es POR
 * SUCURSAL (`catalog_settings.whatsapp_number`, fallback al teléfono de la tienda).
 */
export function CatalogTab() {
  const { user } = useAuth();
  const canEdit = isAdmin(user?.roles) || !!user?.can_edit_catalog;

  const [flags, setFlags] = useState<Record<FlagKey, boolean>>(FLAG_DEFAULTS);
  const [loadingFlags, setLoadingFlags] = useState(true);
  const [savingFlags, setSavingFlags] = useState(false);

  const [stores, setStores] = useState<StoreType[]>([]);
  const [waByStore, setWaByStore] = useState<Record<number, string>>({});
  const [loadingStores, setLoadingStores] = useState(true);
  const [savingWa, setSavingWa] = useState(false);

  useEffect(() => {
    getSystemSettings()
      .then((s) => {
        const next = { ...FLAG_DEFAULTS };
        (Object.keys(FLAG_DEFAULTS) as FlagKey[]).forEach((k) => {
          const raw = s[`catalog_${k}`];
          if (raw != null) next[k] = raw === "true" || raw === "1";
        });
        setFlags(next);
      })
      .catch(() => toast.error("Error al cargar configuración"))
      .finally(() => setLoadingFlags(false));

    getStores({ active: true })
      .then(async (list) => {
        setStores(list);
        const settings = await Promise.all(
          list.map((st) => getCatalogSettings(st.id).catch(() => null))
        );
        const map: Record<number, string> = {};
        list.forEach((st, i) => {
          map[st.id] = settings[i]?.whatsapp_number ?? "";
        });
        setWaByStore(map);
      })
      .catch(() => toast.error("Error al cargar tiendas"))
      .finally(() => setLoadingStores(false));
  }, []);

  const saveFlags = async () => {
    setSavingFlags(true);
    try {
      const payload: Record<string, string> = {};
      (Object.keys(flags) as FlagKey[]).forEach((k) => {
        payload[`catalog_${k}`] = flags[k] ? "true" : "false";
      });
      await batchUpdateSystemSettings(payload);
      toast.success("Configuración guardada");
    } catch {
      toast.error("Error al guardar configuración");
    } finally {
      setSavingFlags(false);
    }
  };

  const saveWhatsapp = async () => {
    setSavingWa(true);
    try {
      await Promise.all(
        stores.map((st) =>
          updateCatalogSettings(st.id, { whatsapp_number: waByStore[st.id]?.trim() || null })
        )
      );
      toast.success("WhatsApp por sucursal guardado");
    } catch {
      toast.error("Error al guardar WhatsApp");
    } finally {
      setSavingWa(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Configuración global ──────────────────────────────────────────── */}
      <div className="p-8 rounded-[32px]" style={GLASS}>
        <div className="flex items-center gap-4 mb-2">
          <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#E0221A]">
            <Globe size={20} />
          </div>
          <div>
            <h2 className="text-base font-black text-white uppercase tracking-[0.1em]">Catálogo Online</h2>
            <p className="text-[9px] font-black uppercase text-white/20 tracking-widest mt-0.5">
              Catálogo de toda la cadena · una sola dirección pública
            </p>
          </div>
        </div>
        <p className="text-[10px] text-white/30 mb-6 ml-1">
          Link público: <span className="text-emerald-500/60">/catalogo</span>. Muestra todos los productos con
          existencia, con su stock por sucursal.
        </p>

        {loadingFlags ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-white/20" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {TOGGLES.map(({ key, label, desc, on: IconOn, off: IconOff }) => {
                const active = flags[key];
                return (
                  <div key={key} className="flex items-center justify-between p-5 rounded-2xl bg-white/[0.02] border border-white/5">
                    <div>
                      <p className="text-xs font-black text-white">{label}</p>
                      <p className="text-[9px] font-bold text-white/30 mt-0.5">{desc}</p>
                    </div>
                    <button
                      disabled={!canEdit}
                      onClick={() => setFlags((f) => ({ ...f, [key]: !f[key] }))}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all disabled:opacity-50 ${
                        active ? "bg-[#E0221A] text-white" : "bg-white/5 text-white/20"
                      }`}
                    >
                      {active ? <IconOn size={17} /> : <IconOff size={17} />}
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              onClick={saveFlags}
              disabled={!canEdit || savingFlags}
              className="flex items-center gap-3 px-8 py-3.5 rounded-2xl font-black uppercase tracking-widest text-[10px] text-white transition-all disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #BB1100 0%, #E0221A 100%)", boxShadow: "0 0 24px rgba(224,34,26,0.25)" }}
            >
              {savingFlags ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Guardar Configuración
            </button>
          </div>
        )}
      </div>

      {/* ── WhatsApp de pedidos por sucursal ──────────────────────────────── */}
      <div className="p-8 rounded-[32px]" style={GLASS}>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-emerald-400">
            <MessageCircle size={20} />
          </div>
          <div>
            <h2 className="text-base font-black text-white uppercase tracking-[0.1em]">WhatsApp de Pedidos</h2>
            <p className="text-[9px] font-black uppercase text-white/20 tracking-widest mt-0.5">
              A dónde llega el pedido de cada sucursal
            </p>
          </div>
        </div>

        {loadingStores ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-white/20" />
          </div>
        ) : (
          <div className="space-y-4">
            {stores.map((st) => (
              <div key={st.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-white/40">
                  <Store size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1 truncate">{st.name}</p>
                  <input
                    type="tel"
                    value={waByStore[st.id] ?? ""}
                    disabled={!canEdit}
                    onChange={(e) => setWaByStore((m) => ({ ...m, [st.id]: e.target.value }))}
                    placeholder={st.phone ? `Usa el tel. ${st.phone}` : "664 123 4567"}
                    className="w-full px-4 py-2.5 rounded-xl outline-none border border-white/5 bg-white/[0.03] font-bold text-sm text-white placeholder:text-white/15 focus:border-emerald-400/30 transition-all disabled:opacity-50"
                  />
                </div>
              </div>
            ))}
            <p className="text-[9px] font-bold text-white/20 ml-1">
              Si lo dejas vacío, los pedidos de esa sucursal van a su teléfono (configurado en Sucursales).
            </p>

            <button
              onClick={saveWhatsapp}
              disabled={!canEdit || savingWa}
              className="flex items-center gap-3 px-8 py-3.5 rounded-2xl font-black uppercase tracking-widest text-[10px] text-white transition-all disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #047857 0%, #10B981 100%)", boxShadow: "0 0 24px rgba(16,185,129,0.2)" }}
            >
              {savingWa ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Guardar WhatsApp
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
