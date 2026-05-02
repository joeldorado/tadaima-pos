import { useState, useEffect, useRef } from "react";
import {
  X, Loader2, Check, Package, DollarSign, Warehouse,
  Scan, Upload, Camera, Plus, Pencil,
} from "lucide-react";
import { motion as Motion } from "motion/react";
import { toast } from "sonner";
import {
  createProductFromPreSale, updateProduct, uploadProductImage,
  getWarehouses, getInventory, updateInventory, getProduct, getCategories,
  storageUrl,
} from "@tadaima/api";
import type {
  PreSale as ApiPreSale,
  Warehouse as ApiWarehouse,
  ProductCategory,
} from "@tadaima/api";

interface Props {
  preSale: ApiPreSale;
  onClose: () => void;
  onSuccess: (productId: number, updatedPreSale?: ApiPreSale) => void;
}

interface WQty { warehouse_id: number; quantity: number }

type Tab = "general" | "precios" | "stock";

const T = {
  input: {
    background: "var(--td-input-bg)",
    border: "1px solid var(--td-input-border)",
    color: "var(--td-input-text)",
    borderRadius: 16,
    padding: "10px 14px",
    outline: "none",
    width: "100%",
    fontSize: 13,
    fontWeight: 700,
  } as React.CSSProperties,
  label: { fontSize: 9, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: "var(--td-text-lo)" },
};

function Label({ children }: { children: React.ReactNode }) {
  return <label style={T.label}>{children}</label>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function MoneyInput({ value, onChange, label, accent }: {
  value: number | ""; onChange: (v: number | "") => void;
  label: string; accent?: boolean;
}) {
  return (
    <Field label={label}>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: accent ? "#818cf8" : "var(--td-text-lo)", fontWeight: 900 }}>$</span>
        <input
          type="number" min={0} step={0.01}
          value={value}
          onChange={e => onChange(e.target.value === "" ? "" : parseFloat(e.target.value))}
          placeholder="0.00"
          style={{ ...T.input, paddingLeft: 26, borderColor: accent ? "rgba(99,102,241,0.35)" : undefined }}
        />
      </div>
    </Field>
  );
}

export function ProductFormModal({ preSale, onClose, onSuccess }: Props) {
  const isEdit = !!preSale.product_id;

  const [tab, setTab]                     = useState<Tab>("general");
  const [name, setName]                   = useState(preSale.product_name);
  const [sku, setSku]                     = useState("");
  const [barcode, setBarcode]             = useState("");
  const [categoryId, setCategoryId]       = useState<number | "">(preSale.category_id ?? "");
  const [cost, setCost]                   = useState<number | "">(preSale.cost ?? "");
  const [p1, setP1]                       = useState<number | "">(preSale.price_1 ?? "");
  const [p2, setP2]                       = useState<number | "">(preSale.price_2 ?? "");
  const [p3, setP3]                       = useState<number | "">(preSale.price_3 ?? "");
  const [p4, setP4]                       = useState<number | "">(preSale.price_4 ?? "");
  const [p5, setP5]                       = useState<number | "">(preSale.price_5 ?? "");
  const [warehouseQtys, setWQtys]         = useState<WQty[]>([]);
  const [imageFile, setImageFile]         = useState<File | null>(null);
  const [imagePreview, setImagePreview]   = useState("");
  const [categories, setCategories]       = useState<ProductCategory[]>([]);
  const [warehouses, setWarehouses]       = useState<ApiWarehouse[]>([]);
  const [loadingInit, setLoadingInit]     = useState(true);
  const [saving, setSaving]               = useState(false);
  const [newCatName, setNewCatName]       = useState("");
  const [addingCat, setAddingCat]         = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loads: Promise<unknown>[] = [
      getCategories({ active: true }).then(setCategories).catch(() => {}),
      getWarehouses({ active: true }).then(whs => {
        setWarehouses(whs);
        if (!isEdit) {
          setWQtys(whs.map(w => ({ warehouse_id: w.id, quantity: 0 })));
        }
      }).catch(() => {}),
    ];

    if (isEdit && preSale.product_id) {
      const pid = preSale.product_id;
      loads.push(
        getProduct(pid).then(prod => {
          setName(prod.name);
          setSku(prod.sku);
          setBarcode(prod.barcode ?? "");
          setCategoryId(prod.category_id ?? "");
          setCost(prod.cost ?? "");
          setP1(prod.prices?.price_1 ?? "");
          setP2(prod.prices?.price_2 ?? "");
          setP3(prod.prices?.price_3 ?? "");
          setP4(prod.prices?.price_4 ?? "");
          setP5(prod.prices?.price_5 ?? "");
          const firstImage = prod.images?.[0];
          if (firstImage) setImagePreview(firstImage.url ?? storageUrl(firstImage.image_path));
        }).catch(() => toast.error("No se pudo cargar el producto")),
        getInventory({ product_id: pid }).then(items => {
          setWQtys(prev => {
            const base = prev.length
              ? prev
              : items.map(i => ({ warehouse_id: i.warehouse_id, quantity: i.quantity }));
            return base.map(wq => {
              const inv = items.find(i => i.warehouse_id === wq.warehouse_id);
              return inv ? { ...wq, quantity: inv.quantity } : wq;
            });
          });
        }).catch(() => {}),
      );
    }

    Promise.allSettled(loads).finally(() => setLoadingInit(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sync wqtys when warehouses load (edit mode — inventory loaded first then warehouses)
  useEffect(() => {
    if (!isEdit || warehouseQtys.length === 0) return;
    setWQtys(prev => {
      const merged = warehouses.map(w => {
        const existing = prev.find(q => q.warehouse_id === w.id);
        return existing ?? { warehouse_id: w.id, quantity: 0 };
      });
      return merged;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouses]);

  const setQty = (wid: number, val: number) =>
    setWQtys(prev => prev.map(q => q.warehouse_id === wid ? { ...q, quantity: Math.max(0, val) } : q));

  const totalStock = warehouseQtys.reduce((s, q) => s + q.quantity, 0);

  const handleImageChange = (file: File) => {
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleAddCategory = async () => {
    const n = newCatName.trim();
    if (!n) return;
    setAddingCat(true);
    try {
      const { createCategory } = await import("@tadaima/api");
      const cat = await createCategory({ name: n });
      setCategories(prev => [...prev, cat]);
      setCategoryId(cat.id);
      setNewCatName("");
    } catch {
      toast.error("No se pudo crear la categoría");
    } finally {
      setAddingCat(false);
    }
  };

  const handleSave = async () => {
    if (!sku.trim()) { toast.error("El SKU es obligatorio"); setTab("general"); return; }
    if (!p1 || Number(p1) <= 0) { toast.error("El Precio A es obligatorio"); setTab("precios"); return; }
    if (!isEdit && totalStock === 0) { toast.error("Asigna stock en al menos un almacén"); setTab("stock"); return; }

    setSaving(true);
    try {
      let productId: number;
      let updatedPreSale: ApiPreSale | undefined;

      if (isEdit) {
        await updateProduct(preSale.product_id!, {
          name: name.trim() || undefined,
          sku: sku.trim(),
          barcode: barcode.trim() || undefined,
          cost: cost !== "" ? Number(cost) : undefined,
          category_id: categoryId !== "" ? Number(categoryId) : null,
          prices: {
            price_1: Number(p1),
            ...(p2 !== "" ? { price_2: Number(p2) } : {}),
            ...(p3 !== "" ? { price_3: Number(p3) } : {}),
            ...(p4 !== "" ? { price_4: Number(p4) } : {}),
            ...(p5 !== "" ? { price_5: Number(p5) } : {}),
          },
        });
        await Promise.allSettled(
          warehouseQtys.map(wq =>
            updateInventory(preSale.product_id!, wq.warehouse_id, { quantity: wq.quantity })
          )
        );
        productId = preSale.product_id!;
        if (imageFile) {
          await uploadProductImage(productId, imageFile).catch(() => {
            toast.error('Cambios guardados, pero no se pudo subir la imagen.');
          });
        }
        toast.success("Producto actualizado");
      } else {
        const result = await createProductFromPreSale(preSale.id, {
          sku: sku.trim(),
          name: name.trim() || undefined,
          cost: cost !== "" ? Number(cost) : undefined,
          category_id: categoryId !== "" ? Number(categoryId) : undefined,
          price_1: Number(p1),
          ...(p2 !== "" ? { price_2: Number(p2) } : {}),
          ...(p3 !== "" ? { price_3: Number(p3) } : {}),
          ...(p4 !== "" ? { price_4: Number(p4) } : {}),
          ...(p5 !== "" ? { price_5: Number(p5) } : {}),
          warehouse_quantities: warehouseQtys.filter(q => q.quantity > 0),
        });
        productId = result.product_id;
        updatedPreSale = result.pre_sale;
        if (imageFile) {
          await uploadProductImage(productId, imageFile).catch(() => {
            toast.error('Producto creado, pero no se pudo subir la imagen.');
          });
        }
        toast.success(`Producto #${productId} dado de alta`);
      }
      onSuccess(productId, updatedPreSale);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? "Error al guardar el producto";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: typeof Package }[] = [
    { id: "general", label: "General", icon: Package },
    { id: "precios", label: "Precios",  icon: DollarSign },
    { id: "stock",   label: "Stock",    icon: Warehouse },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <Motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/85 backdrop-blur-xl"
        onClick={onClose}
      />

      <Motion.div
        initial={{ scale: 0.93, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 300 }}
        className="relative w-full max-w-lg rounded-[36px] border overflow-hidden flex flex-col shadow-2xl"
        style={{ background: "var(--td-popup-bg)", backdropFilter: "blur(40px)", borderColor: "var(--td-panel-border)", maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="px-7 py-5 border-b border-white/5 flex items-start justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)" }}>
              {isEdit ? <Pencil size={17} className="text-indigo-400" /> : <Package size={17} className="text-indigo-400" />}
            </div>
            <div>
              <h2 className="text-base font-black text-white uppercase tracking-tight">
                {isEdit ? "Editar Producto" : "Dar de Alta Producto"}
              </h2>
              <p className="text-[10px] font-bold text-white/50 mt-0.5">{preSale.product_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-7 pt-4 pb-0 flex gap-1 shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              style={{
                background: tab === t.id ? "rgba(99,102,241,0.15)" : "transparent",
                color: tab === t.id ? "#818cf8" : "var(--td-text-lo)",
                border: tab === t.id ? "1px solid rgba(99,102,241,0.25)" : "1px solid transparent",
              }}
            >
              <t.icon size={12} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        {loadingInit ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-indigo-400" />
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 px-7 py-5">

            {/* ── General ─────────────────────────────────────────────────── */}
            {tab === "general" && (
              <div className="space-y-4">
                {/* Image picker — full width banner */}
                <div
                  className="relative w-full rounded-2xl overflow-hidden cursor-pointer group"
                  style={{ height: 140, background: "var(--td-card-bg)", border: "2px dashed var(--td-card-border)" }}
                  onClick={() => fileRef.current?.click()}
                >
                  {imagePreview ? (
                    <>
                      <img
                        src={imagePreview}
                        alt=""
                        className="absolute inset-0 w-full h-full object-contain"
                        onError={() => setImagePreview("")}
                      />
                      {/* Always-visible change button */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: "rgba(0,0,0,0.6)" }}>
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(99,102,241,0.3)", border: "1px solid rgba(99,102,241,0.5)" }}>
                            <Camera size={20} className="text-indigo-300" />
                          </div>
                          <span className="text-[9px] font-black uppercase tracking-widest text-white">Cambiar foto</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/30 group-hover:text-indigo-400/60 transition-colors">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "var(--td-card-bg)" }}>
                        <Upload size={22} />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest">
                        {isEdit ? "Subir foto del producto" : "Agregar foto (opcional)"}
                      </span>
                    </div>
                  )}
                  <input
                    ref={fileRef} type="file" accept="image/*"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImageChange(f); }}
                  />
                </div>

                {/* Name */}
                <div className="space-y-3">
                  <Field label="Nombre *">
                    <input
                      type="text" value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Nombre del producto"
                      style={T.input}
                    />
                  </Field>
                </div>

                {/* SKU + barcode */}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="SKU / Código *">
                    <div className="relative">
                      <input
                        type="text" value={sku}
                        onChange={e => setSku(e.target.value.toUpperCase())}
                        placeholder="ESCANE O ESCRIBA"
                        style={{ ...T.input, paddingRight: 40, textTransform: "uppercase" }}
                      />
                      <button
                        onClick={() => setSku("SKU" + Math.floor(Math.random() * 999999).toString().padStart(6, "0"))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-white/30 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all"
                      >
                        <Scan size={15} />
                      </button>
                    </div>
                  </Field>
                  <Field label="Código de barras">
                    <input
                      type="text" value={barcode}
                      onChange={e => setBarcode(e.target.value)}
                      placeholder="Opcional"
                      style={T.input}
                    />
                  </Field>
                </div>

                {/* Category */}
                <Field label="Categoría">
                  <div className="flex gap-2">
                    <select
                      value={categoryId}
                      onChange={e => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}
                      style={{ ...T.input, flex: 1, appearance: "none" as const }}
                    >
                      <option value="">Sin categoría</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </Field>

                {/* Inline add category */}
                <div className="flex gap-2">
                  <input
                    type="text" value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAddCategory()}
                    placeholder="Nueva categoría..."
                    style={{ ...T.input, flex: 1, fontSize: 11 }}
                  />
                  <button
                    onClick={handleAddCategory}
                    disabled={!newCatName.trim() || addingCat}
                    className="flex items-center gap-1.5 px-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-30"
                    style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.2)" }}
                  >
                    {addingCat ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                    Crear
                  </button>
                </div>
              </div>
            )}

            {/* ── Precios ──────────────────────────────────────────────────── */}
            {tab === "precios" && (
              <div className="space-y-4">
                <div className="px-4 py-3 rounded-2xl border border-white/5" style={{ background: "var(--td-card-bg)" }}>
                  <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-3">Costo / Rentabilidad</p>
                  <MoneyInput label="Costo real" value={cost} onChange={setCost} />
                </div>

                <div className="space-y-3">
                  <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Precios de venta</p>
                  <MoneyInput label="Precio A (Principal) *" value={p1} onChange={setP1} accent />
                  <div className="grid grid-cols-2 gap-3">
                    <MoneyInput label="Precio B" value={p2} onChange={setP2} />
                    <MoneyInput label="Precio C" value={p3} onChange={setP3} />
                    <MoneyInput label="Precio D" value={p4} onChange={setP4} />
                    <MoneyInput label="Precio E" value={p5} onChange={setP5} />
                  </div>
                </div>
              </div>
            )}

            {/* ── Stock ────────────────────────────────────────────────────── */}
            {tab === "stock" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>
                    Stock por almacén
                  </p>
                  {totalStock > 0 && (
                    <span className="text-[10px] font-black text-indigo-400">{totalStock} uds. total</span>
                  )}
                </div>

                {warehouses.length === 0 ? (
                  <div className="py-8 text-center" style={{ color: "var(--td-text-lo)", fontSize: 12 }}>
                    No hay almacenes configurados
                  </div>
                ) : (
                  warehouses.map(wh => {
                    const wq = warehouseQtys.find(q => q.warehouse_id === wh.id);
                    const qty = wq?.quantity ?? 0;
                    return (
                      <div key={wh.id} className="flex items-center gap-4 px-4 py-3 rounded-2xl border border-white/5"
                        style={{ background: "var(--td-card-bg)" }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white/90 truncate">{wh.name}</p>
                          {wh.store && <p className="text-[9px] font-bold text-white/50">{wh.store.name}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => setQty(wh.id, qty - 1)}
                            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors text-white/50 hover:text-white"
                            style={{ background: "var(--td-card-bg)" }}
                          >−</button>
                          <input
                            type="number" min={0} value={qty}
                            onChange={e => setQty(wh.id, parseInt(e.target.value) || 0)}
                            className="w-14 text-center text-sm font-black text-white outline-none focus:border-indigo-500/40"
                            style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", borderRadius: 12, padding: "6px 4px" }}
                          />
                          <button
                            onClick={() => setQty(wh.id, qty + 1)}
                            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors text-indigo-400 hover:bg-indigo-500/20"
                            style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}
                          >+</button>
                        </div>
                      </div>
                    );
                  })
                )}

                {!isEdit && totalStock === 0 && warehouses.length > 0 && (
                  <p className="text-[10px] font-bold px-1" style={{ color: "var(--td-red-dim)" }}>
                    * Requerido — asigna stock en al menos un almacén para crear el producto.
                  </p>
                )}
              </div>
            )}

          </div>
        )}

        {/* Footer */}
        <div className="px-7 py-4 border-t border-white/5 flex gap-3 shrink-0" style={{ background: "var(--td-panel-bg)" }}>
          <button onClick={onClose}
            className="flex-1 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-white/8 text-white/50 hover:text-white/70 transition-all">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loadingInit || !sku.trim() || !p1 || Number(p1) <= 0 || (!isEdit && totalStock === 0)}
            className="flex-[2] py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-30"
            style={{ background: "linear-gradient(135deg,#4f46e5,#818cf8)", color: "#fff", border: "1px solid rgba(129,140,248,0.3)" }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving
              ? (isEdit ? "Guardando…" : "Creando…")
              : (isEdit ? "Guardar Cambios" : "Crear Producto")}
          </button>
        </div>
      </Motion.div>
    </div>
  );
}
