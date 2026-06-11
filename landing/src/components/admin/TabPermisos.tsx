// @ts-nocheck
import { useState, useEffect, useMemo } from "react";
import {
  Search, Shield, Check, Loader2, Save,
  ChevronRight, Package, AlertTriangle,
  ToggleLeft, ToggleRight, DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import {
  getUsers, getProducts,
  getSystemSettings, updateSystemSetting, updateUser,
} from "@tadaima/api";
import type { User as ApiUser, Product } from "@tadaima/api";
import { isEligibleForPermManagement } from "@/lib/permisos";

// ─── Design tokens ────────────────────────────────────────────────────────────
const RED  = "var(--td-red)";
const TP   = "var(--td-text-hi)";
const TS   = "var(--td-text-md)";
const TM   = "var(--td-text-lo)";
const GLASS: React.CSSProperties = {
  background: "var(--td-panel-bg)",
  backdropFilter: "blur(28px) saturate(160%)",
  WebkitBackdropFilter: "blur(28px) saturate(160%)",
  border: "1px solid var(--td-panel-border)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)",
};
const GLASS_MD: React.CSSProperties = {
  background: "var(--td-card-bg)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid var(--td-card-border)",
};
const INPUT: React.CSSProperties = {
  background: "var(--td-input-bg)",
  border: "1px solid var(--td-input-border)",
  borderRadius: 10,
  color: "var(--td-input-text)",
  outline: "none",
  padding: "8px 12px",
  fontSize: 12,
  width: "100%",
  boxSizing: "border-box" as const,
};

const SETTINGS_KEY = "price_permissions";

// ─── Data model (store access + product scope — stored in system settings) ────
export interface PricePerm {
  /** "assigned" = only user's store, "specific" = extra_store_ids, "all" = every store */
  store_access: "assigned" | "specific" | "all";
  extra_store_ids: number[];
  /** "all" products or only the listed ones */
  product_scope: "all" | "specific";
  product_ids: number[];
}

const DEFAULT_PERM: PricePerm = {
  store_access: "assigned",
  extra_store_ids: [],
  product_scope: "all",
  product_ids: [],
};

type PermMap = Record<string, PricePerm>;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function permEqual(a: PricePerm, b: PricePerm) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function toggleArr<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function RadioBtn({ selected, onChange, label }: {
  selected: boolean; onChange: () => void; label: string;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
      <div
        onClick={onChange}
        style={{
          width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
          background: "var(--td-input-bg)",
          border: `2px solid ${selected ? RED : "var(--td-input-border)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", transition: "all 0.15s",
        }}
      >
        {selected && <div style={{ width: 6, height: 6, borderRadius: "50%", background: RED }} />}
      </div>
      <span style={{ fontSize: 12, color: selected ? TP : TS }}>{label}</span>
    </label>
  );
}

function SectionBox({ icon: Icon, title, children }: {
  icon: React.ElementType; title: string; children: React.ReactNode;
}) {
  return (
    <div style={{ ...GLASS_MD, borderRadius: 16, padding: "16px 18px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Icon size={14} color={RED} />
        <span style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: TM }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function TabPermisos() {
  const [users, setUsers]         = useState<ApiUser[]>([]);
  const [products, setProducts]   = useState<Product[]>([]);
  const [permMap, setPermMap]     = useState<PermMap>({});
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);

  const [userSearch, setUserSearch]       = useState("");
  const [selectedUser, setSelectedUser]   = useState<ApiUser | null>(null);
  const [perm, setPerm]                   = useState<PricePerm>(DEFAULT_PERM);
  const [savedPerm, setSavedPerm]         = useState<PricePerm>(DEFAULT_PERM);
  const [canViewCost, setCanViewCost]     = useState(false);
  const [savedCanViewCost, setSavedCanViewCost] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  const isDirty = !permEqual(perm, savedPerm) || canViewCost !== savedCanViewCost;

  // ── Load data ────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    Promise.all([getUsers(), getProducts(), getSystemSettings()])
      .then(([u, p, settings]) => {
        setUsers(u);
        setProducts(Array.isArray(p) ? p : (p as { data: Product[] }).data ?? []);
        const raw = settings[SETTINGS_KEY];
        if (raw) {
          try { setPermMap(JSON.parse(raw) as PermMap); } catch { /* ignore */ }
        }
      })
      .catch(() => toast.error("Error al cargar datos de permisos"))
      .finally(() => setLoading(false));
  }, []);

  // ── When user is selected, load their perm ────────────────────────────────
  useEffect(() => {
    if (!selectedUser) return;
    const existing = permMap[String(selectedUser.id)] ?? DEFAULT_PERM;
    setPerm(structuredClone(existing));
    setSavedPerm(structuredClone(existing));
    setCanViewCost(!!selectedUser.can_view_cost);
    setSavedCanViewCost(!!selectedUser.can_view_cost);
    setProductSearch("");
  }, [selectedUser?.id]);

  // ── Filtered lists ────────────────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase();
    return users
      .filter(u => isEligibleForPermManagement(u.roles))
      .filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, userSearch]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.toLowerCase();
    const list = products.filter(p =>
      p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
    return list.slice(0, 120);
  }, [products, productSearch]);

  const hasCustomPerm = (u: ApiUser) => {
    if (u.can_view_cost) return true;
    const p = permMap[String(u.id)];
    if (!p) return false;
    return !permEqual(p, DEFAULT_PERM);
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!selectedUser || !isDirty) return;
    setSaving(true);
    try {
      const tasks: Promise<unknown>[] = [];

      if (canViewCost !== savedCanViewCost) {
        tasks.push(
          updateUser(selectedUser.id, { can_view_cost: canViewCost }).then(() => {
            setUsers(prev => prev.map(u =>
              u.id === selectedUser.id ? { ...u, can_view_cost: canViewCost } : u
            ));
            setSelectedUser(prev => prev ? { ...prev, can_view_cost: canViewCost } : prev);
          })
        );
      }

      if (!permEqual(perm, savedPerm)) {
        const next: PermMap = { ...permMap, [String(selectedUser.id)]: perm };
        tasks.push(
          updateSystemSetting(SETTINGS_KEY, JSON.stringify(next)).then(() => setPermMap(next))
        );
      }

      await Promise.all(tasks);
      setSavedPerm(structuredClone(perm));
      setSavedCanViewCost(canViewCost);
      toast.success("Permisos guardados");
    } catch {
      toast.error("Error al guardar permisos");
    } finally {
      setSaving(false);
    }
  }

  // ── Perm helpers ──────────────────────────────────────────────────────────
  // (2026-06-10) Se quitó la sección "Acceso a Precios por Tienda": el alcance
  // de costos es siempre la tienda asignada; buscar stock de otras tiendas ya
  // lo cubre Existencias. perm.store_access queda en su default "assigned".
  function setProductScope(v: PricePerm["product_scope"]) {
    setPerm(p => ({ ...p, product_scope: v, product_ids: v !== "specific" ? [] : p.product_ids }));
  }

  function toggleProduct(id: number) {
    setPerm(p => ({ ...p, product_ids: toggleArr(p.product_ids, id) }));
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, gap: 10, color: TM }}>
        <Loader2 size={20} className="animate-spin" />
        <span style={{ fontSize: 13 }}>Cargando permisos…</span>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(224,34,26,0.12)", border: "1px solid rgba(224,34,26,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Shield size={18} color={RED} />
        </div>
        <div>
          <h2 style={{ color: TP, fontSize: 16, fontWeight: 900, margin: 0 }}>Permisos de Precios</h2>
          <p style={{ color: TM, fontSize: 10, margin: 0, fontWeight: 600 }}>PRICE_PERMISSIONS</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>

        {/* ── Left: user list ────────────────────────────────────────────────── */}
        <div style={{ ...GLASS, borderRadius: 20, width: 240, flexShrink: 0, display: "flex", flexDirection: "column", padding: "14px 10px" }}>
          <div style={{ padding: "0 4px 10px", borderBottom: "1px solid var(--td-divider)" }}>
            <div style={{ position: "relative" }}>
              <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: TM, pointerEvents: "none" }} />
              <input
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Buscar usuario…"
                style={{ ...INPUT, paddingLeft: 28, borderRadius: 8, fontSize: 11 }}
              />
            </div>
          </div>
          <div style={{ overflowY: "auto", flex: 1, marginTop: 6 }}>
            {filteredUsers.length === 0 && (
              <p style={{ textAlign: "center", color: TM, fontSize: 11, padding: 20 }}>Sin resultados</p>
            )}
            {filteredUsers.map(u => {
              const isSelected = selectedUser?.id === u.id;
              const hasCustom  = hasCustomPerm(u);
              return (
                <button
                  key={u.id}
                  onClick={() => setSelectedUser(u)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "8px 10px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                    background: isSelected ? "rgba(224,34,26,0.10)" : "transparent",
                    border: isSelected ? "1px solid rgba(224,34,26,0.22)" : "1px solid transparent",
                    transition: "all 0.12s",
                  }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = "var(--td-hover-bg)"; }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: isSelected ? "rgba(224,34,26,0.18)" : "var(--td-panel-bg)", border: `1px solid ${isSelected ? "rgba(224,34,26,0.3)" : "var(--td-panel-border)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10, fontWeight: 900, color: isSelected ? RED : TM }}>
                    {u.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 800, color: isSelected ? TP : TS, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</p>
                    <p style={{ fontSize: 9, color: TM, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.roles[0] ?? "—"}</p>
                  </div>
                  {hasCustom && (
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: RED, flexShrink: 0 }} title="Tiene permisos personalizados" />
                  )}
                  {isSelected && <ChevronRight size={12} color={RED} style={{ flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Right: editor ──────────────────────────────────────────────────── */}
        {!selectedUser ? (
          <div style={{ flex: 1, ...GLASS, borderRadius: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <Shield size={36} color="var(--td-divider)" />
            <p style={{ color: TM, fontSize: 13, fontWeight: 600 }}>Selecciona un usuario para editar sus permisos</p>
          </div>
        ) : (
          <div style={{ flex: 1, ...GLASS, borderRadius: 20, padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>

            {/* User header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(224,34,26,0.12)", border: "1px solid rgba(224,34,26,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: RED }}>
                  {selectedUser.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 900, color: TP, margin: 0 }}>{selectedUser.name}</p>
                  <p style={{ fontSize: 10, color: TM, margin: 0 }}>{selectedUser.email} · {selectedUser.roles[0] ?? "sin rol"}{selectedUser.store ? ` · ${selectedUser.store.name}` : ""}</p>
                </div>
              </div>
              <button
                onClick={handleSave}
                disabled={!isDirty || saving}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10,
                  background: isDirty ? "var(--td-red-g)" : "var(--td-panel-bg)",
                  border: `1px solid ${isDirty ? "rgba(255,80,50,0.3)" : "var(--td-panel-border)"}`,
                  color: isDirty ? "#fff" : TM,
                  fontSize: 12, fontWeight: 900, cursor: isDirty ? "pointer" : "not-allowed",
                  opacity: saving ? 0.6 : 1, transition: "all 0.15s",
                }}
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                Guardar
              </button>
            </div>

            {isDirty && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)", marginBottom: 4 }}>
                <AlertTriangle size={13} color="#F59E0B" />
                <span style={{ fontSize: 11, color: "#F59E0B", fontWeight: 700 }}>Cambios sin guardar</span>
              </div>
            )}

            {/* 1. Costo real */}
            <SectionBox icon={DollarSign} title="Ver Costo Real de Productos">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: TS, margin: 0 }}>
                    Permitir ver costo real
                  </p>
                  <p style={{ fontSize: 10, color: TM, margin: "3px 0 0" }}>
                    El usuario podrá ver el precio de costo de cada producto en caja y catálogo
                  </p>
                </div>
                <button
                  onClick={() => setCanViewCost(v => !v)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: canViewCost ? "#00CC66" : TM, flexShrink: 0 }}
                >
                  {canViewCost
                    ? <ToggleRight size={32} />
                    : <ToggleLeft size={32} />
                  }
                </button>
              </div>
              <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8, background: canViewCost ? "rgba(0,200,100,0.07)" : "rgba(255,255,255,0.03)", border: `1px solid ${canViewCost ? "rgba(0,200,100,0.18)" : "var(--td-divider)"}` }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: canViewCost ? "#00CC66" : TM }}>
                  {canViewCost ? "ACTIVO — puede ver costos" : "INACTIVO — no ve costos"}
                </span>
              </div>
            </SectionBox>

            {/* 2. Productos */}
            <SectionBox icon={Package} title="Visibilidad por Producto">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <RadioBtn
                  selected={perm.product_scope === "all"}
                  onChange={() => setProductScope("all")}
                  label="Todos los productos"
                />
                <RadioBtn
                  selected={perm.product_scope === "specific"}
                  onChange={() => setProductScope("specific")}
                  label="Solo productos seleccionados"
                />
              </div>

              {perm.product_scope === "specific" && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--td-divider)" }}>
                  <div style={{ position: "relative", marginBottom: 8 }}>
                    <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: TM, pointerEvents: "none" }} />
                    <input
                      value={productSearch}
                      onChange={e => setProductSearch(e.target.value)}
                      placeholder="Buscar producto…"
                      style={{ ...INPUT, paddingLeft: 28, fontSize: 11 }}
                    />
                  </div>
                  <div style={{ fontSize: 10, color: TM, marginBottom: 6 }}>
                    {perm.product_ids.length} seleccionado{perm.product_ids.length !== 1 ? "s" : ""}
                    {filteredProducts.length < products.length ? ` · mostrando ${filteredProducts.length} de ${products.length}` : ""}
                  </div>
                  <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                    {filteredProducts.map(p => (
                      <div
                        key={p.id}
                        onClick={() => toggleProduct(p.id)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "6px 8px",
                          borderRadius: 8, cursor: "pointer", transition: "background 0.1s",
                          background: perm.product_ids.includes(p.id) ? "rgba(224,34,26,0.07)" : "transparent",
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = perm.product_ids.includes(p.id) ? "rgba(224,34,26,0.12)" : "var(--td-hover-bg)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = perm.product_ids.includes(p.id) ? "rgba(224,34,26,0.07)" : "transparent"; }}
                      >
                        <div style={{
                          width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                          background: perm.product_ids.includes(p.id) ? RED : "var(--td-input-bg)",
                          border: `1px solid ${perm.product_ids.includes(p.id) ? RED : "var(--td-input-border)"}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {perm.product_ids.includes(p.id) && <Check size={8} color="#fff" strokeWidth={3} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: TS, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</p>
                          <p style={{ fontSize: 9, color: TM, margin: 0 }}>{p.sku}</p>
                        </div>
                      </div>
                    ))}
                    {filteredProducts.length === 0 && (
                      <p style={{ textAlign: "center", color: TM, fontSize: 11, padding: 16 }}>Sin resultados</p>
                    )}
                  </div>
                </div>
              )}
            </SectionBox>

          </div>
        )}
      </div>
    </div>
  );
}
