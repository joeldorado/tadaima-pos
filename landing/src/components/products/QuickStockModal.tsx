import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Plus, Trash2, Check, ChevronRight, Boxes, Lock } from "lucide-react";
import { motion as Motion } from "motion/react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getInventory, updateInventory, getMangaInventory, updateMangaInventory, getWarehouses } from "@tadaima/api";
import type { Warehouse, InventoryItem, MangaInventoryItem } from "@tadaima/api";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@tadaima/auth";
import { isAdmin as isAdminRole } from "@/lib/permisos";

interface Props {
  productId: number;
  productName: string;
  /** "product" (default) usa /inventory · "manga" usa /manga-inventory */
  kind?: "product" | "manga";
  onClose: () => void;
}

const TP  = "var(--td-text-hi)";
const TS  = "var(--td-text-md)";
const TM  = "var(--td-text-lo)";
const RED = "var(--td-red)";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px", borderRadius: 14,
  border: "1px solid var(--td-input-border)", background: "var(--td-input-bg)",
  color: TP, fontSize: 13, fontWeight: 700, outline: "none", boxSizing: "border-box",
};

/**
 * Modal rápido para editar stock por tienda de un producto.
 *
 * Lista las tiendas que ya tienen inventario para este producto, cada una con
 * input de qty editable. Selector para agregar otra tienda (filtra las que ya
 * están). Al guardar hace un PUT por cada cambio (delta vs estado inicial)
 * y registra movimientos de ajuste en el backend.
 */
export function QuickStockModal({ productId, productName, kind = "product", onClose }: Props) {
  const isManga = kind === "manga";
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Gerente/cajero: solo pueden ajustar stock de su tienda asignada.
  // Admin ve todas las tiendas y puede mover stock entre cualquiera.
  const isAdmin = isAdminRole(user?.roles);
  const restrictedStoreId = !isAdmin ? (user?.store_id ?? null) : null;
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  // Mapa warehouseId → qty (string para permitir edición vacía)
  const [stock, setStock]       = useState<Record<number, string>>({});
  const [initial, setInitial]   = useState<Record<number, number>>({});
  // Selector "agregar"
  const [pendingWh, setPendingWh] = useState<number | "">("");
  const [pendingQty, setPendingQty] = useState("");
  // Modo edición inline
  const [editingWh, setEditingWh]   = useState<number | null>(null);
  const [editingQty, setEditingQty] = useState("");

  // Carga warehouses + inventario actual del producto.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [whs, inv] = await Promise.all([
          getWarehouses({ active: true }),
          isManga ? getMangaInventory(productId) : getInventory({ product_id: productId }),
        ]);
        if (cancelled) return;
        setWarehouses(whs);
        // Para gerente/cajero solo se cargan filas cuyo warehouse pertenece a
        // su tienda. Stock de otras tiendas existe pero NO entra al state →
        // no se renderiza ni se manda en el diff al guardar.
        const allowedWhIds = restrictedStoreId == null
          ? null
          : new Set(whs.filter(w => w.store?.id === restrictedStoreId).map(w => w.id));
        const init: Record<number, number> = {};
        const snap: Record<number, string> = {};
        (inv as (InventoryItem | MangaInventoryItem)[]).forEach(i => {
          if (allowedWhIds && !allowedWhIds.has(i.warehouse_id)) return;
          if (i.quantity > 0) {
            init[i.warehouse_id] = i.quantity;
            snap[i.warehouse_id] = String(i.quantity);
          }
        });
        setInitial(init);
        setStock(snap);
      } catch {
        toast.error("Error al cargar inventario");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [productId]);

  // Mapa para mostrar nombre de tienda dado warehouseId
  const warehouseLabel = (whId: number): string => {
    const wh = warehouses.find(w => w.id === whId);
    if (!wh) return `Bodega ${whId}`;
    return wh.store?.name ?? wh.name;
  };

  const assignedIds = Object.keys(stock).map(Number);
  // Warehouses visibles para el usuario: admin ve todos, gerente/cajero solo
  // los de su tienda. El backend igual valida (defensa en profundidad).
  const visibleWarehouses = useMemo(
    () => restrictedStoreId == null
      ? warehouses
      : warehouses.filter(w => w.store?.id === restrictedStoreId),
    [warehouses, restrictedStoreId],
  );
  const availableWarehouses = visibleWarehouses.filter(w => !assignedIds.includes(w.id));

  // Para no-admin con UNA sola tienda → preseleccionar y bloquear el selector.
  const lockedSingleStore = restrictedStoreId != null && visibleWarehouses.length === 1;
  useEffect(() => {
    if (lockedSingleStore && pendingWh === "" && availableWarehouses.length === 1) {
      setPendingWh(availableWarehouses[0]!.id);
    }
  }, [lockedSingleStore, pendingWh, availableWarehouses]);

  const canAdd = pendingWh !== "" && pendingQty !== "" && Number(pendingQty) >= 0;

  const handleAdd = () => {
    if (!canAdd) return;
    setStock(prev => ({ ...prev, [Number(pendingWh)]: pendingQty }));
    setPendingWh("");
    setPendingQty("");
  };

  const handleEditSave = (whId: number) => {
    if (editingQty === "" || Number(editingQty) < 0) return;
    setStock(prev => ({ ...prev, [whId]: editingQty }));
    setEditingWh(null);
    setEditingQty("");
  };

  const handleRemove = (whId: number) => {
    // Eliminar = setStock 0. Si era inicial > 0, se manda PUT con 0 al guardar
    // (registra ajuste en backend). Si nunca tuvo inventario, solo borra del state.
    if (initial[whId] !== undefined) {
      setStock(prev => ({ ...prev, [whId]: "0" }));
    } else {
      setStock(prev => { const n = { ...prev }; delete n[whId]; return n; });
    }
  };

  // Diff y guardar todos los cambios.
  const handleSave = async () => {
    const diffs: Array<{ whId: number; qty: number }> = [];
    // Cambios en asignadas
    for (const [whIdStr, qtyStr] of Object.entries(stock)) {
      const whId = Number(whIdStr);
      const qty = Number(qtyStr);
      if (Number.isNaN(qty) || qty < 0) {
        toast.error(`Cantidad inválida para "${warehouseLabel(whId)}"`);
        return;
      }
      if ((initial[whId] ?? 0) !== qty) diffs.push({ whId, qty });
    }
    // Tiendas que estaban en initial pero ya no están en stock = puestas a 0
    for (const whIdStr of Object.keys(initial)) {
      const whId = Number(whIdStr);
      if (!(whId in stock)) diffs.push({ whId, qty: 0 });
    }

    if (diffs.length === 0) {
      toast.info("No hay cambios que guardar");
      return;
    }

    setSaving(true);
    try {
      await Promise.all(diffs.map(d =>
        isManga
          ? updateMangaInventory(productId, d.whId, { quantity: d.qty })
          : updateInventory(productId, d.whId, { quantity: d.qty })
      ));
      toast.success(`Stock actualizado en ${diffs.length} tienda${diffs.length === 1 ? "" : "s"}`);
      if (isManga) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.mangas.all });
      } else {
        void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
      }
      onClose();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "Error al guardar inventario";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const assignedEntries = Object.entries(stock).map(([whId, qty]) => ({
    whId: Number(whId), qty, name: warehouseLabel(Number(whId)),
  }));
  const totalUnits = assignedEntries.reduce((s, e) => s + (Number(e.qty) || 0), 0);

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <Motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="relative w-full sm:max-w-[560px] max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{ background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)" }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 22px", borderBottom: "1px solid var(--td-card-border)" }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Boxes size={20} color="#60A5FA" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: TP }}>
              Stock por tienda{isManga ? " · Tomo" : ""}
            </p>
            <p style={{ margin: 0, fontSize: 10, color: TM, fontWeight: 700 }}>{productName}</p>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: TM }}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
              <Loader2 size={28} className="animate-spin" style={{ color: "#60A5FA" }} />
            </div>
          ) : (
            <>
              {/* Selector agregar */}
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: TM, display: "block", marginBottom: 6, marginLeft: 2 }}>
                    Tienda
                  </label>
                  <div style={{ position: "relative" }}>
                    <select
                      value={pendingWh}
                      onChange={e => setPendingWh(e.target.value === "" ? "" : Number(e.target.value))}
                      disabled={availableWarehouses.length === 0 || lockedSingleStore}
                      style={{ ...inputStyle, paddingRight: 32, appearance: "none" as const, opacity: (availableWarehouses.length === 0 || lockedSingleStore) ? 0.7 : 1, cursor: lockedSingleStore ? "not-allowed" : "auto" }}
                    >
                      <option value="">{availableWarehouses.length === 0 ? "Todas las tiendas asignadas" : "Selecciona una tienda…"}</option>
                      {availableWarehouses.map(w => (
                        <option key={w.id} value={w.id}>{w.store?.name ?? w.name}</option>
                      ))}
                    </select>
                    {lockedSingleStore ? (
                      <Lock size={11} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: TM, pointerEvents: "none" }} />
                    ) : (
                      <ChevronRight size={12} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%) rotate(90deg)", color: TM, pointerEvents: "none" }} />
                    )}
                  </div>
                </div>
                <div style={{ width: 100 }}>
                  <label style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: TM, display: "block", marginBottom: 6, marginLeft: 2 }}>
                    Stock
                  </label>
                  <input
                    type="number" min="0"
                    value={pendingQty}
                    onChange={e => setPendingQty(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAdd()}
                    placeholder="0"
                    disabled={pendingWh === ""}
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

              {/* Lista asignadas */}
              {assignedEntries.length === 0 ? (
                <div style={{ padding: "24px 16px", textAlign: "center", color: TM, fontSize: 12, border: "1px dashed var(--td-input-border)", borderRadius: 14 }}>
                  Este producto no tiene inventario en ninguna tienda.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {assignedEntries.map(({ whId, name, qty }) => {
                    const isEditing = editingWh === whId;
                    const qtyNum = Number(qty);
                    const isZero = !isEditing && qty !== "" && qtyNum === 0;
                    return (
                      <div key={whId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 14, border: `1px solid ${isZero ? "rgba(220,38,38,0.3)" : "var(--td-input-border)"}`, background: "var(--td-input-bg)" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: TP }}>{name}</p>
                          {isZero && (
                            <p style={{ margin: "2px 0 0", fontSize: 9, color: "#DC2626", fontWeight: 700 }}>Sin stock</p>
                          )}
                        </div>
                        {isEditing ? (
                          <>
                            <input
                              type="number" min="0" autoFocus
                              value={editingQty}
                              onChange={e => setEditingQty(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") handleEditSave(whId); if (e.key === "Escape") { setEditingWh(null); setEditingQty(""); } }}
                              style={{ width: 80, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(224,34,26,0.4)", background: "var(--td-popup-bg)", color: TP, fontSize: 13, fontWeight: 800, textAlign: "center", outline: "none" }}
                            />
                            <button
                              type="button"
                              onClick={() => handleEditSave(whId)}
                              style={{ padding: "6px 10px", borderRadius: 8, background: "#10b981", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center" }}
                              title="Guardar"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingWh(null); setEditingQty(""); }}
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
                              onClick={() => { setEditingWh(whId); setEditingQty(qty); }}
                              style={{ padding: "6px 10px", borderRadius: 8, background: "transparent", border: "1px solid var(--td-input-border)", color: TM, cursor: "pointer", fontSize: 10, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}
                              title="Editar stock"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemove(whId)}
                              style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(224,34,26,0.08)", border: "1px solid rgba(224,34,26,0.3)", color: "#fca5a5", cursor: "pointer", display: "flex", alignItems: "center" }}
                              title="Quitar tienda (pone stock en 0)"
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
                    Stock total: <strong>{totalUnits}</strong> uds en <strong>{assignedEntries.filter(e => Number(e.qty) > 0).length}</strong> tienda{assignedEntries.filter(e => Number(e.qty) > 0).length === 1 ? "" : "s"}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--td-card-border)", display: "flex", gap: 10, flexShrink: 0 }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{ flex: 1, padding: "11px 14px", borderRadius: 12, background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", color: TS, fontSize: 12, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.06em", cursor: saving ? "default" : "pointer" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            style={{ flex: 2, padding: "11px 14px", borderRadius: 12, background: "#10b981", border: "none", color: "#fff", fontSize: 12, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.06em", cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Guardar cambios
          </button>
        </div>
      </Motion.div>
    </div>
  );
}
