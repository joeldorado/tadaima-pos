import { useState, useEffect, useRef } from "react";
import { X, Package, DollarSign, Loader2, Check, ChevronRight, Plus, Image as ImageIcon, Trash2 } from "lucide-react";
import { motion as Motion } from "motion/react";
import { toast } from "sonner";
import { getCategories, getSuppliers, getStores, createSupplier, createCategory, createPreSaleCatalog, updatePreSaleCatalog, uploadPreSaleCatalogImage, removePreSaleCatalogImage } from "@tadaima/api";
import type { ProductCategory, Supplier, PreSaleCatalog, Store } from "@tadaima/api";
import { SingleDatePicker } from "@/components/ui/SingleDatePicker";

interface Props {
  onClose: () => void;
  onSuccess: (catalog: PreSaleCatalog) => void;
  catalog?: PreSaleCatalog;
  /**
   * Gerente: solo puede asignar stock a SU tienda. Cuando está presente, el
   * tab Stock filtra el selector y las entradas a esta sucursal y oculta las
   * de otras tiendas (el backend preserva las ajenas — ver syncStoreLimits).
   * null = admin (todas las tiendas).
   */
  restrictedStoreId?: number | null;
}

type Tab = "general" | "precios" | "stock";

const TP  = "var(--td-text-hi)";
const TS  = "var(--td-text-md)";
const TM  = "var(--td-text-lo)";
const RED = "var(--td-red)";

// Días de gracia sugeridos entre la llegada del producto y el límite de retiro.
const PICKUP_DAYS_AFTER_ARRIVAL = 10;

/** Suma días a una fecha "YYYY-MM-DD" sin pasar por UTC (evita el corrimiento
 *  de un día en zonas negativas como México al usar toISOString). */
function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, (d ?? 1) + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

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

export function NewPreSaleCatalogModal({ onClose, onSuccess, catalog, restrictedStoreId = null }: Props) {
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
  // Catálogo nuevo: anticipo arranca en $100 (base típica del negocio, editable).
  const [advance, setAdvance]         = useState(
    catalog ? (catalog.advance_payment != null ? String(catalog.advance_payment) : "") : "100"
  );
  const [limit, setLimit]             = useState(catalog?.preorder_limit != null ? String(catalog.preorder_limit) : "");
  const [arrivalDate, setArrivalDate] = useState(catalog?.arrival_date ?? "");
  const [pickupDate, setPickupDate]   = useState(catalog?.pickup_deadline ?? "");
  // Último valor de retiro que ESTE form puso automáticamente. Si el usuario
  // lo cambió a mano, ya no lo pisamos al mover la fecha de llegada.
  const autoPickupRef = useRef("");

  const handleArrivalDateChange = (value: string) => {
    setArrivalDate(value);
    if (!value) return;
    // Precarga "Fecha límite de retiro" = llegada + 10 días, como base editable.
    if (pickupDate === "" || pickupDate === autoPickupRef.current) {
      const suggested = addDaysToYmd(value, PICKUP_DAYS_AFTER_ARRIVAL);
      autoPickupRef.current = suggested;
      setPickupDate(suggested);
    }
  };
  const [cost, setCost]               = useState(catalog?.cost != null ? String(catalog.cost) : "");
  const [publishNow, setPublishNow]   = useState(false);

  // Imagen: file pendiente de subir (después de save), preview del file, o URL existente del catálogo.
  // `removeExisting` true cuando el cajero quita la imagen actual en edición — se procesa al save.
  const [imageFile, setImageFile]       = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(catalog?.image_url ?? null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stock por tienda: store_limits = entradas asignadas (mapa storeId → "qty").
  // El cajero las agrega una a una con un selector + input qty.
  const [stores, setStores] = useState<Store[]>([]);
  const [storeLimits, setStoreLimits] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    (catalog?.store_limits ?? []).forEach(sl => {
      // Gerente: oculta las asignaciones de otras tiendas (no las ve ni las edita).
      if (restrictedStoreId != null && sl.store_id !== restrictedStoreId) return;
      init[sl.store_id] = String(sl.limit_qty);
    });
    return init;
  });
  // Selector "Agregar tienda": qué tienda se va a sumar a la lista
  const [pendingStoreId, setPendingStoreId] = useState<number | "">("");
  const [pendingQty, setPendingQty]         = useState("");

  // Preselecciona cuando solo hay una tienda disponible (p.ej. gerente con una sola tienda)
  useEffect(() => {
    const selectable = restrictedStoreId != null ? stores.filter(s => s.id === restrictedStoreId) : stores;
    const available = selectable.filter(s => !(s.id in storeLimits));
    if (pendingStoreId === "" && available.length === 1) setPendingStoreId(available[0]!.id);
  }, [stores, storeLimits, restrictedStoreId, pendingStoreId]);
  // Tienda en modo edición de qty (para mostrar input inline en lugar del valor)
  const [editingStoreId, setEditingStoreId] = useState<number | null>(null);
  const [editingQty, setEditingQty]         = useState("");

  // Price fields
  const [price1, setPrice1] = useState(catalog?.price_1 != null ? String(catalog.price_1) : "");
  const [price2, setPrice2] = useState(catalog?.price_2 != null ? String(catalog.price_2) : "");
  const [price3, setPrice3] = useState(catalog?.price_3 != null ? String(catalog.price_3) : "");
  const [price4, setPrice4] = useState(catalog?.price_4 != null ? String(catalog.price_4) : "");
  const [price5, setPrice5] = useState(catalog?.price_5 != null ? String(catalog.price_5) : "");

  useEffect(() => {
    Promise.all([getCategories(), getSuppliers(), getStores({ active: true })])
      .then(([cats, supps, sts]) => {
        setCategories(cats);
        setSuppliers(supps);
        setStores(sts);
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

  // Campos faltantes que impiden guardar. Se recalcula en cada render para que
  // el footer pueda mostrar al cajero exactamente qué le falta antes de hacer click,
  // y el botón se pinta de rojo solo cuando la lista queda vacía.
  const missingFields: string[] = [];
  if (!name.trim()) missingFields.push("Nombre del producto");
  if (!price1 || Number(price1) <= 0) missingFields.push("Precio Normal (P1)");
  if (arrivalDate && pickupDate && new Date(pickupDate) < new Date(arrivalDate)) {
    missingFields.push("Fecha de retiro inválida (anterior a la llegada)");
  }
  const isFormReady = missingFields.length === 0;

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Nombre del producto es requerido"); setTab("general"); return; }
    if (!price1 || Number(price1) <= 0) { toast.error("El Precio Normal (P1) es requerido"); setTab("precios"); return; }

    // La fecha límite de retiro debe ser igual o posterior a la fecha de llegada.
    if (arrivalDate && pickupDate && new Date(pickupDate) < new Date(arrivalDate)) {
      toast.error("La fecha límite de retiro no puede ser anterior a la fecha de llegada");
      setTab("general");
      return;
    }

    setSaving(true);
    try {
      // Store limits: única fuente de verdad para "dónde se vende este catálogo".
      // Sin entradas → catálogo no se vende en ninguna tienda. Sin entrada para
      // una tienda → esa tienda no vende. Ya NO hay fallback al preorder_limit
      // global (cambio Joel 2026-05-20).
      const validStoreLimits = Object.entries(storeLimits)
        .filter(([, v]) => v !== "" && !Number.isNaN(Number(v)))
        .map(([sid, v]) => ({ store_id: Number(sid), limit_qty: Math.max(0, Number(v)) }));

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
        // Enviar siempre (puede ser [] para borrar todos los límites existentes).
        store_limits:    validStoreLimits,
      };

      let result = isEdit
        ? await updatePreSaleCatalog(catalog!.id, payload)
        : await createPreSaleCatalog({ ...payload, status: publishNow ? "published" : "draft" });

      // Procesa cambios de imagen (después del save para tener el ID del catálogo).
      if (isEdit && removeExisting && !imageFile) {
        try { await removePreSaleCatalogImage(result.id); result = { ...result, image_path: null, image_url: null }; }
        catch { toast.warning("No se pudo quitar la imagen previa"); }
      }
      if (imageFile) {
        try {
          const uploaded = await uploadPreSaleCatalogImage(result.id, imageFile);
          result = { ...result, image_path: uploaded.image_path, image_url: uploaded.image_url };
        } catch {
          toast.warning("El catálogo se guardó pero no se pudo subir la imagen");
        }
      }

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
          {(["general", "precios", "stock"] as Tab[]).map(t => (
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
              {t === "general" ? "General" : t === "precios" ? "Precios" : "Stock"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
          {tab === "general" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Imagen del producto — opcional, ayuda al cajero a identificarlo en Caja */}
              <div>
                <Label>Imagen del producto</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) { toast.error("La imagen no puede pesar más de 5MB"); return; }
                    setImageFile(file);
                    setRemoveExisting(false);
                    const reader = new FileReader();
                    reader.onload = ev => setImagePreview((ev.target?.result as string) ?? null);
                    reader.readAsDataURL(file);
                  }}
                />
                {imagePreview ? (
                  <div style={{ position: "relative", width: 140, height: 140, borderRadius: 16, overflow: "hidden", border: "1px solid var(--td-input-border)", background: "var(--td-input-bg)" }}>
                    <img src={imagePreview} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" decoding="async" />
                    <div style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        title="Cambiar imagen"
                      >
                        <ImageIcon size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setImageFile(null);
                          setImagePreview(null);
                          if (isEdit && catalog?.image_url) setRemoveExisting(true);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(224,34,26,0.7)", border: "1px solid rgba(224,34,26,0.4)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        title="Quitar imagen"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{ width: 140, height: 140, borderRadius: 16, border: "1px dashed var(--td-input-border)", background: "var(--td-input-bg)", color: TM, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, fontWeight: 700 }}
                  >
                    <ImageIcon size={28} />
                    <span style={{ fontSize: 10, textTransform: "uppercase" as const, letterSpacing: "0.1em" }}>Subir imagen</span>
                    <span style={{ fontSize: 9, color: TM }}>PNG/JPG · máx 5MB</span>
                  </button>
                )}
              </div>

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
                  <SingleDatePicker
                    value={arrivalDate}
                    onChange={handleArrivalDateChange}
                    ariaLabel="Fecha de llegada"
                    placeholder="Elegir llegada"
                  />
                </div>
                <div>
                  <Label>Fecha límite de retiro</Label>
                  {/* minValue = llegada → el calendario solo deja elegir a partir
                      de que el producto llega (no antes). */}
                  <SingleDatePicker
                    value={pickupDate}
                    onChange={setPickupDate}
                    minValue={arrivalDate || undefined}
                    ariaLabel="Fecha límite de retiro"
                    placeholder="Elegir retiro"
                    disabled={!arrivalDate}
                  />
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
                    <p style={{ fontSize: 10, color: TM, margin: 0 }}>
                      {publishNow
                        ? "Se podrá vender en Caja al guardar."
                        : "Queda como borrador — NO aparecerá en Caja hasta que lo publiques."}
                    </p>
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

              {/* Niveles de negocio (Normal/Socio/Mayorista) en el primer row,
                  D/E en el segundo — mismo orden que productos y librerías. */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {[
                  { key: "Normal *",  value: price1, set: setPrice1 },
                  { key: "Socio",     value: price2, set: setPrice2 },
                  { key: "Mayorista", value: price3, set: setPrice3 },
                ].map(({ key, value, set }) => (
                  <div key={key}>
                    <Label>{key}</Label>
                    <div style={{ position: "relative" }}>
                      <DollarSign size={11} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: TM, pointerEvents: "none" }} />
                      <input
                        type="number" min="0" step="0.01"
                        value={value} onChange={e => set(e.target.value)}
                        placeholder="0.00"
                        style={{ ...inputStyle, paddingLeft: 26 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { key: "Precio D", value: price4, set: setPrice4 },
                  { key: "Precio E", value: price5, set: setPrice5 },
                ].map(({ key, value, set }) => (
                  <div key={key}>
                    <Label>{key}</Label>
                    <div style={{ position: "relative" }}>
                      <DollarSign size={11} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: TM, pointerEvents: "none" }} />
                      <input
                        type="number" min="0" step="0.01"
                        value={value} onChange={e => set(e.target.value)}
                        placeholder="0.00"
                        style={{ ...inputStyle, paddingLeft: 26 }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {advance && Number(advance) > 0 && (
                <div style={{ marginTop: 8, padding: "10px 14px", borderRadius: 14, background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "#3B82F6", margin: 0 }}>
                    Anticipo mínimo: <strong>${Number(advance).toLocaleString("es-MX")}</strong> por unidad
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === "stock" && (() => {
            // Gerente: solo puede asignar stock a su propia sucursal.
            const selectableStores = restrictedStoreId != null
              ? stores.filter(s => s.id === restrictedStoreId)
              : stores;
            // Tiendas que aún no tienen stock asignado (disponibles para agregar).
            const availableStores = selectableStores.filter(s => !(s.id in storeLimits));
            // Tiendas ya asignadas (con stock definido).
            const assignedEntries = Object.entries(storeLimits).map(([sid, qty]) => {
              const store = stores.find(s => s.id === Number(sid));
              return { storeId: Number(sid), storeName: store?.name ?? `Tienda ${sid}`, qty };
            });
            const totalUnits = assignedEntries.reduce((s, e) => s + (Number(e.qty) || 0), 0);
            const canAdd = pendingStoreId !== "" && pendingQty !== "" && Number(pendingQty) >= 0;

            const handleAdd = () => {
              if (!canAdd) return;
              setStoreLimits(prev => ({ ...prev, [Number(pendingStoreId)]: pendingQty }));
              setPendingStoreId("");
              setPendingQty("");
            };

            const handleEditSave = (sid: number) => {
              if (editingQty === "" || Number(editingQty) < 0) return;
              setStoreLimits(prev => ({ ...prev, [sid]: editingQty }));
              setEditingStoreId(null);
              setEditingQty("");
            };

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ padding: "10px 14px", borderRadius: 14, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.18)" }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "#F59E0B", margin: 0, lineHeight: 1.5 }}>
                    Agrega el stock de preventa por tienda. Tiendas sin entrada <strong>no podrán vender</strong> este catálogo. Si no asignas ninguna tienda, el catálogo <strong>no se vende en ningún lado</strong>.
                  </p>
                </div>

                {/* Selector: agregar tienda + qty */}
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}>
                    <Label>Tienda</Label>
                    <div style={{ position: "relative" }}>
                      <select
                        value={pendingStoreId}
                        onChange={e => setPendingStoreId(e.target.value === "" ? "" : Number(e.target.value))}
                        disabled={availableStores.length === 0}
                        style={{ ...inputStyle, paddingRight: 32, appearance: "none" as const, opacity: availableStores.length === 0 ? 0.5 : 1 }}
                      >
                        <option value="">{availableStores.length === 0 ? "Todas las tiendas asignadas" : "Selecciona una tienda…"}</option>
                        {availableStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <ChevronRight size={12} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%) rotate(90deg)", color: TM, pointerEvents: "none" }} />
                    </div>
                  </div>
                  <div style={{ width: 100 }}>
                    <Label>Stock</Label>
                    <input
                      type="number" min="0"
                      value={pendingQty}
                      onChange={e => setPendingQty(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleAdd()}
                      placeholder="0"
                      disabled={pendingStoreId === ""}
                      style={{ ...inputStyle, padding: "11px 12px", textAlign: "center", fontWeight: 800 }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={!canAdd}
                    style={{ padding: "11px 16px", borderRadius: 14, border: "none", background: canAdd ? RED : "var(--td-input-bg)", color: canAdd ? "#fff" : TM, fontSize: 11, fontWeight: 900, cursor: canAdd ? "pointer" : "not-allowed", textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <Plus size={13} />
                    Agregar
                  </button>
                </div>

                {/* Tabla de tiendas asignadas */}
                {assignedEntries.length === 0 ? (
                  <div style={{ padding: "24px 16px", textAlign: "center", color: "#DC2626", fontSize: 12, border: "1px dashed rgba(220,38,38,0.35)", borderRadius: 14, background: "rgba(220,38,38,0.04)" }}>
                    Sin tiendas asignadas — este catálogo <strong>no se podrá vender</strong> en ninguna tienda hasta que asignes al menos una.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {assignedEntries.map(({ storeId, storeName, qty }) => {
                      const isEditing = editingStoreId === storeId;
                      const isZero = !isEditing && qty !== "" && Number(qty) === 0;
                      // Restante por apartar (QA 2026-06-08): límite − reservados
                      // activos de esa tienda. Solo hay reservas al editar un
                      // catálogo existente (reserved_by_store viene de la API).
                      const reserved = catalog?.reserved_by_store?.[String(storeId)] ?? 0;
                      const restante = qty !== "" ? Math.max(0, Number(qty) - reserved) : null;
                      return (
                        <div key={storeId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 14, border: `1px solid ${isZero ? "rgba(220,38,38,0.3)" : "var(--td-input-border)"}`, background: "var(--td-input-bg)" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: TP }}>{storeName}</p>
                            {isZero && (
                              <p style={{ margin: "2px 0 0", fontSize: 9, color: "#DC2626", fontWeight: 700 }}>Stock 0 — no podrá vender</p>
                            )}
                            {catalog && !isZero && reserved > 0 && (
                              <p style={{ margin: "2px 0 0", fontSize: 9, fontWeight: 700, color: restante === 0 ? "#DC2626" : "#F59E0B" }}>
                                Apartados: {reserved} · Restante por apartar: {restante ?? "—"}{restante === 0 ? " — agotado" : ""}
                              </p>
                            )}
                          </div>
                          {isEditing ? (
                            <>
                              <input
                                type="number" min="0" autoFocus
                                value={editingQty}
                                onChange={e => setEditingQty(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") handleEditSave(storeId); if (e.key === "Escape") { setEditingStoreId(null); setEditingQty(""); } }}
                                style={{ width: 80, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(224,34,26,0.4)", background: "var(--td-popup-bg)", color: TP, fontSize: 13, fontWeight: 800, textAlign: "center", outline: "none" }}
                              />
                              <button
                                type="button"
                                onClick={() => handleEditSave(storeId)}
                                style={{ padding: "6px 10px", borderRadius: 8, background: "#10b981", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center" }}
                                title="Guardar"
                              >
                                <Check size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => { setEditingStoreId(null); setEditingQty(""); }}
                                style={{ padding: "6px 10px", borderRadius: 8, background: "transparent", border: "1px solid var(--td-input-border)", color: TM, cursor: "pointer", display: "flex", alignItems: "center" }}
                                title="Cancelar"
                              >
                                <X size={12} />
                              </button>
                            </>
                          ) : (
                            <>
                              <span style={{ fontSize: 14, fontWeight: 900, color: TP, minWidth: 30, textAlign: "right" }}>{qty || 0}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: TM, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>uds</span>
                              <button
                                type="button"
                                onClick={() => { setEditingStoreId(storeId); setEditingQty(qty); }}
                                style={{ padding: "6px 10px", borderRadius: 8, background: "transparent", border: "1px solid var(--td-input-border)", color: TM, cursor: "pointer", fontSize: 10, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}
                                title="Editar stock"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => setStoreLimits(prev => { const n = { ...prev }; delete n[storeId]; return n; })}
                                style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(224,34,26,0.08)", border: "1px solid rgba(224,34,26,0.3)", color: "#fca5a5", cursor: "pointer", display: "flex", alignItems: "center" }}
                                title="Quitar tienda"
                              >
                                <Trash2 size={11} />
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {assignedEntries.length > 0 && (
                  <div style={{ padding: "10px 14px", borderRadius: 14, background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)" }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "#10b981", margin: 0 }}>
                      Stock total entre tiendas: <strong>{totalUnits}</strong> unidades en <strong>{assignedEntries.length}</strong> tienda{assignedEntries.length === 1 ? "" : "s"}
                    </p>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--td-panel-border)", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
          {/* Indicador de qué falta para habilitar el guardado.
              El cajero veía el botón gris sin saber por qué — ahora se lista. */}
          {missingFields.length > 0 && (
            <div style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", lineHeight: 1.45 }}>
              Falta: {missingFields.join(" · ")}
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ flex: 1, padding: "12px 0", borderRadius: 14, border: "1px solid var(--td-panel-border)", background: "transparent", color: TS, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              title={missingFields.length > 0 ? `Falta: ${missingFields.join(", ")}` : ""}
              style={{
                flex: 2, padding: "12px 0", borderRadius: 14,
                background: isFormReady ? "linear-gradient(135deg,#CC2200,#FF4422)" : "var(--td-card-bg)",
                color: isFormReady ? "#fff" : TS,
                fontSize: 12, fontWeight: 900, cursor: saving ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                opacity: saving ? 0.7 : 1,
                border: isFormReady ? "none" : "1px solid var(--td-panel-border)",
                boxShadow: isFormReady ? "0 4px 20px rgba(204,34,0,0.35)" : "none",
              } as React.CSSProperties}
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {saving ? "Guardando…" : isEdit ? "Guardar cambios" : publishNow ? "Publicar catálogo" : "Guardar borrador"}
            </button>
          </div>
        </div>
      </Motion.div>
    </div>
  );
}
