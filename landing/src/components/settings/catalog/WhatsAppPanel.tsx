import { useEffect, useState } from "react";
import { MessageCircle, Store as StoreIcon } from "lucide-react";
import { toast } from "sonner";
import { getStores, getCatalogSettings, updateCatalogSettings } from "@tadaima/api";
import type { Store as StoreType } from "@tadaima/api";
import { PanelCard, PanelLoader, SaveButton } from "./shared";

interface Props {
  canEdit: boolean;
}

/**
 * WhatsApp de pedidos POR SUCURSAL (`catalog_settings.whatsapp_number`).
 * Precarga: sin número explícito, el teléfono del alta de la tienda es el
 * default visible (el catálogo público ya usa ese fallback).
 */
export function WhatsAppPanel({ canEdit }: Props) {
  const [stores, setStores] = useState<StoreType[]>([]);
  const [waByStore, setWaByStore] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getStores({ active: true })
      .then(async (list) => {
        setStores(list);
        const settings = await Promise.all(
          list.map((st) => getCatalogSettings(st.id).catch(() => null))
        );
        const map: Record<number, string> = {};
        list.forEach((st, i) => {
          map[st.id] = settings[i]?.whatsapp_number || st.phone || "";
        });
        setWaByStore(map);
      })
      .catch(() => toast.error("Error al cargar tiendas"))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
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
      setSaving(false);
    }
  };

  return (
    <PanelCard
      icon={<MessageCircle size={20} />}
      iconColor="#34D399"
      title="WhatsApp de Pedidos"
      subtitle="A dónde llega el pedido de cada sucursal"
    >
      {loading ? (
        <PanelLoader />
      ) : (
        <div className="space-y-4">
          {stores.map((st) => (
            <div key={st.id} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-white/40">
                <StoreIcon size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1 truncate">{st.name}</p>
                <input
                  type="tel"
                  value={waByStore[st.id] ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => setWaByStore((m) => ({ ...m, [st.id]: e.target.value }))}
                  placeholder="664 123 4567 — sin número la tienda NO recibe pedidos"
                  className="w-full px-4 py-2.5 rounded-xl outline-none border border-white/5 bg-white/[0.03] font-bold text-sm text-white placeholder:text-white/15 focus:border-emerald-400/30 transition-all disabled:opacity-50"
                />
              </div>
            </div>
          ))}
          <p className="text-[9px] font-bold text-white/20 ml-1">
            Si lo dejas vacío, los pedidos de esa sucursal van a su teléfono (configurado en Sucursales).
          </p>

          <SaveButton saving={saving} disabled={!canEdit} onClick={save} label="Guardar WhatsApp" tone="green" />
        </div>
      )}
    </PanelCard>
  );
}
