import { useState, useEffect } from "react";
import { X, Package, DollarSign, Loader2, Check, ChevronRight, Plus } from "lucide-react";
import { motion as Motion } from "motion/react";
import { toast } from "sonner";
import { getCategories, getSuppliers, createSupplier, createCategory, createPreSaleCatalog, updatePreSaleCatalog } from "@tadaima/api";
import type { ProductCategory, Supplier, PreSaleCatalog } from "@tadaima/api";

interface Props {
  onClose: () => void;
  onSuccess: (catalog: PreSaleCatalog) => void;
  catalog?: PreSaleCatalog;
}

type Tab = "general" | "precios";

const TP  = "var(--td-text-hi)";
const TS  = "var(--td-text-md)";
const TM  = "var(--td-text-lo)";
const RED = "var(--td-red)";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px", borderRadius: 16,
  border: "1px solid var(--td-input-border)", background: "var(--td-input-bg)",
  color: TP, fontSize: 13, fontWeight: 700, outline: "none", boxSizing: "border-box",
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: TM, display: "block", marginBottom: 6, marginLeft: 2 }}>
      {children}
    </label>
  );
}

function ListPicker({ label, items, value, onChange, onAdd, adding }: {
  label: string; items: { id: number; name: string }[];
  value: number | ""; onChange: (v: number | "") => void;
  onAdd: (name: string) => Promise<void>; adding: boolean;
}) {
  const [newName, setNewName] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await onAdd(newName.trim());
    setNewName(""); setShowAdd(false);
  };

  return (
    <div>
      <Label>{label}</Label>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <select
            value={value}
            onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))}
            style={{ ...inputStyle, paddingRight: 32, appearance: "none" as const }}
          >
            <option value="">Sin {label.toLowerCase()}</option>
            {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <ChevronRight size={12} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%) rotate(90deg)", color: TM, pointerEvents: "none" }} />
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          style={{ padding: "0 14px", borderRadius: 14, border: "1px solid var(--td-input-border)", background: "var(--td-input-bg)", color: TM, cursor: "pointer", display: "flex", alignItems: "center" }}
        >
          <Plus size={13} />
        </button>
      </div>
      {showAdd && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            placeholder={`Nuevo ${label.toLowerCase()}…`}
            style={{ ...inputStyle, flex: 1, padding: "9px 12px", fontSize: 12 }}
          />
          <button
            onClick={handleAdd} disabled={adding || !newName.trim()}
            style={{ padding: "0 14px", borderRadius: 14, border: "none", background: RED, color: "#fff", cursor: "pointer", opacity: adding ? 0.6 : 1 }}
          >
            {adding ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />}
          </button>
        </div>
      )}
    </div>
  );
}

export function NewPreSaleCatalogModal({ onClose, onSuccess, catalog }: Props) {
  const isEdit = !!catalog;

  const [tab, setTab]               = useState<Tab>("general");
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [suppliers, setSuppliers]   = useState<Supplier[]>([]);
  const [addingCat, setAddingCat]   = useState(false);
  const [addingSupp, setAddingSupp] = useState(false);
  const [saving, setSaving]         = useState(false);

  // General fields — pre-filled when editing
  const [name, setName]               = useState(catalog?.product_name ?? "");
  const [categoryId, setCategoryId]   = useState<number | "">(catalog?.category?.id ?? "");
  const [supplierId, setSupplierId]   = useState<number | "">(catalog?.supplier?.id ?? "");
  const [advance, setAdvance]         = useState(catalog?.advance_payment != null ? String(catalog.advance_payment) : "");
  const [limit, setLimit]             = useState(catalog?.preorder_limit != null ? String(catalog.preorder_limit) : "");
  const [arrivalDate, setArrivalDate] = useState(catalog?.arrival_date ?? "");
  const [pickupDate, setPickupDate]   = useState(catalog?.pickup_deadline ?? "");
  const [cost, setCost]               = useState(catalog?.cost != null ? String(catalog.cost) : "");
  const [publishNow, setPublishNow]   = useState(false);

  // Price fields
  const [price1, setPrice1] = useState(catalog?.price_1 != null ? String(catalog.price_1) : "");
  const [price2, setPrice2] = useState(catalog?.price_2 != null ? String(catalog.price_2) : "");
  const [price3, setPrice3] = useState(catalog?.price_3 != null ? String(catalog.price_3) : "");
  const [price4, setPrice4] = useState(catalog?.price_4 != null ? String(catalog.price_4) : "");
  const [price5, setPrice5] = useState(catalog?.price_5 != null ? String(catalog.price_5) : "");

  useEffect(() => {
    Promise.all([getCategories(), getSuppliers()])
      .then(([cats, supps]) => {
        setCategories(cats);
        setSuppliers(supps);
      })
      .catch(() => toast.error("Error cargando datos"));
  }, []);

  const handleAddCategory = async (n: string) => {
    setAddingCat(true);
    try {
      const c = await createCategory({ name: n });
      setCategories(prev => [...prev, c]);
      setCategoryId(c.id);
      toast.success(`Categoría "${n}" creada`);
    } catch {
      toast.error("No se pudo crear la categoría");
    } finally {
      setAddingCat(false);
    }
  };

  const handleAddSupplier = async (n: string) => {
    setAddingSupp(true);
    try {
      const s = await createSupplier({ name: n });
      setSuppliers(prev => [...prev, s]);
      setSupplierId(s.id);
      toast.success(`Proveedor "${n}" creado`);
    } catch {
      toast.error("No se pudo crear el proveedor");
    } finally {
      setAddingSupp(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Nombre del producto es requerido"); setTab("general"); return; }
    if (!price1 || Number(price1) <= 0) { toast.error("El precio base (P1) es requerido"); setTab("precios"); return; }

    // La fecha límite de retiro debe ser igual o posterior a la fecha de llegada.
    if (arrivalDate && pickupDate && new Date(pickupDate) < new Date(arrivalDate)) {
      toast.error("La fecha límite de retiro no puede ser anterior a la fecha de llegada");
      setTab("general");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        product_name:    name.trim(),
        category_id:     categoryId !== "" ? Number(categoryId) : null,
        supplier_id:     supplierId !== "" ? Number(supplierId) : null,
        cost:            cost ? Number(cost) : null,
        price_1:         Number(price1),
        price_2:         price2 ? Number(price2) : null,
        price_3:         price3 ? Number(price3) : null,
        price_4:         price4 ? Number(price4) : null,
        price_5:         price5 ? Number(price5) : null,
        advance_payment: advance ? Number(advance) : null,
        preorder_limit:  limit ? Number(limit) : null,
        arrival_date:    arrivalDate || null,
        pickup_deadline: pickupDate || null,
      };

      const result = isEdit
        ? await updatePreSaleCatalog(catalog!.id, payload)
        : await createPreSaleCatalog({ ...payload, status: publishNow ? "published" : "draft" });

      toast.success(
        isEdit
          ? `Catálogo "${result.product_name}" actualizado`
          : `Catálogo "${result.product_name}" ${publishNow ? "publicado" : "guardado como borrador"}`
      );
      onSuccess(result);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "Error al guardar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const fmt = (n: string) => n ? `$${Number(n).toLocaleString("es-MX")}` : "—";

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <Motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
        style={{
          position: "relative", width: "100%", maxWidth: 520, maxHeight: "90vh",
          background: "var(--td-panel-bg)", borderRadius: "24px 24px 0 0",
          border: "1px solid var(--td-panel-border)",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.45)",
          overflow: "hidden", display: "flex", flexDirection: "column",
        }}
        className="sm:!rounded-3xl"
      >
        {/* Header */}
        <div style={{ padding: "20px 22px 16px", borderBottom: "1px solid var(--td-panel-border)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(224,34,26,0.12)", border: "1px solid rgba(224,34,26,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Package size={16} color={RED} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ color: TP, fontSize: 15, fontWeight: 900, margin: 0 }}>
              {isEdit ? "Editar Catálogo" : "Nuevo Catálogo de Preventa"}
            </h2>
            <p style={{ color: TM, fontSize: 10, margin: 0 }}>
              {isEdit ? `Editando: ${catalog!.product_name}` : "Define el producto, precios y anticipo mínimo"}
            </p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: TM, display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, padding: "12px 22px 0", flexShrink: 0 }}>
          {(["general", "precios"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "6px 16px", borderRadius: 10, fontSize: 11, fontWeight: 800, cursor: "pointer", border: "1px solid",
                background: tab === t ? RED : "transparent",
                borderColor: tab === t ? RED : "var(--td-input-border)",
                color: tab === t ? "#fff" : TM,
              }}
            >
              {t === "general" ? "General" : "Precios"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
          {tab === "general" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <Label>Nombre del producto *</Label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Figura Dragon Ball Z Edición Especial" style={inputStyle} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <ListPicker label="Categoría" items={categories} value={categoryId} onChange={setCategoryId} onAdd={handleAddCategory} adding={addingCat} />
                <ListPicker label="Proveedor"  items={suppliers}  value={supplierId} onChange={setSupplierId} onAdd={handleAddSupplier} adding={addingSupp} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <Label>Anticipo mínimo ($)</Label>
                  <input type="number" min="0" value={advance} onChange={e => setAdvance(e.target.value)} placeholder="0" style={inputStyle} />
                </div>
                <div>
                  <Label>Límite de unidades{["arrived","closed","cancelled"].includes(catalog?.status ?? "") ? " 🔒" : ""}</Label>
                  <input
                    type="number" min="1" value={limit}
                    onChange={e => setLimit(e.target.value)}
                    placeholder="Sin límite"
                    disabled={["arrived","closed","cancelled"].includes(catalog?.status ?? "")}
                    title={["arrived","closed","cancelled"].includes(catalog?.status ?? "") ? "El límite no se puede modificar después de que el producto llegó" : undefined}
                    style={{ ...inputStyle, opacity: ["arrived","closed","cancelled"].includes(catalog?.status ?? "") ? 0.45 : 1, cursor: ["arrived","closed","cancelled"].includes(catalog?.status ?? "") ? "not-allowed" : "auto" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <Label>Fecha de llegada</Label>
                  <input type="date" value={arrivalDate} onChange={e => setArrivalDate(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <Label>Fecha límite de retiro</Label>
                  <input type="date" value={pickupDate} onChange={e => setPickupDate(e.target.value)} style={inputStyle} />
                </div>
              </div>

              {!isEdit && (
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                  <div
                    onClick={() => setPublishNow(v => !v)}
                    style={{
                      width: 38, height: 22, borderRadius: 11, transition: "background 0.2s",
                      background: publishNow ? RED : "var(--td-input-border)",
                      position: "relative", cursor: "pointer", flexShrink: 0,
                    }}
                  >
                    <div style={{
                      position: "absolute", top: 3, left: publishNow ? 18 : 3,
                      width: 16, height: 16, borderRadius: "50%", background: "#fff",
                      transition: "left 0.2s",
                    }} />
                  </div>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: TP }}>Publicar ahora</span>
                    <p style={{ fontSize: 10, color: TM, margin: 0 }}>Visible para ventas en caja al guardar</p>
                  </div>
                </label>
              )}
            </div>
          )}

          {tab === "precios" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ padding: "10px 14px", borderRadius: 14, background: "rgba(224,34,26,0.06)", border: "1px solid rgba(224,34,26,0.15)" }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: TM, margin: 0 }}>
                  El cajero elige el nivel de precio al vender. <strong style={{ color: TS }}>P1 es obligatorio</strong> — los demás son opcionales.
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 52, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: cost ? TP : TM }}>Costo</span>
                </div>
                <div style={{ position: "relative", flex: 1 }}>
                  <DollarSign size={11} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: TM, pointerEvents: "none" }} />
                  <input
                    type="number" min="0" step="0.01"
                    value={cost} onChange={e => setCost(e.target.value)}
                    placeholder="Costo real del producto"
                    style={{ ...inputStyle, paddingLeft: 26 }}
                  />
                </div>
                <span style={{ fontSize: 11, color: cost ? TP : TM, width: 70, textAlign: "right", flexShrink: 0 }}>{fmt(cost)}</span>
              </div>

              <div style={{ borderTop: "1px solid var(--td-panel-border)", paddingTop: 14 }} />

              {[
                { key: "P1 (Base) *", value: price1, set: setPrice1 },
                { key: "P2",          value: price2, set: setPrice2 },
                { key: "P3",          value: price3, set: setPrice3 },
                { key: "P4",          value: price4, set: setPrice4 },
                { key: "P5",          value: price5, set: setPrice5 },
              ].map(({ key, value, set }) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 52, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 900, color: value ? TP : TM }}>{key}</span>
                  </div>
                  <div style={{ position: "relative", flex: 1 }}>
                    <DollarSign size={11} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: TM, pointerEvents: "none" }} />
                    <input
                      type="number" min="0" step="0.01"
                      value={value} onChange={e => set(e.target.value)}
                      placeholder="0.00"
                      style={{ ...inputStyle, paddingLeft: 26 }}
                    />
                  </div>
                  <span style={{ fontSize: 11, color: value ? TP : TM, width: 70, textAlign: "right", flexShrink: 0 }}>{fmt(value)}</span>
                </div>
              ))}

              {advance && Number(advance) > 0 && (
                <div style={{ marginTop: 8, padding: "10px 14px", borderRadius: 14, background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "#3B82F6", margin: 0 }}>
                    Anticipo mínimo: <strong>${Number(advance).toLocaleString("es-MX")}</strong> por unidad
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--td-panel-border)", display: "flex", gap: 10, flexShrink: 0 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px 0", borderRadius: 14, border: "1px solid var(--td-panel-border)", background: "transparent", color: TS, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 2, padding: "12px 0", borderRadius: 14,
              background: (isEdit || publishNow) ? "linear-gradient(135deg,#CC2200,#FF4422)" : "var(--td-card-bg)",
              color: (isEdit || publishNow) ? "#fff" : TS,
              fontSize: 12, fontWeight: 900, cursor: saving ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              opacity: saving ? 0.7 : 1,
              border: (isEdit || publishNow) ? "none" : "1px solid var(--td-panel-border)",
              boxShadow: (isEdit || publishNow) ? "0 4px 20px rgba(204,34,0,0.35)" : "none",
            } as React.CSSProperties}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            {saving ? "Guardando…" : isEdit ? "Guardar cambios" : publishNow ? "Publicar catálogo" : "Guardar borrador"}
          </button>
        </div>
      </Motion.div>
    </div>
  );
}
