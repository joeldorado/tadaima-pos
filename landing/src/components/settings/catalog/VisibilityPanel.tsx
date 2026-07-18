import { useEffect, useState } from "react";
import {
  Globe, Eye, EyeOff, CheckCircle2, AlertCircle, Search as SearchIcon, Tags,
  FileText, ShoppingCart, PackageX, MapPin, Phone, Store as StoreIcon, ListOrdered,
} from "lucide-react";
import { toast } from "sonner";
import { getSystemSettings, batchUpdateSystemSettings } from "@tadaima/api";
import type { CatalogSortDefault } from "@tadaima/api";
import { PanelCard, PanelLoader, SaveButton } from "./shared";

type FlagKey =
  | "show_price" | "show_stock" | "hide_out_of_stock" | "cart_enabled"
  | "show_search" | "show_categories" | "show_description"
  | "show_stores" | "show_address" | "show_contact";

const FLAG_DEFAULTS: Record<FlagKey, boolean> = {
  show_price: true, show_stock: true, hide_out_of_stock: false, cart_enabled: true,
  show_search: true, show_categories: true, show_description: true,
  show_stores: true, show_address: true, show_contact: true,
};

const TOGGLES: { key: FlagKey; label: string; desc: string; on: typeof Eye; off: typeof Eye }[] = [
  { key: "show_price",        label: "Mostrar Precios",      desc: "Precios visibles en el catálogo",                     on: Eye,          off: EyeOff },
  { key: "show_stock",        label: "Mostrar Existencias",   desc: "Desglose de stock por sucursal + total",              on: CheckCircle2, off: AlertCircle },
  { key: "hide_out_of_stock", label: "Ocultar Agotados",      desc: "Solo aplica al catálogo por sucursal (legado)",       on: PackageX,     off: PackageX },
  { key: "cart_enabled",      label: "Carrito",               desc: "Activa el carrito; si no, pedido por producto",       on: ShoppingCart, off: ShoppingCart },
  { key: "show_search",       label: "Buscador",              desc: "Permite buscar productos",                            on: SearchIcon,   off: SearchIcon },
  { key: "show_categories",   label: "Filtro de Categorías",  desc: "Muestra el selector de categorías",                   on: Tags,         off: Tags },
  { key: "show_description",  label: "Descripciones",         desc: "Muestra la descripción del producto",                 on: FileText,     off: FileText },
  { key: "show_stores",       label: "Sucursales en Footer",  desc: "Lista de tiendas al pie del catálogo",                on: StoreIcon,    off: StoreIcon },
  { key: "show_address",      label: "Mostrar Domicilio",     desc: "Dirección de cada sucursal en el footer",             on: MapPin,       off: MapPin },
  { key: "show_contact",      label: "Datos de Contacto",     desc: "Teléfono de cada sucursal en el footer",              on: Phone,        off: Phone },
];

interface Props {
  canEdit: boolean;
}

/** Toggles de visibilidad del catálogo global + orden de entrada. */
export function VisibilityPanel({ canEdit }: Props) {
  const [flags, setFlags] = useState<Record<FlagKey, boolean>>(FLAG_DEFAULTS);
  const [defaultSort, setDefaultSort] = useState<CatalogSortDefault>("new");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSystemSettings()
      .then((s) => {
        const next = { ...FLAG_DEFAULTS };
        (Object.keys(FLAG_DEFAULTS) as FlagKey[]).forEach((k) => {
          const raw = s[`catalog_${k}`];
          if (raw != null) next[k] = raw === "true" || raw === "1";
        });
        setFlags(next);
        setDefaultSort(s["catalog_default_sort"] === "featured" ? "featured" : "new");
      })
      .catch(() => toast.error("Error al cargar configuración"))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string> = { catalog_default_sort: defaultSort };
      (Object.keys(flags) as FlagKey[]).forEach((k) => {
        payload[`catalog_${k}`] = flags[k] ? "true" : "false";
      });
      await batchUpdateSystemSettings(payload);
      toast.success("Configuración guardada");
    } catch {
      toast.error("Error al guardar configuración");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PanelCard
      icon={<Globe size={20} />}
      iconColor="#E0221A"
      title="Catálogo Online"
      subtitle="Catálogo de toda la cadena · una sola dirección pública"
    >
      <p className="text-[10px] text-white/30 mb-6 -mt-3 ml-1">
        Link público: <span className="text-emerald-500/60">/catalogo</span>. Muestra todos los productos con
        existencia, con su stock por sucursal. El catálogo de cadena siempre oculta productos sin existencia.
      </p>

      {loading ? (
        <PanelLoader />
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

            {/* Orden de entrada (Catálogo v3) */}
            <div className="flex items-center justify-between p-5 rounded-2xl bg-white/[0.02] border border-white/5">
              <div>
                <p className="text-xs font-black text-white flex items-center gap-1.5"><ListOrdered size={13} /> Orden de entrada</p>
                <p className="text-[9px] font-bold text-white/30 mt-0.5">Qué ve primero el cliente al abrir el catálogo</p>
              </div>
              <select
                value={defaultSort}
                disabled={!canEdit}
                onChange={(e) => setDefaultSort(e.target.value as CatalogSortDefault)}
                className="px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide outline-none cursor-pointer bg-white/5 border border-white/10 text-white disabled:opacity-50"
              >
                <option value="new" style={{ background: "#16090c" }}>Más nuevos</option>
                <option value="featured" style={{ background: "#16090c" }}>Destacados</option>
              </select>
            </div>
          </div>

          <SaveButton saving={saving} disabled={!canEdit} onClick={save} label="Guardar Configuración" />
        </div>
      )}
    </PanelCard>
  );
}
