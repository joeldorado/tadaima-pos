import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Trash2, Check, Boxes, ArrowRight } from "lucide-react";
import { motion as Motion } from "motion/react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getInventory, updateInventory, getMangaInventory, updateMangaInventory, getWarehouses, moveInventory } from "@tadaima/api";
import type { Warehouse, InventoryItem, MangaInventoryItem } from "@tadaima/api";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@tadaima/auth";
import { isAdmin as isAdminRole } from "@/lib/permisos";
import { warehouseTypeLabel } from "@/lib/warehouse";

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

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px", borderRadius: 14,
  border: "1px solid var(--td-input-border)", background: "var(--td-input-bg)",
  color: TP, fontSize: 13, fontWeight: 700, outline: "none", boxSizing: "border-box",
};

/** Orden de columnas: Exhibición primero, luego Bodega, luego Central. */
function whTypeOrder(type: string): number {
  return type === "store" ? 0 : type === "bodega" ? 1 : 2;
}

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
  // Tienda activa del modal (en el header). Gerente: la suya, fija. Admin:
  // dropdown — el modal se scopea a esa tienda (rows, agregar y mover).
  const [headerStoreId, setHeaderStoreId] = useState<number | null>(null);
  // Tab activa: Existencias (editar absoluto) o Mover (traspaso).
  const [activeTab, setActiveTab] = useState<"existencias" | "mover">("existencias");
  // Mover stock entre Exhibición ↔ Bodega de la tienda activa.
  const [moveDir, setMoveDir] = useState<"to_bodega" | "to_exhibicion">("to_bodega");
  const [moveQty, setMoveQty]   = useState("");
  const [moving, setMoving]     = useState(false);

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

  // Tiendas disponibles en el header: gerente → solo la suya; admin → todas las
  // que tengan almacenes. El modal entero se scopea a `headerStoreId`.
  const storeOptions = useMemo(() => {
    const byId = new Map<number, string>();
    for (const w of warehouses) {
      if (w.store?.id == null) continue;
      if (restrictedStoreId != null && w.store.id !== restrictedStoreId) continue;
      if (!byId.has(w.store.id)) byId.set(w.store.id, w.store.name);
    }
    return Array.from(byId, ([id, name]) => ({ id, name }));
  }, [warehouses, restrictedStoreId]);

  // Preselecciona la tienda activa (gerente: la suya; admin: la primera).
  useEffect(() => {
    if (storeOptions.length === 0) return;
    if (headerStoreId == null || !storeOptions.some(s => s.id === headerStoreId)) {
      setHeaderStoreId(restrictedStoreId ?? storeOptions[0]!.id);
    }
  }, [storeOptions, headerStoreId, restrictedStoreId]);

  const activeStoreName = storeOptions.find(s => s.id === headerStoreId)?.name ?? "";

  // Almacenes de la tienda activa (Exhibición + Bodega).
  const scopedWarehouses = useMemo(
    () => warehouses.filter(w => w.store?.id === headerStoreId),
    [warehouses, headerStoreId],
  );

  // Etiqueta del almacén: solo el tipo — la tienda ya vive en el header.
  const warehouseLabel = (whId: number): string => {
    const wh = warehouses.find(w => w.id === whId);
    return wh ? warehouseTypeLabel(wh.type) : `Almacén ${whId}`;
  };

  // Mover: Exhibición ↔ Bodega de la tienda activa.
  const moveExhibicion = scopedWarehouses.find(w => w.type === "store");
  const moveBodega     = scopedWarehouses.find(w => w.type === "bodega");
  const canShowMove    = !isManga && !!moveExhibicion && !!moveBodega;
  const moveFromWh = moveDir === "to_bodega" ? moveExhibicion : moveBodega;
  const moveToWh   = moveDir === "to_bodega" ? moveBodega : moveExhibicion;
  // Disponibles (snapshot del backend) para el preview "old → new".
  const moveFromAvail = moveFromWh ? (initial[moveFromWh.id] ?? 0) : 0;
  const moveToAvail   = moveToWh ? (initial[moveToWh.id] ?? 0) : 0;
  const moveQtyNum    = Number(moveQty) || 0;
  const canMove = !moving && !!moveFromWh && !!moveToWh && moveQty !== "" && Number(moveQty) > 0 && Number(moveQty) <= moveFromAvail;

  const handleMove = async () => {
    if (!canMove || !moveFromWh || !moveToWh) return;
    const qty = Number(moveQty);
    const fromId = moveFromWh.id, toId = moveToWh.id;
    const fromType = moveFromWh.type, toType = moveToWh.type;
    // Snapshot para rollback si la API falla.
    const prevInitial = initial, prevStock = stock;
    const newFrom = (initial[fromId] ?? 0) - qty;
    const newTo   = (initial[toId] ?? 0) + qty;

    // Optimista: reflejamos los nuevos números YA (tenemos el dato enfrente).
    setInitial(p => ({ ...p, [fromId]: newFrom, [toId]: newTo }));
    setStock(p => ({ ...p, [fromId]: String(newFrom), [toId]: String(newTo) }));
    setMoveQty("");
    setMoving(true);
    try {
      await moveInventory({ product_id: productId, from_warehouse_id: fromId, to_warehouse_id: toId, quantity: qty });
      toast.success(`Movido: ${qty} de ${warehouseTypeLabel(fromType)} → ${warehouseTypeLabel(toType)}`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
    } catch (err: unknown) {
      // Rollback: regresamos los números si truena (casi nunca pasa).
      setInitial(prevInitial);
      setStock(prevStock);
      const msg = (err as { message?: string })?.message ?? "Error al mover stock";
      toast.error(msg);
    } finally {
      setMoving(false);
    }
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
      toast.success(`Stock actualizado en ${diffs.length} almacén${diffs.length === 1 ? "" : "es"}`);
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

  // Solo filas de la tienda activa (el modal está scopeado por el header).
  const scopedIds = new Set(scopedWarehouses.map(w => w.id));
  const assignedEntries = Object.entries(stock)
    .filter(([whId]) => scopedIds.has(Number(whId)))
    .map(([whId, qty]) => ({ whId: Number(whId), qty, name: warehouseLabel(Number(whId)) }));
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
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: TP }}>
                Stock{isManga ? " · Tomo" : ""}
              </p>
              <p style={{ margin: 0, fontSize: 10, color: TM, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{productName}</p>
            </div>
            {/* Tienda activa: dropdown si el admin ve varias, chip si es una sola. */}
            {storeOptions.length > 1 ? (
              <select
                value={headerStoreId ?? ""}
                onChange={e => setHeaderStoreId(e.target.value === "" ? null : Number(e.target.value))}
                style={{ ...inputStyle, padding: "6px 10px", fontSize: 12, appearance: "none" as const, width: "fit-content", maxWidth: "100%", background: "rgba(96,165,250,0.10)", border: "1px solid rgba(96,165,250,0.30)", color: "#60A5FA", fontWeight: 800 }}
              >
                {storeOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ) : activeStoreName ? (
              <span style={{ alignSelf: "flex-start", padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 800, background: "rgba(96,165,250,0.12)", color: "#60A5FA", border: "1px solid rgba(96,165,250,0.25)" }}>
                {activeStoreName}
              </span>
            ) : null}
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
              {/* Tabs (solo cuando hay traspaso disponible: Exhibición + Bodega) */}
              {canShowMove && (
                <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)" }}>
                  {([
                    { key: "existencias", label: "Existencias" },
                    { key: "mover", label: "Mover stock" },
                  ] as const).map(t => {
                    const active = activeTab === t.key;
                    return (
                      <button key={t.key} type="button" onClick={() => setActiveTab(t.key)}
                        style={{ flex: 1, padding: "8px 6px", borderRadius: 9, border: "none", fontSize: 11, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.06em",
                          background: active ? "rgba(96,165,250,0.16)" : "transparent", color: active ? "#60A5FA" : TM, cursor: "pointer" }}>
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* TAB · Mover stock */}
              {canShowMove && activeTab === "mover" && (
                <div style={{ padding: "12px 14px", borderRadius: 14, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.22)", display: "flex", flexDirection: "column", gap: 10 }}>
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "#D97706" }}>
                    Mover stock entre almacenes
                  </p>

                  {/* Dirección: qué se RESTA → qué se SUMA */}
                  <div style={{ display: "flex", gap: 6 }}>
                    {([
                      { dir: "to_bodega", label: "Exhibición → Bodega" },
                      { dir: "to_exhibicion", label: "Bodega → Exhibición" },
                    ] as const).map(opt => {
                      const active = moveDir === opt.dir;
                      return (
                        <button key={opt.dir} type="button" onClick={() => setMoveDir(opt.dir)}
                          style={{ flex: 1, padding: "8px 6px", borderRadius: 10, fontSize: 10.5, fontWeight: 900,
                            border: `1px solid ${active ? "#D97706" : "var(--td-input-border)"}`,
                            background: active ? "rgba(245,158,11,0.16)" : "transparent",
                            color: active ? "#D97706" : TM, cursor: "pointer" }}>
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Cantidad + Mover */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="number" min="0" value={moveQty} onChange={e => setMoveQty(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleMove()} placeholder="Cant."
                      style={{ ...inputStyle, width: 80, padding: "9px 10px", textAlign: "center", fontWeight: 800 }} />
                    <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: TM }}>
                      Mueves <strong style={{ color: "#D97706" }}>{moveQtyNum || 0}</strong> de {warehouseTypeLabel(moveFromWh!.type)} → {warehouseTypeLabel(moveToWh!.type)}
                    </span>
                    <button type="button" onClick={handleMove} disabled={!canMove}
                      style={{ padding: "9px 16px", borderRadius: 12, border: "none", background: canMove ? "#D97706" : "var(--td-input-bg)", color: canMove ? "#fff" : TM, fontSize: 11, fontWeight: 900, cursor: canMove ? "pointer" : "not-allowed", textTransform: "uppercase" as const, letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 5 }}>
                      {moving ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                      Mover
                    </button>
                  </div>

                  {/* Preview old → new de los 2 almacenes */}
                  <div style={{ display: "flex", gap: 8, fontSize: 11, fontWeight: 800 }}>
                    <div style={{ flex: 1, padding: "7px 10px", borderRadius: 10, background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)" }}>
                      <span style={{ color: "#059669" }}>Exhibición </span>
                      <span style={{ color: TM }}>{moveDir === "to_bodega" ? moveFromAvail : moveToAvail}</span>
                      {moveQtyNum > 0 && (
                        <span style={{ color: TP }}> → {moveDir === "to_bodega" ? moveFromAvail - moveQtyNum : moveToAvail + moveQtyNum}</span>
                      )}
                    </div>
                    <div style={{ flex: 1, padding: "7px 10px", borderRadius: 10, background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)" }}>
                      <span style={{ color: "#D97706" }}>Bodega </span>
                      <span style={{ color: TM }}>{moveDir === "to_bodega" ? moveToAvail : moveFromAvail}</span>
                      {moveQtyNum > 0 && (
                        <span style={{ color: TP }}> → {moveDir === "to_bodega" ? moveToAvail + moveQtyNum : moveFromAvail - moveQtyNum}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB · Existencias por almacén (2 columnas: Exhibición | Bodega) */}
              {(!canShowMove || activeTab === "existencias") && (<>
              {scopedWarehouses.length === 0 ? (
                <div style={{ padding: "24px 16px", textAlign: "center", color: TM, fontSize: 12, border: "1px dashed var(--td-input-border)", borderRadius: 14 }}>
                  Esta tienda no tiene almacenes.
                </div>
              ) : (
                <div>
                  <label style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: TM, display: "block", marginBottom: 8, marginLeft: 2 }}>
                    Existencias por almacén
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: scopedWarehouses.length === 1 ? "1fr" : "1fr 1fr", gap: 10 }}>
                    {scopedWarehouses.slice().sort((a, b) => whTypeOrder(a.type) - whTypeOrder(b.type)).map(w => {
                      const val = stock[w.id] ?? "";
                      const accent   = w.type === "bodega" ? "#D97706" : w.type === "central" ? "#60A5FA" : "#059669";
                      const accentBg = w.type === "bodega" ? "rgba(245,158,11,0.08)" : w.type === "central" ? "rgba(96,165,250,0.08)" : "rgba(16,185,129,0.08)";
                      return (
                        <div key={w.id} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px", borderRadius: 14, background: accentBg, border: `1px solid ${accent}33` }}>
                          <span style={{ fontSize: 12, fontWeight: 900, color: accent }}>{warehouseTypeLabel(w.type)}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input
                              type="number" min="0"
                              value={val}
                              onChange={e => setStock(prev => ({ ...prev, [w.id]: e.target.value }))}
                              placeholder="0"
                              style={{ ...inputStyle, flex: 1, padding: "10px 12px", textAlign: "center", fontWeight: 900, fontSize: 16 }}
                            />
                            <span style={{ fontSize: 10, fontWeight: 700, color: TM, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>uds</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemove(w.id)}
                            style={{ alignSelf: "flex-start", padding: "5px 10px", borderRadius: 8, background: "rgba(224,34,26,0.08)", border: "1px solid rgba(224,34,26,0.3)", color: "#fca5a5", cursor: "pointer", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", gap: 5 }}
                            title="Poner stock en 0"
                          >
                            <Trash2 size={11} /> Vaciar
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {assignedEntries.length > 0 && (
                <div style={{ padding: "10px 14px", borderRadius: 14, background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)" }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "#10b981", margin: 0 }}>
                    Stock total: <strong>{totalUnits}</strong> uds en <strong>{assignedEntries.filter(e => Number(e.qty) > 0).length}</strong> almacén{assignedEntries.filter(e => Number(e.qty) > 0).length === 1 ? "" : "es"}
                  </p>
                </div>
              )}
              </>)}
            </>
          )}
        </div>

        {/* Footer — en la tab Mover el traspaso se guarda al instante, no hay
            "Guardar cambios"; solo Cerrar. En Existencias sí se guarda absoluto. */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--td-card-border)", display: "flex", gap: 10, flexShrink: 0 }}>
          {canShowMove && activeTab === "mover" ? (
            <button
              onClick={onClose}
              style={{ flex: 1, padding: "11px 14px", borderRadius: 12, background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", color: TS, fontSize: 12, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.06em", cursor: "pointer" }}
            >
              Cerrar
            </button>
          ) : (
            <>
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
            </>
          )}
        </div>
      </Motion.div>
    </div>
  );
}
