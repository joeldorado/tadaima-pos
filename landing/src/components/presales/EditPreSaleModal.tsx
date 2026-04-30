import { useState, useEffect, useRef } from "react";
import {
  X, Package, DollarSign, Pencil, Loader2, Check,
  ChevronRight, Plus, Upload, Camera,
} from "lucide-react";
import { motion as Motion } from "motion/react";
import { toast } from "sonner";
import {
  getCategories, getSuppliers, createSupplier, createCategory,
  updatePreSale, getProduct, uploadProductImage, uploadPreSaleImage, storageUrl,
} from "@tadaima/api";
import type { PreSale as ApiPreSale, ProductCategory, Supplier } from "@tadaima/api";

interface Props {
  preSale: ApiPreSale;
  onClose: () => void;
  onSuccess: (updated: ApiPreSale) => void;
}

type Tab = "general" | "precios";

const TP  = "var(--td-text-hi)";
const TS  = "var(--td-text-md)";
const TM  = "var(--td-text-lo)";
const RED = "var(--td-red)";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: 16,
  border: "1px solid var(--td-input-border)",
  background: "var(--td-input-bg)",
  color: TP,
  fontSize: 13,
  fontWeight: 700,
  outline: "none",
  boxSizing: "border-box",
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: TM, display: "block", marginBottom: 6, marginLeft: 2 }}>
      {children}
    </label>
  );
}

function ListPicker({
  label, items, value, onChange, onAdd, adding,
}: {
  label: string;
  items: { id: number; name: string }[];
  value: number | "";
  onChange: (v: number | "") => void;
  onAdd: (name: string) => Promise<void>;
  adding: boolean;
}) {
  const [newName, setNewName] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await onAdd(newName.trim());
    setNewName("");
    setShowAdd(false);
  };

  return (
    <div>
      <Label>{label}</Label>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center" }}>
          <select
            value={value}
            onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))}
            style={{ ...inputStyle, paddingRight: 32, appearance: "none" as const }}
          >
            <option value="">Sin {label.toLowerCase()}</option>
            {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <ChevronRight size={13} style={{ position: "absolute", right: 12, color: TM, pointerEvents: "none" as const, transform: "rotate(90deg)" }} />
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(v => !v)}
          style={{ width: 42, height: 42, borderRadius: 14, border: "1px solid var(--td-panel-border)", background: showAdd ? "rgba(204,34,0,0.1)" : "var(--td-input-bg)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: showAdd ? RED : TM }}
        >
          <Plus size={15} />
        </button>
      </div>
      {showAdd && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            placeholder={`Nuevo ${label.toLowerCase()}…`}
            style={{ ...inputStyle, flex: 1, fontSize: 12 }}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newName.trim()}
            style={{ padding: "0 16px", borderRadius: 14, background: RED, color: "#fff", border: "none", cursor: "pointer", fontWeight: 900, fontSize: 11, display: "flex", alignItems: "center", gap: 6, opacity: adding || !newName.trim() ? 0.4 : 1 }}
          >
            {adding ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          </button>
        </div>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  live:      { label: "Abierta",   color: "#22C55E", bg: "rgba(34,197,94,0.08)" },
  paused:    { label: "Pausada",   color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  ready:     { label: "Lista",     color: "#3B82F6", bg: "rgba(59,130,246,0.1)" },
  completed: { label: "Completada",color: "#22C55E", bg: "rgba(34,197,94,0.1)" },
  expired:   { label: "Vencida",   color: "#8B5CF6", bg: "rgba(139,92,246,0.1)" },
  cancelled: { label: "Cancelada", color: TM,        bg: "rgba(255,255,255,0.05)" },
};

export function EditPreSaleModal({ preSale, onClose, onSuccess }: Props) {
  const [tab, setTab]           = useState<Tab>("general");
  const [name, setName]         = useState(preSale.product_name);
  // null means "don't touch status" (pre-sale is in a system-managed state like ready)
  const [status, setStatus]     = useState<'live' | 'paused' | null>(
    preSale.status === 'paused' ? 'paused'
    : preSale.status === 'live'  ? 'live'
    : null
  );
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [suppliers, setSuppliers]   = useState<Supplier[]>([]);
  const [categoryId, setCategoryId] = useState<number | "">(preSale.category_id ?? "");
  const [supplierId, setSupplierId] = useState<number | "">(preSale.supplier_id ?? "");
  const [addingCat, setAddingCat]   = useState(false);
  const [addingSup, setAddingSup]   = useState(false);

  const [cost, setCost]       = useState<number | "">(preSale.cost ?? "");
  const [advance, setAdvance] = useState<number | "">(preSale.advance_payment ?? "");
  const [p1, setP1]           = useState<number | "">(preSale.price_1 ?? "");
  const [p2, setP2]     = useState<number | "">(preSale.price_2 ?? "");
  const [p3, setP3]     = useState<number | "">(preSale.price_3 ?? "");
  const [p4, setP4]     = useState<number | "">(preSale.price_4 ?? "");
  const [p5, setP5]     = useState<number | "">(preSale.price_5 ?? "");

  const [saving, setSaving]           = useState(false);
  const [productImage, setProductImage] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [uploading, setUploading]       = useState(false);
  const [hoverImg, setHoverImg]         = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getCategories({ active: true }).then(setCategories).catch(() => {});
    getSuppliers({ active: true }).then(setSuppliers).catch(() => {});

    if (preSale.product_id) {
      setImageLoading(true);
      getProduct(preSale.product_id)
        .then(prod => {
          const img = prod.images?.[0];
          if (img) setProductImage(storageUrl(img.image_path));
        })
        .catch(() => {})
        .finally(() => setImageLoading(false));
    } else if (preSale.image_url) {
      setProductImage(preSale.image_url);
    }
  }, []);

  const handleAddCategory = async (n: string) => {
    setAddingCat(true);
    try {
      const cat = await createCategory({ name: n });
      setCategories(prev => [...prev, cat]);
      setCategoryId(cat.id);
      toast.success(`Categoría "${cat.name}" creada`);
    } catch { toast.error("Error al crear categoría"); }
    finally { setAddingCat(false); }
  };

  const handleAddSupplier = async (n: string) => {
    setAddingSup(true);
    try {
      const sup = await createSupplier({ name: n });
      setSuppliers(prev => [...prev, sup]);
      setSupplierId(sup.id);
      toast.success(`Proveedor "${sup.name}" creado`);
    } catch { toast.error("Error al crear proveedor"); }
    finally { setAddingSup(false); }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("El nombre es obligatorio"); return; }
    setSaving(true);
    try {
      const updated = await updatePreSale(preSale.id, {
        product_name:    name.trim(),
        ...(status !== null ? { status } : {}),
        category_id:     categoryId !== "" ? Number(categoryId) : undefined,
        supplier_id:     supplierId !== "" ? Number(supplierId) : undefined,
        advance_payment: advance !== "" ? Number(advance) : undefined,
        cost:            cost !== "" ? Number(cost) : undefined,
        price_1:         p1 !== "" ? Number(p1) : undefined,
        price_2:      p2 !== "" ? Number(p2) : undefined,
        price_3:      p3 !== "" ? Number(p3) : undefined,
        price_4:      p4 !== "" ? Number(p4) : undefined,
        price_5:      p5 !== "" ? Number(p5) : undefined,
      });
      toast.success("Preventa actualizada");
      onSuccess(updated);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      const result = preSale.product_id
        ? await uploadProductImage(preSale.product_id, file)
        : await uploadPreSaleImage(preSale.id, file);
      setProductImage(result.url);
      toast.success("Foto actualizada");
    } catch {
      toast.error("No se pudo subir la foto");
    } finally {
      setUploading(false);
    }
  };

  const numField = (
    label: string,
    value: number | "",
    set: (v: number | "") => void,
    accent?: string,
  ) => (
    <div>
      <Label>{label}</Label>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <span style={{ position: "absolute", left: 13, fontSize: 12, fontWeight: 900, color: accent ?? TM, pointerEvents: "none" as const }}>$</span>
        <input
          type="number" min={0} step={0.01}
          value={value}
          onChange={e => set(e.target.value === "" ? "" : parseFloat(e.target.value))}
          placeholder="0.00"
          style={{ ...inputStyle, paddingLeft: 26, color: accent && value !== "" ? accent : TP }}
        />
      </div>
    </div>
  );

  const statusBadge = STATUS_LABEL[status ?? preSale.status] ?? STATUS_LABEL.live;
  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "general", label: "General", icon: Package },
    { id: "precios", label: "Precios", icon: DollarSign },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={onClose} />

      <Motion.div
        initial={{ scale: 0.93, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 300 }}
        className="relative w-full max-w-2xl rounded-[32px] overflow-hidden flex flex-col shadow-2xl"
        style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)", maxHeight: "90vh" }}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px 14px", borderBottom: "1px solid var(--td-divider)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 14, background: "rgba(204,34,0,0.1)", border: "1px solid rgba(204,34,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Pencil size={16} color={RED} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 900, color: TP, margin: 0 }}>Editar Preventa</h2>
                  <span style={{ padding: "2px 10px", borderRadius: 99, fontSize: 9, fontWeight: 900, background: statusBadge.bg, color: statusBadge.color }}>
                    {statusBadge.label}
                  </span>
                </div>
                <p style={{ fontSize: 11, color: TM, margin: "3px 0 0", fontFamily: "monospace", fontWeight: 700 }}>
                  {preSale.code}
                </p>
              </div>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid var(--td-panel-border)", cursor: "pointer", color: TM, flexShrink: 0 }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", padding: "0 24px", gap: 2, borderBottom: "1px solid var(--td-divider)", flexShrink: 0 }}>
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button key={id} onClick={() => setTab(id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", fontSize: 12, fontWeight: 800, borderRadius: "12px 12px 0 0", cursor: "pointer", background: active ? "var(--td-card-bg)" : "transparent", border: "none", borderBottom: `2px solid ${active ? RED : "transparent"}`, color: active ? TP : TM, transition: "all 0.18s" }}>
                <Icon size={13} />{label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

          {/* GENERAL */}
          {tab === "general" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

              {/* Foto + Nombre */}
              <div style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>

                {/* Image slot */}
                <div
                  onClick={() => !uploading && fileInputRef.current?.click()}
                  onMouseEnter={() => setHoverImg(true)}
                  onMouseLeave={() => setHoverImg(false)}
                  style={{
                    width: 100, height: 100, borderRadius: 18, flexShrink: 0,
                    position: "relative", overflow: "hidden",
                    border: "2px dashed rgba(99,102,241,0.35)",
                    background: "rgba(255,255,255,0.03)",
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "border-color 0.18s",
                  }}
                >
                  {imageLoading ? (
                    <Loader2 size={20} style={{ color: TM }} className="animate-spin" />
                  ) : productImage ? (
                    <>
                      <img
                        src={productImage} alt=""
                        onError={() => setProductImage(null)}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                      />
                      {/* Hover / uploading overlay */}
                      <div style={{
                        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center", gap: 4,
                        background: "rgba(0,0,0,0.58)",
                        opacity: hoverImg || uploading ? 1 : 0,
                        transition: "opacity 0.18s",
                      }}>
                        {uploading
                          ? <Loader2 size={20} className="animate-spin" style={{ color: "#fff" }} />
                          : <Camera size={20} style={{ color: "#fff" }} />}
                        {!uploading && <span style={{ fontSize: 8, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "#fff" }}>Cambiar</span>}
                      </div>
                    </>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                      color: hoverImg ? "rgba(99,102,241,0.8)" : "rgba(99,102,241,0.4)",
                      transition: "color 0.18s",
                    }}>
                      {uploading
                        ? <Loader2 size={18} className="animate-spin" />
                        : <Upload size={18} />}
                      <span style={{ fontSize: 8, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.1em", textAlign: "center", lineHeight: 1.3 }}>
                        Subir foto
                      </span>
                    </div>
                  )}

                  <input
                    ref={fileInputRef} type="file" accept="image/*"
                    style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
                  />
                </div>

                {/* Name field */}
                <div style={{ flex: 1 }}>
                  <Label>Nombre del Producto *</Label>
                  <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
                </div>
              </div>

              <div>
                <Label>Estado de venta</Label>
                <div style={{ display: "flex", gap: 0, borderRadius: 14, overflow: "hidden", border: "1px solid var(--td-input-border)", background: "var(--td-input-bg)" }}>
                  {([
                    { value: "live"   as const, label: "Abierta",  desc: "se puede vender",     color: "#22C55E", bg: "rgba(34,197,94,0.15)"  },
                    { value: "paused" as const, label: "Pausada",  desc: "no se puede vender",  color: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
                  ]).map((opt, i) => {
                    const active = status === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setStatus(opt.value)}
                        style={{
                          flex: 1, padding: "11px 0", border: "none",
                          borderLeft: i > 0 ? "1px solid var(--td-input-border)" : "none",
                          background: active ? opt.bg : "transparent",
                          color: active ? opt.color : TS,
                          fontSize: 12, fontWeight: 900, cursor: "pointer",
                          transition: "all 0.15s", lineHeight: 1.3,
                        }}
                      >
                        <span style={{ display: "block" }}>{opt.label}</span>
                        <span style={{ display: "block", fontSize: 9, fontWeight: 600, marginTop: 2, opacity: active ? 0.85 : 0.55 }}>{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
                {status === null && (
                  <p style={{ fontSize: 9, color: TM, marginTop: 5, fontWeight: 600 }}>
                    Esta preventa está en estado "{preSale.status}" — selecciona Abierta o Pausada para cambiarlo
                  </p>
                )}
              </div>

              <ListPicker
                label="Categoría"
                items={categories}
                value={categoryId}
                onChange={setCategoryId}
                onAdd={handleAddCategory}
                adding={addingCat}
              />

              <ListPicker
                label="Proveedor"
                items={suppliers}
                value={supplierId}
                onChange={setSupplierId}
                onAdd={handleAddSupplier}
                adding={addingSup}
              />

              {/* Resumen de info de esta preventa */}
              <div style={{ padding: "14px 16px", borderRadius: 16, background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {[
                  { label: "Código",    value: preSale.code },
                  { label: "Reservado", value: `${preSale.reserved_quantity} uds.` },
                  { label: "Anticipo",  value: advance !== "" ? `$${Number(advance).toLocaleString("es-MX")}` : "—" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: TM, margin: "0 0 2px" }}>{label}</p>
                    <p style={{ fontSize: 12, fontWeight: 800, color: TP, margin: 0, fontFamily: "monospace" }}>{value}</p>
                  </div>
                ))}
              </div>

              <button onClick={() => setTab("precios")} style={{ alignSelf: "flex-end", display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 16, fontSize: 11, fontWeight: 800, background: "var(--td-card-bg)", border: "1px solid var(--td-panel-border)", color: TS, cursor: "pointer" }}>
                Ver Precios <ChevronRight size={13} />
              </button>
            </div>
          )}

          {/* PRECIOS */}
          {tab === "precios" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ padding: "16px 18px", borderRadius: 18, background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)" }}>
                <p style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: TM, marginBottom: 12 }}>Costo Real</p>
                {numField("Costo de adquisición (MXN)", cost, setCost)}
              </div>

              <div style={{ padding: "16px 18px", borderRadius: 18, background: "rgba(224,34,26,0.04)", border: "1px solid rgba(224,34,26,0.18)" }}>
                <p style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: RED, marginBottom: 12 }}>Anticipo</p>
                {numField("Anticipo mínimo por cliente (MXN)", advance, setAdvance, RED)}
                <p style={{ fontSize: 9, color: TM, marginTop: 6, fontWeight: 600 }}>Monto que cada cliente debe pagar al apartar</p>
              </div>

              <div style={{ padding: "16px 18px", borderRadius: 18, background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)" }}>
                <p style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: TM, marginBottom: 12 }}>Precios de Venta</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  {numField("Precio A (Principal)", p1, setP1, RED)}
                  {numField("Precio B", p2, setP2)}
                  {numField("Precio C", p3, setP3)}
                  {numField("Precio D", p4, setP4)}
                  {numField("Precio E", p5, setP5)}
                </div>
                {cost !== "" && p1 !== "" && Number(cost) > 0 && Number(p1) > 0 && (
                  <p style={{ fontSize: 10, color: TS, marginTop: 10, fontWeight: 700 }}>
                    Margen A: {(((Number(p1) - Number(cost)) / Number(cost)) * 100).toFixed(1)}%
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--td-divider)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, background: "var(--td-panel-bg)" }}>
          <div />
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 99, fontWeight: 800, fontSize: 12, background: "transparent", border: "1px solid var(--td-panel-border)", color: TS, cursor: "pointer" }}>
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 28px", borderRadius: 99, fontWeight: 900, fontSize: 12, background: "linear-gradient(135deg,#CC2200 0%,#FF4422 100%)", border: "1px solid rgba(255,120,90,0.3)", boxShadow: name.trim() ? "0 0 28px rgba(204,34,0,0.35),0 6px 18px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,180,160,0.2)" : "none", color: "#fff", cursor: name.trim() ? "pointer" : "not-allowed", opacity: saving || !name.trim() ? 0.4 : 1, transition: "all 0.18s" }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? "Guardando…" : "Guardar Cambios"}
            </button>
          </div>
        </div>
      </Motion.div>
    </div>
  );
}
