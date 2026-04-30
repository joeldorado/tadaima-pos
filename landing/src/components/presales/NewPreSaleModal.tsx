import { useState, useEffect, useRef } from "react";
import {
  X, Package, DollarSign, Upload, Scan,
  Plus, Loader2, Check, ChevronRight,
} from "lucide-react";
import { motion as Motion } from "motion/react";
import { toast } from "sonner";
import { getCategories, getSuppliers, createSupplier, createPreSale } from "@tadaima/api";
import type { ProductCategory, Supplier, PreSale as ApiPreSale } from "@tadaima/api";

interface Props {
  onClose: () => void;
  onSuccess: (ps: ApiPreSale) => void;
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

function generatePreviewCode(name: string): string {
  if (!name.trim()) return "PS-XXXXXX";
  const prefix = name.trim().toUpperCase().split(/\s+/).map(w => w[0]).join("").slice(0, 3).padEnd(2, "X");
  return `PS-${prefix}${Math.floor(Math.random() * 9000 + 1000)}`;
}

// Reusable picker like category/supplier row
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
          title={`Agregar ${label.toLowerCase()}`}
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

export function NewPreSaleModal({ onClose, onSuccess }: Props) {
  const [tab, setTab]             = useState<Tab>("general");
  const [name, setName]           = useState("");
  const [status, setStatus]       = useState<'live' | 'paused'>("live");
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [addingCat, setAddingCat] = useState(false);
  const [addingSup, setAddingSup] = useState(false);
  const [codePreview, setCodePreview] = useState("PS-XXXXXX");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [cost, setCost]       = useState<number | "">("");
  const [advance, setAdvance] = useState<number | "">(100);
  const [p1, setP1]           = useState<number | "">("");
  const [p2, setP2]           = useState<number | "">("");
  const [p3, setP3]           = useState<number | "">("");
  const [p4, setP4]           = useState<number | "">("");
  const [p5, setP5]           = useState<number | "">("");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCategories({ active: true }).then(setCategories).catch(() => {});
    getSuppliers({ active: true }).then(setSuppliers).catch(() => {});
  }, []);

  useEffect(() => {
    setCodePreview(name.trim() ? generatePreviewCode(name) : "PS-XXXXXX");
  }, [name]);

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleAddCategory = async (name: string) => {
    setAddingCat(true);
    try {
      // categories API is from the same package
      const { createCategory } = await import("@tadaima/api");
      const cat = await createCategory({ name });
      setCategories(prev => [...prev, cat]);
      setCategoryId(cat.id);
      toast.success(`Categoría "${cat.name}" creada`);
    } catch { toast.error("Error al crear categoría"); }
    finally { setAddingCat(false); }
  };

  const handleAddSupplier = async (name: string) => {
    setAddingSup(true);
    try {
      const sup = await createSupplier({ name });
      setSuppliers(prev => [...prev, sup]);
      setSupplierId(sup.id);
      toast.success(`Proveedor "${sup.name}" creado`);
    } catch { toast.error("Error al crear proveedor"); }
    finally { setAddingSup(false); }
  };

  const canSave = name.trim().length > 0 && p1 !== "" && Number(p1) > 0 && advance !== "" && Number(advance) >= 0;

  const handleSave = async () => {
    if (!canSave) { toast.error("Nombre, Precio A y Anticipo son obligatorios"); return; }
    setSaving(true);
    try {
      const ps = await createPreSale({
        product_name:      name.trim(),
        status,
        reserved_quantity: 1,
        category_id:       categoryId !== "" ? Number(categoryId) : undefined,
        supplier_id:       supplierId !== "" ? Number(supplierId) : undefined,
        advance_payment:   advance !== "" ? Number(advance) : undefined,
        cost:              cost !== "" ? Number(cost) : undefined,
        price_1:           p1 !== "" ? Number(p1) : undefined,
        price_2:           p2 !== "" ? Number(p2) : undefined,
        price_3:           p3 !== "" ? Number(p3) : undefined,
        price_4:           p4 !== "" ? Number(p4) : undefined,
        price_5:           p5 !== "" ? Number(p5) : undefined,
        items: [{ quantity: 1, price: p1 !== "" ? Number(p1) : 0 }],
      });
      toast.success(`Preventa ${ps.code} creada`);
      onSuccess(ps);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Error al crear la preventa");
    } finally {
      setSaving(false);
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

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "general", label: "General",  icon: Package },
    { id: "precios", label: "Precios",  icon: DollarSign },
  ];

  const generalDone = name.trim().length > 0;
  const preciosDone = p1 !== "" && Number(p1) > 0 && advance !== "" && Number(advance) >= 0;

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
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div style={{ padding: "20px 24px 14px", borderBottom: "1px solid var(--td-divider)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: TP, margin: 0 }}>Nueva Preventa</h2>
              <p style={{ fontSize: 11, color: TS, margin: "2px 0 0" }}>Alta de producto en preventa — sin inventario aún</p>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid var(--td-panel-border)", cursor: "pointer", color: TM }}>
              <X size={14} />
            </button>
          </div>
          {/* Progress */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 10 }}>
            {[{ label: "General", done: generalDone }, { label: "Precio A + Anticipo", done: preciosDone }].map(({ label, done }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: done ? RED : "transparent", border: `1px solid ${done ? RED : "var(--td-panel-border)"}`, transition: "all 0.2s" }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: done ? TS : TM }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", padding: "0 24px", gap: 2, borderBottom: "1px solid var(--td-divider)", flexShrink: 0 }}>
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button key={id} onClick={() => setTab(id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", fontSize: 12, fontWeight: 800, borderRadius: "12px 12px 0 0", cursor: "pointer", background: active ? "var(--td-card-bg)" : "transparent", border: "none", borderBottom: `2px solid ${active ? RED : "transparent"}`, color: active ? TP : TM, transition: "all 0.18s" }}>
                <Icon size={13} />
                {label}
                <span style={{ padding: "1px 5px", borderRadius: 4, fontSize: 8, fontWeight: 900, background: "rgba(224,34,26,0.12)", color: "rgb(255,80,50)" }}>req</span>
              </button>
            );
          })}
        </div>

        {/* ── Body ────────────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

          {/* GENERAL */}
          {tab === "general" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

                {/* Image */}
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{ width: 130, height: 130, borderRadius: 24, flexShrink: 0, border: `2px dashed ${imagePreview ? "transparent" : "var(--td-panel-border)"}`, background: imagePreview ? "transparent" : "var(--td-input-bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden", position: "relative" }}
                >
                  {imagePreview
                    ? <img src={imagePreview} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                    : <>
                        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--td-card-bg)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
                          <Upload size={18} style={{ color: TM }} />
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: TM, textAlign: "center" as const, lineHeight: 1.4 }}>Subir<br />Imagen</span>
                      </>
                  }
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImage} />
                </div>

                {/* Name + code */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <Label>Nombre del Producto *</Label>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Funko Pop Goku SSJ4 Chase" style={inputStyle} />
                  </div>
                  <div>
                    <Label>Código (auto-generado)</Label>
                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                      <Scan size={13} style={{ position: "absolute", left: 13, color: TM, pointerEvents: "none" as const }} />
                      <input readOnly value={codePreview} style={{ ...inputStyle, paddingLeft: 34, opacity: 0.6, cursor: "default" }} />
                    </div>
                    <p style={{ fontSize: 9, color: TM, marginTop: 4, marginLeft: 2 }}>El código real lo genera el sistema al guardar</p>
                  </div>
                </div>
              </div>

              {/* Status toggle — full width, below the image+name block */}
              <div>
                <Label>Estado inicial</Label>
                <div style={{ display: "flex", gap: 0, borderRadius: 14, overflow: "hidden", border: "1px solid var(--td-input-border)", background: "var(--td-input-bg)" }}>
                  {([
                    { value: "live"   as const, label: "Abierta",  desc: "se puede vender",    color: "#22C55E", bg: "rgba(34,197,94,0.15)"  },
                    { value: "paused" as const, label: "Pausada",  desc: "no se puede vender", color: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
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
              </div>

              {/* Category */}
              <ListPicker
                label="Categoría"
                items={categories}
                value={categoryId}
                onChange={setCategoryId}
                onAdd={handleAddCategory}
                adding={addingCat}
              />

              {/* Supplier */}
              <ListPicker
                label="Proveedor"
                items={suppliers}
                value={supplierId}
                onChange={setSupplierId}
                onAdd={handleAddSupplier}
                adding={addingSup}
              />

              <button onClick={() => setTab("precios")} style={{ alignSelf: "flex-end", display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 16, fontSize: 11, fontWeight: 800, background: "var(--td-card-bg)", border: "1px solid var(--td-panel-border)", color: TS, cursor: "pointer" }}>
                Siguiente: Precios <ChevronRight size={13} />
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
                <p style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: RED, marginBottom: 12 }}>Anticipo requerido *</p>
                {numField("Anticipo mínimo por cliente (MXN) *", advance, setAdvance, RED)}
                <p style={{ fontSize: 9, color: TM, marginTop: 6, fontWeight: 600 }}>Monto que cada cliente debe pagar al apartar</p>
              </div>

              <div style={{ padding: "16px 18px", borderRadius: 18, background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)" }}>
                <p style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: TM, marginBottom: 12 }}>Precios de Venta — Precio A requerido</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  {numField("Precio A (Principal) *", p1, setP1, RED)}
                  {numField("Precio B",  p2, setP2)}
                  {numField("Precio C",  p3, setP3)}
                  {numField("Precio D",  p4, setP4)}
                  {numField("Precio E",  p5, setP5)}
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

        {/* ── Footer ─────────────────────────────────────────────────────────── */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--td-divider)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, background: "var(--td-panel-bg)" }}>
          <div />
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 99, fontWeight: 800, fontSize: 12, background: "transparent", border: "1px solid var(--td-panel-border)", color: TS, cursor: "pointer" }}>
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !canSave}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 28px", borderRadius: 99, fontWeight: 900, fontSize: 12, background: "linear-gradient(135deg,#CC2200 0%,#FF4422 100%)", border: "1px solid rgba(255,120,90,0.3)", boxShadow: canSave ? "0 0 28px rgba(204,34,0,0.35), 0 6px 18px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,180,160,0.2)" : "none", color: "#fff", cursor: canSave ? "pointer" : "not-allowed", opacity: saving || !canSave ? 0.4 : 1, transition: "all 0.18s" }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? "Creando…" : "Guardar Preventa"}
            </button>
          </div>
        </div>
      </Motion.div>
    </div>
  );
}
