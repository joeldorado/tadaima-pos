import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import {
  X, Save, Plus, Upload, Camera, Loader2, Warehouse,
  Package, DollarSign, CheckCircle2, Globe, Check, Scan, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  createProduct, updateProduct, uploadProductImage,
  getWarehouses, updateInventory,
  getCategories, updatePreSaleCatalog,
} from "@tadaima/api";
import type { PreSaleCatalog, ProductCategory } from "@tadaima/api";

// ─── Paleta idéntica a ProductsPage ──────────────────────────────────────────
const T = {
  glass: {
    background: "var(--td-panel-bg)",
    backdropFilter: "blur(28px) saturate(160%)",
    WebkitBackdropFilter: "blur(28px) saturate(160%)",
    border: "1px solid var(--td-panel-border)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.04)",
  } as CSSProperties,
  textPrimary: "var(--td-text-hi)",
  textSecondary: "var(--td-text-md)",
  textMuted: "var(--td-text-lo)",
  redBright: "#FF4422",
  btnRed: {
    background: "linear-gradient(135deg, #CC2200 0%, #FF4422 100%)",
    borderRadius: "9999px",
    border: "1px solid rgba(255,120,90,0.3)",
    boxShadow: "0 0 28px rgba(204,34,0,0.45), 0 6px 18px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,180,160,0.25)",
    color: "#ffffff",
  } as CSSProperties,
  chipActive: {
    background: "linear-gradient(135deg, #CC2200, #FF4422)",
    border: "1px solid rgba(255,120,90,0.4)",
    boxShadow: "0 0 16px rgba(204,34,0,0.35), inset 0 1px 0 rgba(255,160,140,0.2)",
    color: "#fff",
  } as CSSProperties,
  input: {
    background: "var(--td-input-bg)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid var(--td-input-border)",
    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.08)",
    color: "var(--td-input-text)",
  } as CSSProperties,
};

// ─── Types locales ────────────────────────────────────────────────────────────
interface StockUbicacion {
  warehouseId: number;
  ubicacion: string;
  quantity: number;
}

interface FormData {
  nombre: string;
  sku: string;
  costo: number;
  precioA: number;
  precioB: number;
  precioC: number;
  precioD: number;
  precioE: number;
  categoryId: number | null;
  soloEfectivo: boolean;
  visibleCatalogo: boolean;
  stockUbicaciones: StockUbicacion[];
}

interface Props {
  catalog: PreSaleCatalog;
  onClose: () => void;
  onSuccess: (productId: number) => void;
}

export function CatalogToProductModal({ catalog, onClose, onSuccess }: Props) {
  const [formData, setFormData] = useState<FormData>({
    nombre: catalog.product_name,
    sku: "",
    costo: catalog.cost ?? 0,
    precioA: catalog.price_1 ?? 0,
    precioB: catalog.price_2 ?? 0,
    precioC: catalog.price_3 ?? 0,
    precioD: catalog.price_4 ?? 0,
    precioE: catalog.price_5 ?? 0,
    categoryId: catalog.category?.id ?? null,
    soloEfectivo: false,
    visibleCatalogo: false,
    stockUbicaciones: [],
  });

  const [activeTab, setActiveTab]       = useState<"general" | "precios" | "inventario">("general");
  const [imageFile, setImageFile]       = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>(catalog.image_path ?? "");
  const [saving, setSaving]             = useState(false);
  const [categories, setCategories]     = useState<ProductCategory[]>([]);
  const [locations, setLocations]       = useState<{ warehouseId: number; name: string; store: string; type: "central" | "store" }[]>([]);
  const [addWarehouseId, setAddWarehouseId] = useState<number | "">("");
  const [addQty, setAddQty]             = useState<number | "">("");

  useEffect(() => {
    void getCategories().then(setCategories).catch(() => {});
    void getWarehouses({ active: true })
      .then(ws => setLocations(ws.map(w => ({ warehouseId: w.id, name: w.name, store: w.store?.name ?? "", type: w.type }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const set = (patch: Partial<FormData>) => setFormData(prev => ({ ...prev, ...patch }));

  const handleAddLocation = () => {
    if (addWarehouseId === "") return;
    const loc = locations.find(l => l.warehouseId === addWarehouseId);
    if (!loc) return;
    const qty = typeof addQty === "number" ? addQty : 0;
    setFormData(prev => ({
      ...prev,
      stockUbicaciones: [...prev.stockUbicaciones, { warehouseId: loc.warehouseId, ubicacion: loc.name, quantity: qty }],
    }));
    setAddWarehouseId("");
    setAddQty("");
  };

  const handleSave = async () => {
    if (!formData.nombre.trim()) { toast.error("El nombre es requerido"); setActiveTab("general");    return; }
    if (formData.precioA <= 0)   { toast.error("Precio A es requerido");  setActiveTab("precios");    return; }
    if (formData.stockUbicaciones.length === 0) { toast.error("Agrega al menos una ubicación"); setActiveTab("inventario"); return; }

    setSaving(true);
    try {
      const product = await createProduct({
        name: formData.nombre.trim(),
        sku: formData.sku.trim(),
        cost: formData.costo || undefined,
        prices: {
          price_1: formData.precioA || undefined,
          price_2: formData.precioB || undefined,
          price_3: formData.precioC || undefined,
          price_4: formData.precioD || undefined,
          price_5: formData.precioE || undefined,
        },
      });

      await updateProduct(product.id, {
        category_id: formData.categoryId,
        allow_cash: formData.soloEfectivo ? false : undefined,
      });

      await Promise.all(
        formData.stockUbicaciones.map(loc =>
          updateInventory(product.id, loc.warehouseId, { quantity: loc.quantity })
        )
      );

      if (imageFile) {
        await uploadProductImage(product.id, imageFile).catch(() =>
          toast.warning("Producto creado pero no se pudo subir la imagen")
        );
      }

      await updatePreSaleCatalog(catalog.id, { product_id: product.id });

      toast.success(`"${product.name}" creado y vinculado`);
      onSuccess(product.id);
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? "Error al crear el producto");
    } finally {
      setSaving(false);
    }
  };

  const assigned    = formData.stockUbicaciones;
  const assignedIds = new Set(assigned.map(u => u.warehouseId));
  const available   = locations.filter(l => !assignedIds.has(l.warehouseId));

  const generalOk    = !!formData.nombre.trim();
  const preciosOk    = formData.precioA > 0;
  const inventarioOk = assigned.length > 0;
  const canSave      = generalOk && preciosOk && inventarioOk && !saving;

  const tabValid: Record<string, boolean> = { general: generalOk, precios: preciosOk, inventario: inventarioOk };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />

      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-[32px] flex flex-col shadow-2xl"
        style={T.glass}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black" style={{ color: T.textPrimary }}>Nuevo Producto</h2>
            <p className="text-xs mt-0.5" style={{ color: T.textSecondary }}>
              Desde preventa ·{" "}
              <span style={{ color: "rgba(245,158,11,0.8)" }}>{catalog.product_name}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-colors">
            <X size={20} style={{ color: T.textSecondary }} />
          </button>
        </div>

        {/* Required checklist */}
        <div className="px-6 py-2.5 flex items-center gap-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          {[
            { label: "Nombre",    done: generalOk },
            { label: "Precio A",  done: preciosOk },
            { label: "Inventario", done: inventarioOk },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-1.5">
              {item.done
                ? <CheckCircle2 size={11} style={{ color: "#4ade80" }} />
                : <div className="w-2.5 h-2.5 rounded-full border" style={{ borderColor: "rgba(255,255,255,0.18)" }} />
              }
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: item.done ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.45)",
                textDecoration: item.done ? "line-through" : "none",
              }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex px-6 pt-4 gap-4">
          {([
            { id: "general",    label: "General",    icon: Package },
            { id: "precios",    label: "Precios",    icon: DollarSign },
            { id: "inventario", label: "Inventario", icon: Warehouse },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all relative"
              style={activeTab === tab.id ? T.chipActive : { color: T.textMuted }}
            >
              <tab.icon size={14} />
              {tab.label}
              {!tabValid[tab.id] && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wide"
                  style={{ background: "rgba(224,34,26,0.18)", color: "#FF6644" }}>
                  req
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ── GENERAL ── */}
          {activeTab === "general" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row gap-6">
                {/* Image */}
                <div
                  className="w-36 h-36 rounded-[28px] overflow-hidden shrink-0 border-2 border-dashed border-white/10 flex flex-col items-center justify-center relative group transition-all hover:border-red-500/40 hover:bg-white/[0.02] shadow-inner"
                  style={{ background: "rgba(255,255,255,0.01)", aspectRatio: "1/1" }}
                >
                  {imagePreview ? (
                    <>
                      <img src={imagePreview} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                        <Camera size={24} className="text-white" />
                        <span className="text-[8px] font-black uppercase tracking-widest text-white">Cambiar</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-white/20 group-hover:text-red-500/40 transition-colors">
                      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-1">
                        <Upload size={20} />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-center">Subir<br />Imagen</span>
                    </div>
                  )}
                  <input
                    type="file" accept="image/*"
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    style={{ fontSize: 0 }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setImageFile(file);
                        setImagePreview(URL.createObjectURL(file));
                      }
                    }}
                  />
                </div>

                <div className="flex-1 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>Nombre del Producto</label>
                    <input
                      type="text" value={formData.nombre}
                      onChange={e => set({ nombre: e.target.value })}
                      className="w-full px-4 py-3 rounded-2xl outline-none" style={T.input}
                      placeholder="Ej. iPhone 15 Pro Max"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>SKU / Código</label>
                      <div className="relative group">
                        <input
                          type="text" value={formData.sku}
                          onChange={e => set({ sku: e.target.value })}
                          className="w-full pl-4 pr-12 py-3 rounded-2xl outline-none uppercase" style={T.input}
                          placeholder="ESCANEE O ESCRIBA"
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl text-white/40 hover:text-red-500 hover:bg-red-500/10 transition-all"
                          onClick={() => set({ sku: "750" + Math.floor(Math.random() * 1_000_000_000) })}
                        >
                          <Scan size={18} />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>Categoría</label>
                      <select
                        value={formData.categoryId ?? ""}
                        onChange={e => set({ categoryId: e.target.value ? Number(e.target.value) : null })}
                        className="w-full px-4 py-3 rounded-2xl outline-none appearance-none" style={T.input}
                      >
                        <option value="">Sin categoría</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>Configuración Especial</label>
                <button
                  type="button"
                  onClick={() => set({ visibleCatalogo: !formData.visibleCatalogo })}
                  className="w-full flex items-center gap-3 p-3.5 rounded-[22px] border transition-all duration-300 group"
                  style={{
                    background: formData.visibleCatalogo ? "rgba(255,50,50,0.05)" : "rgba(255,255,255,0.02)",
                    borderColor: formData.visibleCatalogo ? "rgba(255,50,50,0.3)" : "rgba(255,255,255,0.05)",
                  }}
                >
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${formData.visibleCatalogo ? "bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.4)]" : "bg-white/5 border border-white/10"}`}>
                    {formData.visibleCatalogo && <Check size={14} className="text-white" strokeWidth={4} />}
                  </div>
                  <Globe size={18} className={`transition-colors ${formData.visibleCatalogo ? "text-red-500" : "text-white/20 group-hover:text-white/40"}`} />
                  <span className={`text-sm font-bold transition-colors ${formData.visibleCatalogo ? "text-white" : "text-white/40 group-hover:text-white/60"}`}>
                    Visible en Catálogo Online
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* ── PRECIOS ── */}
          {activeTab === "precios" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-white/5 border border-white/5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1 flex items-center gap-1" style={{ color: T.redBright }}>
                    <CheckCircle2 size={10} /> Costo Real
                  </label>
                  <input
                    type="number" value={formData.costo || ""}
                    placeholder="0"
                    onChange={e => set({ costo: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-3 rounded-2xl outline-none" style={T.input}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {([
                  { label: "Precio A (Default)", key: "precioA" as const, primary: true },
                  { label: "Precio B",           key: "precioB" as const },
                  { label: "Precio C",           key: "precioC" as const },
                  { label: "Precio D",           key: "precioD" as const },
                  { label: "Precio E",           key: "precioE" as const },
                ]).map(({ label, key, primary }) => (
                  <div key={key} className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>{label}</label>
                    <input
                      type="number" value={formData[key] || ""}
                      placeholder="0"
                      onChange={e => set({ [key]: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-3 rounded-2xl outline-none font-black"
                      style={{ ...T.input, ...(primary ? { color: T.redBright } : {}) }}
                    />
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 p-4 rounded-2xl bg-white/5">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox" checked={formData.soloEfectivo}
                    onChange={e => set({ soloEfectivo: e.target.checked })}
                    className="w-4 h-4 accent-red-600"
                  />
                  <span className="text-xs font-bold" style={{ color: T.textPrimary }}>Restringir a Pago en Efectivo</span>
                </div>
              </div>
            </div>
          )}

          {/* ── INVENTARIO ── */}
          {activeTab === "inventario" && (
            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>
                Existencias por Almacén / Tienda
              </label>

              {locations.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.1)" }}>
                  <Warehouse size={28} style={{ color: "rgba(255,255,255,0.15)" }} />
                  <p className="text-xs text-center" style={{ color: T.textMuted }}>
                    No hay almacenes configurados.<br />
                    <span style={{ color: "rgba(255,255,255,0.25)" }}>Ve a <strong>Tiendas</strong> para crear uno primero.</span>
                  </p>
                </div>
              )}

              {locations.length > 0 && available.length > 0 && (
                <div className="flex gap-2 items-end p-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="flex-1">
                    <label className="text-[9px] font-black uppercase tracking-widest block mb-1.5" style={{ color: T.textMuted }}>Almacén / Tienda</label>
                    <select
                      value={addWarehouseId}
                      onChange={e => setAddWarehouseId(e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl outline-none text-sm" style={T.input}
                    >
                      <option value="">Selecciona...</option>
                      {available.map(l => (
                        <option key={l.warehouseId} value={l.warehouseId}>
                          {l.name}{l.store ? ` — ${l.store}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ width: 90 }}>
                    <label className="text-[9px] font-black uppercase tracking-widest block mb-1.5" style={{ color: T.textMuted }}>Cantidad</label>
                    <input
                      type="number" min={0}
                      value={addQty}
                      placeholder="0"
                      onChange={e => setAddQty(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0))}
                      onKeyDown={e => e.key === "Enter" && handleAddLocation()}
                      className="w-full px-3 py-2 rounded-xl outline-none text-center font-bold" style={T.input}
                    />
                  </div>
                  <button
                    onClick={handleAddLocation}
                    disabled={addWarehouseId === ""}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all"
                    style={addWarehouseId !== "" ? T.btnRed : { ...T.input, opacity: 0.4, cursor: "not-allowed" }}
                  >
                    <Plus size={13} />Agregar
                  </button>
                </div>
              )}

              {locations.length > 0 && available.length === 0 && assigned.length > 0 && (
                <p className="text-xs px-1" style={{ color: T.textMuted }}>Todos los almacenes ya están asignados.</p>
              )}

              {assigned.length === 0 && locations.length > 0 && (
                <p className="text-[11px] px-1" style={{ color: "rgba(255,100,70,0.7)" }}>
                  * Requerido — agrega al menos una ubicación con stock.
                </p>
              )}

              {assigned.map((loc, idx) => {
                const meta = locations.find(l => l.warehouseId === loc.warehouseId);
                return (
                  <div key={idx} className="flex items-center gap-3 p-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <Warehouse size={14} style={{ color: "rgba(255,255,255,0.4)" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black" style={{ color: T.textPrimary }}>{loc.ubicacion}</p>
                      {meta && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest mt-0.5 inline-block"
                          style={{
                            background: meta.type === "central" ? "rgba(100,160,255,0.12)" : "rgba(100,220,130,0.12)",
                            color: meta.type === "central" ? "#88AAFF" : "#55CC88",
                          }}>
                          {meta.type === "central" ? "Central" : "Tienda"}
                        </span>
                      )}
                    </div>
                    <input
                      type="number" min={0}
                      value={loc.quantity || ""}
                      placeholder="0"
                      onChange={e => {
                        const val = Math.max(0, parseInt(e.target.value) || 0);
                        const next = [...assigned];
                        next[idx] = { ...next[idx]!, quantity: val };
                        setFormData(prev => ({ ...prev, stockUbicaciones: next }));
                      }}
                      className="w-20 px-2 py-1.5 rounded-xl text-center outline-none font-bold text-sm" style={T.input}
                    />
                    <button
                      onClick={() => setFormData(prev => ({ ...prev, stockUbicaciones: assigned.filter((_, i) => i !== idx) }))}
                      title="Eliminar ubicación"
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/20 hover:text-red-400"
                      style={{ color: "rgba(255,255,255,0.45)", flexShrink: 0 }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-full text-sm font-bold transition-all hover:bg-white/5"
            style={{ color: T.textSecondary }}
          >
            Cancelar
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={!canSave}
            className="flex items-center gap-2 px-8 py-2.5 text-sm font-bold transition-all shadow-lg shadow-red-500/20"
            style={{ ...T.btnRed, opacity: canSave ? 1 : 0.4, cursor: canSave ? "pointer" : "not-allowed", transform: "none" }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Guardando..." : "Guardar Producto"}
          </button>
        </div>
      </div>
    </div>
  );
}
