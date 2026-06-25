import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@tadaima/auth";
import { canAccessAdmin } from "@tadaima/permissions";
import { TabPermisos } from "@/components/admin/TabPermisos";
import { TabCancelaciones } from "@/components/admin/TabCancelaciones";
import { UserAvatar } from "@/components/UserAvatar";
import { AvatarPicker } from "@/components/AvatarPicker";
import {
  Store, Warehouse, Users, Shield, Tag,
  Package, CreditCard, Smartphone, Plus, Edit2, Save,
  X, Check, ChevronDown, Loader2, AlertTriangle,
  Eye, EyeOff, Lock, Globe, Phone,
  Mail, MapPin, ToggleLeft, ToggleRight,
  UserCheck, Key, Clock, Trash2, Percent, Sparkles, Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  createStore, updateStore,
  getWarehouses, createWarehouse, updateWarehouse,
  getInventory, updateInventory, getProducts,
  createUser, updateUser, deleteUser, assignRole,
  createCategory, updateCategory, deleteCategory,
  getTerminals, createTerminal, updateTerminal, deleteTerminal,
  createRole, getPermissions, assignRolePermissions,
  getStorePrices, updateStorePrices,
} from "@tadaima/api";
import type {
  Store as ApiStore, Warehouse as ApiWarehouse,
  InventoryItem, Product,
  User as ApiUser, ProductCategory, Terminal,
  Role, Permission, StorePriceRow,
} from "@tadaima/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStoresQuery } from "@/hooks/queries/useStores";
import { useWarehousesQuery } from "@/hooks/queries/useWarehouses";
import { useUsersQuery } from "@/hooks/queries/useUsers";
import { useRolesQuery } from "@/hooks/queries/useRoles";
import { useCategoriesQuery } from "@/hooks/queries/useCategories";
import { queryKeys } from "@/lib/queryKeys";
import { isValidEmail, isValidPhone } from "@/lib/validation";
import { warehouseTypeLabel, warehouseTypeBadgeColor } from "@/lib/warehouse";

// ─── Design tokens (coherente con resto del sistema) ─────────────────────────
const BG   = "var(--td-page-bg)";
const RED  = "var(--td-red)";
const RED_G = "var(--td-red-g)";
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
  boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
};
const INPUT: React.CSSProperties = {
  background: "var(--td-input-bg)",
  border: "1px solid var(--td-input-border)",
  borderRadius: 14,
  color: "var(--td-input-text)",
  outline: "none",
  padding: "10px 14px",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box" as const,
};
const TP = "var(--td-text-hi)";
const TS = "var(--td-text-md)";
const TM = "var(--td-text-lo)";
// Contenedor scrolleable para listas largas (usuarios, sucursales): alto máximo
// relativo al viewport para que la lista no crezca infinito.
const LIST_SCROLL: React.CSSProperties = {
  maxHeight: "calc(100vh - 330px)",
  overflowY: "auto",
  paddingRight: 4,
};

// ─── Shared components ───────────────────────────────────────────────────────
function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  const colors: Record<string, { bg: string; text: string }> = {
    green:  { bg: "rgba(0,200,100,0.12)", text: "#00CC66" },
    red:    { bg: "rgba(220,50,30,0.15)", text: "#FF4433" },
    blue:   { bg: "rgba(50,120,255,0.12)", text: "#4499FF" },
    amber:  { bg: "rgba(245,158,11,0.12)", text: "#F59E0B" },
    purple: { bg: "rgba(160,90,255,0.12)", text: "#BB77FF" },
  };
  const c = colors[color] ?? colors.blue!;
  return (
    <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 900, background: c.bg, color: c.text, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Btn({ onClick, children, variant = "ghost", disabled = false, style = {} }: {
  onClick?: () => void; children: React.ReactNode;
  variant?: "red" | "ghost" | "outline"; disabled?: boolean; style?: React.CSSProperties;
}) {
  const styles: Record<string, React.CSSProperties> = {
    red: { background: RED_G, color: "#fff", border: "1px solid rgba(255,80,50,0.3)", borderRadius: 12, padding: "8px 18px", fontSize: 12, fontWeight: 900, cursor: "pointer", opacity: disabled ? 0.4 : 1 },
    ghost: { background: "var(--td-panel-bg)", color: TS, border: "1px solid var(--td-panel-border)", borderRadius: 12, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
    outline: { background: "transparent", color: TS, border: "1px solid var(--td-input-border)", borderRadius: 12, padding: "7px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...styles[variant], ...style }}>{children}</button>;
}

function ListSearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ position: "relative", marginBottom: 12 }}>
      <Search size={14} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: TM, pointerEvents: "none" }} />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...INPUT, paddingLeft: 38 }}
      />
    </div>
  );
}

function Modal({ title, onClose, children, width = 560 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }} onClick={onClose} />
      <div style={{ position: "relative", width: "100%", maxWidth: width, maxHeight: "90vh", overflowY: "auto", borderRadius: 28, ...GLASS, padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <h3 style={{ color: TP, fontSize: 16, fontWeight: 900, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: TS, padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: TM }}>{label}</label>
      {children}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, sub, action }: { icon: React.ElementType; title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(224,34,26,0.12)", border: "1px solid rgba(224,34,26,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={18} color={RED} />
        </div>
        <div>
          <h2 style={{ color: TP, fontSize: 16, fontWeight: 900, margin: 0 }}>{title}</h2>
          <p style={{ color: TM, fontSize: 10, margin: 0, fontWeight: 600 }}>{sub}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

// "Pendiente" banner shown for tabs whose backend endpoints aren't available yet.
function PendingBanner({ feature }: { feature: string }) {
  return (
    <div style={{ ...GLASS_MD, borderRadius: 16, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
      <Clock size={18} color="#F59E0B" style={{ flexShrink: 0 }} />
      <div>
        <p style={{ color: "#F59E0B", fontWeight: 900, fontSize: 13, margin: 0 }}>Pendiente — endpoint no disponible</p>
        <p style={{ color: TS, fontSize: 11, margin: "3px 0 0 0" }}>{feature} requiere endpoints de backend que aún no están activos.</p>
      </div>
    </div>
  );
}

// ─── TAB: Sucursales ──────────────────────────────────────────────────────────
interface StoreFormData {
  id?: number;
  name: string;
  address: string;
  phone: string;
  email: string;
  active: boolean;
}

function TabSucursales() {
  const queryClient = useQueryClient();
  const storesQuery = useStoresQuery();
  const stores: ApiStore[] = storesQuery.data ?? [];
  const loading = storesQuery.isPending;
  const [modal, setModal] = useState<{ open: boolean; data: StoreFormData }>({
    open: false,
    data: { name: "", address: "", phone: "", email: "", active: true },
  });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const filteredStores = q
    ? stores.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.address ?? "").toLowerCase().includes(q) ||
        (s.phone ?? "").toLowerCase().includes(q) ||
        (s.email ?? "").toLowerCase().includes(q))
    : stores;

  useEffect(() => {
    if (storesQuery.error) toast.error("Error al cargar sucursales");
  }, [storesQuery.error]);

  const invalidateStores = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.stores.all });
    // Crear una tienda también crea su almacén `type='store'` en el backend;
    // refrescar warehouses para que la tienda aparezca de inmediato en el
    // selector de alta de producto (que lista bodegas, no tiendas).
    queryClient.invalidateQueries({ queryKey: ['warehouses'] });
  };

  const save = async () => {
    const d = modal.data;
    if (!d.name.trim()) { toast.error("El nombre es requerido"); return; }
    if (d.phone.trim() && !isValidPhone(d.phone)) { toast.error("Teléfono inválido: deben ser 10 dígitos (ej. 55 1234 5678)"); return; }
    if (d.email.trim() && !isValidEmail(d.email)) { toast.error("Email inválido (ej. tienda@email.com)"); return; }
    setSaving(true);
    try {
      if (d.id) {
        await updateStore(d.id, {
          name: d.name,
          address: d.address || undefined,
          phone: d.phone || undefined,
          email: d.email || undefined,
          active: d.active,
        });
        toast.success("Sucursal actualizada");
      } else {
        await createStore({
          // company_id lo deriva el backend desde el user autenticado
          name: d.name,
          address: d.address || undefined,
          phone: d.phone || undefined,
          email: d.email || undefined,
          active: d.active,
        });
        toast.success("Sucursal creada");
      }
      void invalidateStores();
      setModal({ open: false, data: { name: "", address: "", phone: "", email: "", active: true } });
    } catch {
      toast.error("Error al guardar la sucursal");
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof StoreFormData) => ({
    value: modal.data[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setModal(m => ({ ...m, data: { ...m.data, [key]: e.target.value } })),
  });

  return (
    <div>
      <SectionHeader icon={Store} title="Sucursales" sub="Puntos de venta · STORES"
        action={
          <Btn variant="red" onClick={() => setModal({ open: true, data: { name: "", address: "", phone: "", email: "", active: true } })} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={14} />Nueva Sucursal
          </Btn>
        }
      />
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: TM }}><Loader2 size={24} className="animate-spin" /></div>
      ) : (
        <>
        <ListSearchBar value={search} onChange={setSearch} placeholder="Buscar sucursal por nombre, dirección, teléfono o email..." />
        <div style={{ ...LIST_SCROLL, display: "grid", gap: 10 }}>
          {filteredStores.map(s => (
            <div key={s.id} style={{ ...GLASS, borderRadius: 16, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--td-panel-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Store size={18} color={s.active ? "#00CC66" : TM} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <p style={{ color: TP, fontWeight: 900, fontSize: 14, margin: 0 }}>{s.name}</p>
                  <Badge color={s.active ? "green" : "red"}>{s.active ? "Activa" : "Inactiva"}</Badge>
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
                  {s.address && <span style={{ fontSize: 11, color: TS, display: "flex", alignItems: "center", gap: 4 }}><MapPin size={10} />{s.address}</span>}
                  {s.phone && <span style={{ fontSize: 11, color: TS, display: "flex", alignItems: "center", gap: 4 }}><Phone size={10} />{s.phone}</span>}
                  {s.email && <span style={{ fontSize: 11, color: TS, display: "flex", alignItems: "center", gap: 4 }}><Mail size={10} />{s.email}</span>}
                </div>
              </div>
              <Btn onClick={() => setModal({ open: true, data: { id: s.id, name: s.name, address: s.address ?? "", phone: s.phone ?? "", email: s.email ?? "", active: s.active } })}>
                <Edit2 size={12} />
              </Btn>
            </div>
          ))}
          {stores.length === 0 && <div style={{ textAlign: "center", padding: 40, color: TM, fontSize: 13 }}>No hay sucursales registradas</div>}
          {stores.length > 0 && filteredStores.length === 0 && <div style={{ textAlign: "center", padding: 40, color: TM, fontSize: 13 }}>Sin resultados para "{search}"</div>}
        </div>
        </>
      )}
      {modal.open && (
        <Modal title={modal.data.id ? "Editar Sucursal" : "Nueva Sucursal"} onClose={() => setModal({ open: false, data: { name: "", address: "", phone: "", email: "", active: true } })}>
          <div style={{ display: "grid", gap: 14 }}>
            <Field label="Nombre *">
              <input type="text" placeholder="ej. Sucursal Centro" style={INPUT} {...field("name")} />
            </Field>
            <Field label="Dirección">
              <input type="text" placeholder="Calle, número, colonia..." style={INPUT} {...field("address")} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Teléfono">
                <input type="tel" placeholder="55 1234 5678" style={INPUT} {...field("phone")} />
              </Field>
              <Field label="Email">
                <input type="email" placeholder="tienda@email.com" style={INPUT} {...field("email")} />
              </Field>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <button type="button" onClick={() => setModal(m => ({ ...m, data: { ...m.data, active: !m.data.active } }))}
                style={{ background: "none", border: "none", cursor: "pointer", color: modal.data.active ? "#00CC66" : TM }}>
                {modal.data.active ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
              <span style={{ color: TP, fontSize: 13, fontWeight: 700 }}>Sucursal Activa</span>
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <Btn onClick={() => setModal({ open: false, data: { name: "", address: "", phone: "", email: "", active: true } })}>Cancelar</Btn>
            <Btn variant="red" onClick={save} disabled={saving} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {modal.data.id ? "Guardar" : "Crear Sucursal"}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── TAB: Bodegas ─────────────────────────────────────────────────────────────
interface WarehouseFormData {
  id?: number;
  name: string;
  type: 'central' | 'store' | 'bodega';
  description: string;
  active: boolean;
  store_id?: number;
}

const EMPTY_WAREHOUSE: WarehouseFormData = {
  name: "", type: "store", description: "", active: true,
};

function TabBodegas() {
  const queryClient = useQueryClient();
  const warehousesQuery = useWarehousesQuery();
  const storesQuery = useStoresQuery();
  const warehouses: ApiWarehouse[] = warehousesQuery.data ?? [];
  const stores: ApiStore[] = storesQuery.data ?? [];
  const loading = warehousesQuery.isPending || storesQuery.isPending;
  const [modal, setModal] = useState<{ open: boolean; data: WarehouseFormData }>({
    open: false,
    data: EMPTY_WAREHOUSE,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (warehousesQuery.error || storesQuery.error) toast.error("Error al cargar bodegas");
  }, [warehousesQuery.error, storesQuery.error]);

  const invalidateWarehouses = () => queryClient.invalidateQueries({ queryKey: ['warehouses'] });

  const save = async () => {
    const d = modal.data;
    if (!d.name.trim()) { toast.error("El nombre es requerido"); return; }
    setSaving(true);
    try {
      if (d.id) {
        await updateWarehouse(d.id, {
          name: d.name,
          type: d.type,
          description: d.description || undefined,
          active: d.active,
        });
        toast.success("Bodega actualizada");
      } else {
        await createWarehouse({
          // company_id lo deriva el backend desde el user autenticado
          store_id: d.store_id ?? null,
          name: d.name,
          type: d.type,
          description: d.description || undefined,
          active: d.active,
        });
        toast.success("Bodega creada");
      }
      void invalidateWarehouses();
      setModal({ open: false, data: EMPTY_WAREHOUSE });
    } catch {
      toast.error("Error al guardar la bodega");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <SectionHeader icon={Warehouse} title="Bodegas" sub="Ubicaciones de inventario · WAREHOUSES"
        action={
          <Btn variant="red" onClick={() => setModal({ open: true, data: EMPTY_WAREHOUSE })} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={14} />Nueva Bodega
          </Btn>
        }
      />
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: TM }}><Loader2 size={24} className="animate-spin" /></div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {warehouses.map(w => (
            <div key={w.id} style={{ ...GLASS, borderRadius: 16, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--td-panel-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Warehouse size={18} color={w.active ? "#4499FF" : TM} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
                  <p style={{ color: TP, fontWeight: 900, fontSize: 14, margin: 0 }}>{w.name}</p>
                  <Badge color={w.active ? warehouseTypeBadgeColor(w.type) : "red"}>
                    {w.active ? warehouseTypeLabel(w.type) : "Inactiva"}
                  </Badge>
                  {w.store && <Badge color="green">{w.store.name}</Badge>}
                </div>
                {w.description && <p style={{ color: TS, fontSize: 11, margin: "3px 0 0 0" }}>{w.description}</p>}
              </div>
              <Btn onClick={() => setModal({
                open: true,
                data: {
                  id: w.id,
                  name: w.name,
                  type: w.type,
                  description: w.description ?? "",
                  active: w.active,
                  store_id: w.store?.id,
                },
              })}>
                <Edit2 size={12} />
              </Btn>
            </div>
          ))}
          {warehouses.length === 0 && <div style={{ textAlign: "center", padding: 40, color: TM, fontSize: 13 }}>No hay bodegas registradas</div>}
        </div>
      )}
      {modal.open && (
        <Modal title={modal.data.id ? "Editar Bodega" : "Nueva Bodega"} onClose={() => setModal({ open: false, data: EMPTY_WAREHOUSE })}>
          <div style={{ display: "grid", gap: 14 }}>
            <Field label="Nombre">
              <input type="text" value={modal.data.name}
                onChange={e => setModal(m => ({ ...m, data: { ...m.data, name: e.target.value } }))}
                style={INPUT} placeholder="Ej. Almacén Central" />
            </Field>
            <Field label="Tipo">
              <select value={modal.data.type}
                onChange={e => setModal(m => ({ ...m, data: { ...m.data, type: e.target.value as 'central' | 'store' | 'bodega' } }))}
                style={{ ...INPUT, appearance: "none" as const }}>
                <option value="store">Exhibición (front, vendible en Caja)</option>
                <option value="bodega">Bodega (backstock, no vendible)</option>
                <option value="central">Central</option>
              </select>
            </Field>
            <Field label="Sucursal (opcional)">
              <select value={modal.data.store_id ?? ""}
                onChange={e => setModal(m => ({ ...m, data: { ...m.data, store_id: e.target.value ? Number(e.target.value) : undefined } }))}
                style={{ ...INPUT, appearance: "none" as const }}>
                <option value="">Sin asignar</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <button type="button" onClick={() => setModal(m => ({ ...m, data: { ...m.data, active: !m.data.active } }))}
                style={{ background: "none", border: "none", cursor: "pointer", color: modal.data.active ? "#00CC66" : TM }}>
                {modal.data.active ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
              <span style={{ color: TP, fontSize: 13, fontWeight: 700 }}>Bodega Activa</span>
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <Btn onClick={() => setModal({ open: false, data: EMPTY_WAREHOUSE })}>Cancelar</Btn>
            <Btn variant="red" onClick={save} disabled={saving} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {modal.data.id ? "Guardar" : "Crear Bodega"}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── TAB: Usuarios ────────────────────────────────────────────────────────────
interface UserFormData {
  id?: number;
  name: string;
  email: string;
  password: string;
  phone: string;
  active: boolean;
  store_id?: number;
  role_id?: number;
  // Password actual en claro (copia reversible). Solo lo manda el backend al
  // admin. undefined = no-admin / no disponible; null = sin copia (resetear).
  password_plain?: string | null;
}

function TabUsuarios() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const usersQuery = useUsersQuery();
  const storesQuery = useStoresQuery();
  const rolesQuery = useRolesQuery();
  const users: ApiUser[] = usersQuery.data ?? [];
  const stores: ApiStore[] = storesQuery.data ?? [];
  const roles: Role[] = rolesQuery.data ?? [];
  const loading = usersQuery.isPending || storesQuery.isPending || rolesQuery.isPending;
  const [modal, setModal]   = useState<{ open: boolean; data: UserFormData } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ApiUser | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  // Avatar picker abre encima del modal de Editar Usuario cuando el admin
  // hace click en la foto. Solo aplica a usuarios existentes (necesita user_id real).
  const [avatarPicker, setAvatarPicker] = useState<{ userId: number; userName: string; currentUrl: string | null } | null>(null);
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const filteredUsers = q
    ? users.filter(u =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone ?? "").toLowerCase().includes(q) ||
        u.roles.some(r => r.toLowerCase().includes(q)) ||
        (u.store?.name ?? "").toLowerCase().includes(q))
    : users;

  useEffect(() => {
    if (usersQuery.error || storesQuery.error || rolesQuery.error) toast.error("Error al cargar usuarios");
  }, [usersQuery.error, storesQuery.error, rolesQuery.error]);

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: queryKeys.users.all });

  const openCreate = () => setModal({ open: true, data: { name: "", email: "", password: "", phone: "", active: true, store_id: undefined, role_id: undefined } });
  const openEdit = (u: ApiUser) => {
    const currentRole = roles.find(r => u.roles.includes(r.name));
    setModal({ open: true, data: { id: u.id, name: u.name, email: u.email, password: "", phone: u.phone ?? "", active: u.active, store_id: u.store_id ?? undefined, role_id: currentRole?.id, password_plain: u.password_plain } });
  };
  const closeModal = () => { setModal(null); setShowPassword(false); setShowCurrentPassword(false); };

  const save = async () => {
    if (!modal) return;
    const d = modal.data;
    if (!d.name.trim() || !d.email.trim()) { toast.error("Nombre y email son requeridos"); return; }
    if (!isValidEmail(d.email)) { toast.error("Email inválido (ej. correo@ejemplo.com)"); return; }
    if (d.phone.trim() && !isValidPhone(d.phone)) { toast.error("Teléfono inválido: deben ser 10 dígitos (ej. 55 1234 5678)"); return; }
    setSaving(true);
    try {
      if (d.id) {
        await updateUser(d.id, {
          name: d.name,
          email: d.email,
          phone: d.phone || undefined,
          active: d.active,
          store_id: d.store_id ?? null,
          ...(d.password.trim() ? { password: d.password } : {}),
        });
        if (d.role_id) {
          await assignRole(d.id, d.role_id);
        }
        toast.success("Usuario actualizado");
      } else {
        if (!d.password.trim()) { toast.error("La contraseña es requerida"); setSaving(false); return; }
        const created = await createUser({
          name: d.name,
          email: d.email,
          password: d.password,
          phone: d.phone || undefined,
          active: d.active,
          store_id: d.store_id,
          role_id: d.role_id,
        });
        toast.success("Usuario creado");
        // Cierra el modal de alta y, tras un refetch, ofrece el picker para
        // que el admin asigne la foto del usuario recién creado.
        void invalidateUsers();
        closeModal();
        setAvatarPicker({
          userId: created.id,
          userName: created.name,
          currentUrl: null,
        });
        return;
      }
      void invalidateUsers();
      closeModal();
    } catch {
      toast.error("Error al guardar usuario");
    } finally {
      setSaving(false);
    }
  };

  const setField = (key: keyof UserFormData, value: string | boolean | number | undefined) =>
    setModal(m => m ? { ...m, data: { ...m.data, [key]: value } } : m);

  // Genera una contraseña simple-pero-fuerte: 1 palabra capitalizada + 4 dígitos
  // + un símbolo. Ej. "Tienda4827!". Cumple políticas comunes (mayús+minús+digit+
  // símbolo, 9+ chars) y es fácil de dictar verbalmente al cajero.
  const generatePassword = (): string => {
    const palabras = [
      "Tadaima", "Caja", "Tienda", "Manga", "Folio", "Venta", "Cobro",
      "Almacen", "Centro", "Recibo", "Stock", "Catalogo", "Pago", "Cliente",
    ];
    const simbolos = ["!", "#", "$", "@", "%"];
    const rand = (max: number) => Math.floor(Math.random() * max);
    const palabra = palabras[rand(palabras.length)]!;
    const digitos = String(rand(9000) + 1000); // 4 dígitos, primero ≥1
    const simbolo = simbolos[rand(simbolos.length)]!;
    return `${palabra}${digitos}${simbolo}`;
  };

  const handleGeneratePassword = () => {
    const pwd = generatePassword();
    setField("password", pwd);
    setShowPassword(true); // muestra al instante para que el admin lo copie/dicte
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(pwd).then(
        () => toast.success(`Contraseña generada y copiada: ${pwd}`),
        () => toast.success(`Contraseña generada: ${pwd}`)
      );
    } else {
      toast.success(`Contraseña generada: ${pwd}`);
    }
  };

  const askDelete = (u: ApiUser) => {
    if (currentUser?.id === u.id) {
      toast.error("No puedes eliminar tu propio usuario");
      return;
    }
    setConfirmDelete(u);
  };

  const confirmDeleteUser = async () => {
    if (!confirmDelete) return;
    const u = confirmDelete;
    setDeletingId(u.id);
    try {
      await deleteUser(u.id);
      void invalidateUsers();
      toast.success("Usuario eliminado");
      setConfirmDelete(null);
    } catch {
      toast.error("Error al eliminar usuario");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <SectionHeader icon={Users} title="Usuarios" sub="Cuentas del sistema · USERS"
        action={
          <Btn variant="red" onClick={openCreate} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={14} />Nuevo Usuario
          </Btn>
        }
      />
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: TM }}><Loader2 size={24} className="animate-spin" /></div>
      ) : (
        <>
        <ListSearchBar value={search} onChange={setSearch} placeholder="Buscar usuario por nombre, email, teléfono, rol o tienda..." />
        <div style={{ ...LIST_SCROLL, display: "grid", gap: 10 }}>
          {filteredUsers.map(u => (
            <div key={u.id} style={{ ...GLASS, borderRadius: 16, padding: "14px 20px", display: "flex", alignItems: "center", gap: 16 }}>
              <UserAvatar name={u.name} avatarUrl={u.avatar_url} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
                  <p style={{ color: TP, fontWeight: 900, fontSize: 14, margin: 0 }}>{u.name}</p>
                  <Badge color={u.active ? "green" : "red"}>{u.active ? "Activo" : "Inactivo"}</Badge>
                  {u.roles.map(r => <Badge key={r} color="purple">{r}</Badge>)}
                </div>
                <div style={{ display: "flex", gap: 14, marginTop: 3 }}>
                  <span style={{ fontSize: 11, color: TS }}>{u.email}</span>
                  {u.phone && <span style={{ fontSize: 11, color: TS, display: "flex", alignItems: "center", gap: 4 }}><Phone size={10} />{u.phone}</span>}
                  {u.store && <Badge color="blue">{u.store.name}</Badge>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Btn onClick={() => openEdit(u)}><Edit2 size={12} /></Btn>
                <span title={currentUser?.id === u.id ? "No puedes eliminar tu propio usuario" : "Eliminar usuario"}>
                  <Btn
                    onClick={() => askDelete(u)}
                    disabled={deletingId === u.id || currentUser?.id === u.id}
                    style={{ color: currentUser?.id === u.id ? TM : "#FF6B6B" }}
                  >
                    {deletingId === u.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </Btn>
                </span>
              </div>
            </div>
          ))}
          {users.length === 0 && <div style={{ textAlign: "center", padding: 40, color: TM, fontSize: 13 }}>No hay usuarios registrados</div>}
          {users.length > 0 && filteredUsers.length === 0 && <div style={{ textAlign: "center", padding: 40, color: TM, fontSize: 13 }}>Sin resultados para "{search}"</div>}
        </div>
        </>
      )}
      {modal?.open && (
        <Modal title={modal.data.id ? "Editar Usuario" : "Nuevo Usuario"} onClose={closeModal}>
          <div style={{ display: "grid", gap: 14 }}>
            {/* Avatar — preview con iniciales del nombre escrito. En edición
                hay botón para abrir el picker. En alta nueva no se puede
                subir antes de crear el usuario (necesitamos user_id), pero
                tras "Crear Usuario" se abre el picker automáticamente. */}
            {(() => {
              const existing = modal.data.id ? users.find(u => u.id === modal.data.id) : undefined;
              const currentAvatar = existing?.avatar_url ?? null;
              const displayName = modal.data.name || existing?.name || "Nuevo Usuario";
              const isNew = !modal.data.id;
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0 4px" }}>
                  <UserAvatar name={displayName} avatarUrl={currentAvatar} size={56} />
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: TM }}>
                      Foto de perfil
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: TM, lineHeight: 1.4 }}>
                      {isNew
                        ? "Podrás asignar la foto al guardar"
                        : (currentAvatar ? "Foto asignada" : "Sin foto — se muestran las iniciales")}
                    </p>
                  </div>
                  {!isNew && (
                    <button
                      type="button"
                      onClick={() => setAvatarPicker({
                        userId: modal.data.id!,
                        userName: displayName,
                        currentUrl: currentAvatar,
                      })}
                      style={{
                        padding: "8px 14px", borderRadius: 10, cursor: "pointer",
                        background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)",
                        color: TP, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em",
                      }}
                    >
                      {currentAvatar ? "Cambiar" : "Elegir"}
                    </button>
                  )}
                </div>
              );
            })()}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Nombre completo *">
                <input type="text" style={INPUT} value={modal.data.name} onChange={e => setField("name", e.target.value)} placeholder="Ej. María López Pérez" />
              </Field>
              <Field label="Email *">
                <input type="email" style={INPUT} value={modal.data.email} onChange={e => setField("email", e.target.value)} placeholder="correo@ejemplo.com" />
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label={modal.data.id ? "Nueva contraseña (opcional)" : "Contraseña *"}>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    style={{ ...INPUT, paddingRight: 76 }}
                    value={modal.data.password}
                    onChange={e => setField("password", e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                  {/* Eye toggle + Generar — pegados a la derecha del input.
                      "Generar" produce contraseña simple-pero-fuerte y la copia. */}
                  <div style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 2 }}>
                    <button
                      type="button"
                      onClick={handleGeneratePassword}
                      title="Generar contraseña segura"
                      style={{ background: "transparent", border: "none", cursor: "pointer", padding: 6, borderRadius: 8, color: TM, display: "flex", alignItems: "center" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#E0221A"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = TM; }}
                    >
                      <Sparkles size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPassword(s => !s)}
                      title={showPassword ? "Ocultar" : "Mostrar"}
                      style={{ background: "transparent", border: "none", cursor: "pointer", padding: 6, borderRadius: 8, color: TM, display: "flex", alignItems: "center" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = TP; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = TM; }}
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </Field>
              <Field label="Teléfono">
                <input type="tel" style={INPUT} value={modal.data.phone} onChange={e => setField("phone", e.target.value)} placeholder="55 1234 5678" />
              </Field>
            </div>
            {/* Contraseña actual en claro — solo la ve el admin (copia reversible
                del backend). null = no capturada (resetear para verla). */}
            {modal.data.id && modal.data.password_plain !== undefined && (
              <Field label="Contraseña actual (visible solo para el admin)">
                <div style={{ position: "relative" }}>
                  <input
                    type={modal.data.password_plain == null ? "text" : (showCurrentPassword ? "text" : "password")}
                    style={{ ...INPUT, paddingRight: 44, ...(modal.data.password_plain == null ? { fontSize: 11, color: TM } : {}) }}
                    value={modal.data.password_plain ?? "No capturada — resetea la contraseña para verla"}
                    readOnly
                  />
                  {modal.data.password_plain != null && (
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(s => !s)}
                      title={showCurrentPassword ? "Ocultar" : "Mostrar"}
                      style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", padding: 6, borderRadius: 8, color: TM, display: "flex", alignItems: "center" }}
                    >
                      {showCurrentPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  )}
                </div>
              </Field>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Tienda asignada">
                <select
                  value={modal.data.store_id ?? ""}
                  onChange={e => setField("store_id", e.target.value ? Number(e.target.value) : undefined)}
                  style={{ ...INPUT, appearance: "none" as const }}
                >
                  <option value="">Sin tienda</option>
                  {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Rol">
                <select
                  value={modal.data.role_id ?? ""}
                  onChange={e => setField("role_id", e.target.value ? Number(e.target.value) : undefined)}
                  style={{ ...INPUT, appearance: "none" as const }}
                >
                  <option value="">Sin rol</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </Field>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <button type="button" onClick={() => setField("active", !modal.data.active)}
                style={{ background: "none", border: "none", cursor: "pointer", color: modal.data.active ? "#00CC66" : TM }}>
                {modal.data.active ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
              <span style={{ color: TP, fontSize: 13, fontWeight: 700 }}>Usuario Activo</span>
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <Btn onClick={closeModal}>Cancelar</Btn>
            <Btn variant="red" onClick={save} disabled={saving} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {modal.data.id ? "Guardar" : "Crear Usuario"}
            </Btn>
          </div>
        </Modal>
      )}
      {avatarPicker && (
        <AvatarPicker
          userId={avatarPicker.userId}
          userName={avatarPicker.userName}
          currentAvatarUrl={avatarPicker.currentUrl}
          open
          onClose={() => setAvatarPicker(null)}
          onSaved={() => { invalidateUsers(); setAvatarPicker(null); }}
        />
      )}
      {confirmDelete && (
        <Modal title="Eliminar usuario" onClose={() => deletingId === null && setConfirmDelete(null)} width={460}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(255,107,107,0.12)", border: "1px solid rgba(255,107,107,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <AlertTriangle size={20} color="#FF6B6B" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ color: TP, fontSize: 14, fontWeight: 700, margin: 0, marginBottom: 6 }}>
                  ¿Eliminar a "{confirmDelete.name}"?
                </p>
                <p style={{ color: TS, fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                  El usuario será desactivado y no podrá iniciar sesión. Sus ventas y registros históricos se conservan.
                </p>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Btn onClick={() => setConfirmDelete(null)} disabled={deletingId !== null}>Cancelar</Btn>
              <Btn
                variant="red"
                onClick={() => void confirmDeleteUser()}
                disabled={deletingId !== null}
                style={{ display: "flex", alignItems: "center", gap: 7 }}
              >
                {deletingId !== null ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Eliminar
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── TAB: Roles & Permisos ────────────────────────────────────────────────────
function TabRoles() {
  const queryClient = useQueryClient();
  const rolesQuery = useRolesQuery();
  const permsQuery = useQuery({
    queryKey: ['permissions', 'list'],
    queryFn: () => getPermissions(),
  });
  const roles: Role[] = rolesQuery.data ?? [];
  const allPerms: Permission[] = permsQuery.data ?? [];
  const loading = rolesQuery.isPending || permsQuery.isPending;
  const [newRoleName, setNewRoleName]   = useState("");
  const [creatingRole, setCreatingRole] = useState(false);
  const [permModal, setPermModal]       = useState<Role | null>(null);
  const [selected, setSelected]         = useState<number[]>([]);
  const [savingPerms, setSavingPerms]   = useState(false);

  useEffect(() => {
    if (rolesQuery.error || permsQuery.error) toast.error("Error al cargar roles");
  }, [rolesQuery.error, permsQuery.error]);

  const invalidateRoles = () => queryClient.invalidateQueries({ queryKey: queryKeys.roles.all });

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) return;
    setCreatingRole(true);
    try {
      const role = await createRole(newRoleName.trim());
      void invalidateRoles();
      setNewRoleName("");
      toast.success(`Rol "${role.name}" creado`);
    } catch { toast.error("Error al crear rol"); }
    finally { setCreatingRole(false); }
  };

  const openPermModal = (role: Role) => {
    setPermModal(role);
    setSelected(role.permissions.map(p => p.id));
  };

  const savePerms = async () => {
    if (!permModal) return;
    setSavingPerms(true);
    try {
      await assignRolePermissions(permModal.id, selected);
      void invalidateRoles();
      setPermModal(null);
      toast.success("Permisos actualizados");
    } catch { toast.error("Error al guardar permisos"); }
    finally { setSavingPerms(false); }
  };

  const togglePerm = (id: number) =>
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  return (
    <div>
      <SectionHeader icon={Shield} title="Roles & Permisos" sub="Control de acceso granular" />

      {/* Create role */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          value={newRoleName}
          onChange={e => setNewRoleName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") void handleCreateRole(); }}
          placeholder="Nombre del nuevo rol..."
          style={{ ...INPUT, flex: 1 }}
        />
        <Btn onClick={handleCreateRole} disabled={creatingRole || !newRoleName.trim()} style={{ background: RED_G }}>
          {creatingRole ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Crear Rol
        </Btn>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 size={22} className="animate-spin" color={TM} /></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {roles.map(role => (
            <div key={role.id} style={{ ...GLASS, borderRadius: 16, padding: "14px 18px", display: "flex", alignItems: "center", gap: 16 }}>
              <Key size={16} color={RED} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <span style={{ color: TP, fontWeight: 700, fontSize: 14 }}>{role.name}</span>
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  {role.permissions.length === 0
                    ? <span style={{ fontSize: 10, color: TM }}>Sin permisos asignados</span>
                    : role.permissions.map(p => (
                      <span key={p.id} style={{ fontSize: 9, fontWeight: 900, padding: "2px 8px", borderRadius: 6, background: "rgba(255,255,255,0.07)", color: TS, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {p.name}
                      </span>
                    ))
                  }
                </div>
              </div>
              <Btn onClick={() => openPermModal(role)} style={{ background: "rgba(255,255,255,0.07)", fontSize: 10, padding: "6px 14px" }}>
                <Edit2 size={12} /> Permisos
              </Btn>
            </div>
          ))}
          {roles.length === 0 && (
            <div style={{ textAlign: "center", padding: 32, color: TM, fontSize: 13 }}>No hay roles creados</div>
          )}
        </div>
      )}

      {/* Permissions modal */}
      {permModal && (
        <Modal title={`Permisos · ${permModal.name}`} onClose={() => setPermModal(null)}>
          <p style={{ color: TM, fontSize: 11, margin: "-10px 0 16px 0" }}>{selected.length} de {allPerms.length} seleccionados</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto", marginBottom: 20 }}>
            {allPerms.map(p => (
              <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 10, background: selected.includes(p.id) ? "rgba(224,34,26,0.1)" : "rgba(255,255,255,0.03)", cursor: "pointer", border: `1px solid ${selected.includes(p.id) ? "rgba(224,34,26,0.25)" : "rgba(255,255,255,0.07)"}` }}>
                <input type="checkbox" checked={selected.includes(p.id)} onChange={() => togglePerm(p.id)} style={{ accentColor: RED }} />
                <span style={{ fontSize: 12, color: TS, fontWeight: 600 }}>{p.name}</span>
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn onClick={() => setPermModal(null)} style={{ background: "rgba(255,255,255,0.07)" }}>Cancelar</Btn>
            <Btn onClick={savePerms} disabled={savingPerms} style={{ background: RED_G }}>
              {savingPerms ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Guardar
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── TAB: Categorías ──────────────────────────────────────────────────────────
interface CategoryFormData {
  id?: number;
  name: string;
  description: string;
  active: boolean;
}

function TabCategorias() {
  const queryClient = useQueryClient();
  const categoriesQuery = useCategoriesQuery();
  const categories: ProductCategory[] = categoriesQuery.data ?? [];
  const loading = categoriesQuery.isPending;
  const [modal, setModal] = useState<{ open: boolean; data: CategoryFormData } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (categoriesQuery.error) toast.error("Error al cargar categorías");
  }, [categoriesQuery.error]);

  const invalidateCategories = () => queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });

  const openCreate = () => setModal({ open: true, data: { name: "", description: "", active: true } });
  const openEdit = (c: ProductCategory) => setModal({ open: true, data: { id: c.id, name: c.name, description: c.description ?? "", active: c.active } });
  const closeModal = () => setModal(null);

  const save = async () => {
    if (!modal) return;
    const d = modal.data;
    if (!d.name.trim()) { toast.error("El nombre es requerido"); return; }
    setSaving(true);
    try {
      if (d.id) {
        await updateCategory(d.id, { name: d.name, description: d.description || undefined, active: d.active });
        toast.success("Categoría actualizada");
      } else {
        await createCategory({ name: d.name, description: d.description || undefined, active: d.active });
        toast.success("Categoría creada");
      }
      void invalidateCategories();
      closeModal();
    } catch {
      toast.error("Error al guardar categoría");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await deleteCategory(id);
      void invalidateCategories();
      toast.success("Categoría eliminada");
    } catch {
      toast.error("Error al eliminar categoría");
    }
  };

  const setField = (key: keyof CategoryFormData, value: string | boolean) =>
    setModal(m => m ? { ...m, data: { ...m.data, [key]: value } } : m);

  return (
    <div>
      <SectionHeader icon={Tag} title="Categorías de Producto" sub="Clasificación del catálogo · PRODUCT_CATEGORIES"
        action={
          <Btn variant="red" onClick={openCreate} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={14} />Nueva Categoría
          </Btn>
        }
      />
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: TM }}><Loader2 size={24} className="animate-spin" /></div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {categories.map(c => (
            <div key={c.id} style={{ ...GLASS, borderRadius: 16, padding: "14px 20px", display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--td-panel-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Tag size={16} color={c.active ? "#F59E0B" : TM} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <p style={{ color: TP, fontWeight: 900, fontSize: 14, margin: 0 }}>{c.name}</p>
                  <Badge color={c.active ? "amber" : "red"}>{c.active ? "Activa" : "Inactiva"}</Badge>
                </div>
                {c.description && <p style={{ color: TS, fontSize: 11, margin: "3px 0 0 0" }}>{c.description}</p>}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Btn onClick={() => openEdit(c)}><Edit2 size={12} /></Btn>
                <Btn onClick={() => void remove(c.id)} style={{ color: "#FF4433" }}><Trash2 size={12} /></Btn>
              </div>
            </div>
          ))}
          {categories.length === 0 && <div style={{ textAlign: "center", padding: 40, color: TM, fontSize: 13 }}>No hay categorías registradas</div>}
        </div>
      )}
      {modal?.open && (
        <Modal title={modal.data.id ? "Editar Categoría" : "Nueva Categoría"} onClose={closeModal}>
          <div style={{ display: "grid", gap: 14 }}>
            <Field label="Nombre *">
              <input type="text" style={INPUT} value={modal.data.name} onChange={e => setField("name", e.target.value)} placeholder="ej. Electrónica" />
            </Field>
            <Field label="Descripción">
              <input type="text" style={INPUT} value={modal.data.description} onChange={e => setField("description", e.target.value)} placeholder="Descripción opcional" />
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <button type="button" onClick={() => setField("active", !modal.data.active)}
                style={{ background: "none", border: "none", cursor: "pointer", color: modal.data.active ? "#00CC66" : TM }}>
                {modal.data.active ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
              <span style={{ color: TP, fontSize: 13, fontWeight: 700 }}>Categoría Activa</span>
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <Btn onClick={closeModal}>Cancelar</Btn>
            <Btn variant="red" onClick={save} disabled={saving} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {modal.data.id ? "Guardar" : "Crear Categoría"}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── TAB: Inventario ──────────────────────────────────────────────────────────
function TabInventario() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<ApiWarehouse[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editQty, setEditQty] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [filterWH, setFilterWH] = useState<number | "all">("all");

  const load = async () => {
    setLoading(true);
    try {
      const [inv, prods, whs] = await Promise.all([
        getInventory(),
        getProducts({ per_page: 500 }),
        getWarehouses(),
      ]);
      setInventory(inv);
      setProducts(prods.data);
      setWarehouses(whs);
    } catch {
      toast.error("Error al cargar inventario");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const getProduct = (pid: number) => products.find(p => p.id === pid);
  const getWarehouse = (wid: number) => warehouses.find(w => w.id === wid);

  const saveQty = async (item: InventoryItem) => {
    const qty = parseInt(editQty);
    if (isNaN(qty) || qty < 0) { toast.error("Cantidad inválida"); return; }
    try {
      await updateInventory(item.product_id, item.warehouse_id, { quantity: qty });
      toast.success("Stock actualizado");
      setEditing(null);
      void load();
    } catch {
      toast.error("Error al actualizar stock");
    }
  };

  const filtered = filterWH === "all" ? inventory : inventory.filter(i => i.warehouse_id === filterWH);

  return (
    <div>
      <SectionHeader icon={Package} title="Inventario" sub="Stock por producto y bodega · INVENTORY"
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={filterWH}
              onChange={e => setFilterWH(e.target.value === "all" ? "all" : Number(e.target.value))}
              style={{ ...INPUT, width: "auto", padding: "7px 12px", fontSize: 11 }}
            >
              <option value="all">Todas las bodegas</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.store?.name ?? w.name}</option>)}
            </select>
            <Btn onClick={() => void load()}>↺</Btn>
          </div>
        }
      />
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: TM }}><Loader2 size={24} className="animate-spin" /></div>
      ) : (
        <>
          {inventory.length === 0 && (
            <div style={{ ...GLASS, borderRadius: 16, padding: 32, textAlign: "center" }}>
              <Package size={36} style={{ opacity: 0.15, marginBottom: 10, color: "white" }} />
              <p style={{ color: TM, margin: 0, fontSize: 13 }}>Sin registros de inventario.</p>
            </div>
          )}
          <div style={{ ...GLASS, borderRadius: 18, overflow: "hidden" }}>
            {filtered.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    {["Producto", "SKU", "Bodega", "Cantidad", "Acciones"].map(h => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: TM }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, idx) => {
                    const prod = getProduct(item.product_id);
                    const wh = getWarehouse(item.warehouse_id);
                    const key = `${item.product_id}:${item.warehouse_id}`;
                    const isEditing = editing === key;
                    const low = item.quantity > 0 && item.quantity <= 5;
                    return (
                      <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                        <td style={{ padding: "10px 16px" }}>
                          <p style={{ color: TP, fontSize: 12, fontWeight: 700, margin: 0 }}>{prod?.name ?? String(item.product_id)}</p>
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          <span style={{ color: TM, fontSize: 10, fontFamily: "monospace" }}>{prod?.sku ?? "—"}</span>
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          <Badge color="blue">{wh?.name ?? String(item.warehouse_id)}</Badge>
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          {isEditing ? (
                            <input type="number" value={editQty} onChange={e => setEditQty(e.target.value)} style={{ ...INPUT, width: 80, padding: "4px 8px", fontSize: 12 }} autoFocus />
                          ) : (
                            <span style={{ fontSize: 14, fontWeight: 900, color: item.quantity === 0 ? "#FF4433" : low ? "#F59E0B" : "#00CC66" }}>{item.quantity}</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          {isEditing ? (
                            <div style={{ display: "flex", gap: 6 }}>
                              <Btn onClick={() => void saveQty(item)} style={{ color: "#00CC66" }}><Check size={12} /></Btn>
                              <Btn onClick={() => setEditing(null)}><X size={12} /></Btn>
                            </div>
                          ) : (
                            <Btn onClick={() => { setEditing(key); setEditQty(String(item.quantity)); }}><Edit2 size={12} /></Btn>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── TAB: Terminales de Pago ──────────────────────────────────────────────────
interface TerminalFormData {
  id?: number;
  name: string;
  store_id: string;
  commission_percent: string;
  active: boolean;
}

function TabTerminales() {
  const queryClient = useQueryClient();
  const storesQuery = useStoresQuery();
  const terminalsQuery = useQuery({
    queryKey: ['terminals', 'list'],
    queryFn: () => getTerminals(),
  });
  const terminals: Terminal[] = terminalsQuery.data ?? [];
  const stores: ApiStore[] = storesQuery.data ?? [];
  const loading = terminalsQuery.isPending || storesQuery.isPending;
  const [modal, setModal] = useState<{ open: boolean; data: TerminalFormData } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (terminalsQuery.error || storesQuery.error) toast.error("Error al cargar terminales");
  }, [terminalsQuery.error, storesQuery.error]);

  const invalidateTerminals = () => queryClient.invalidateQueries({ queryKey: ['terminals'] });

  const openCreate = () => setModal({ open: true, data: { name: "", store_id: stores[0] ? String(stores[0].id) : "", commission_percent: "0", active: true } });
  const openEdit = (t: Terminal) => setModal({ open: true, data: { id: t.id, name: t.name, store_id: String(t.store_id), commission_percent: String(t.commission_percent), active: t.active } });
  const closeModal = () => setModal(null);

  const save = async () => {
    if (!modal) return;
    const d = modal.data;
    if (!d.name.trim()) { toast.error("El nombre es requerido"); return; }
    if (!d.store_id)    { toast.error("Selecciona una sucursal"); return; }
    const commPct = parseFloat(d.commission_percent) || 0;
    setSaving(true);
    try {
      if (d.id) {
        await updateTerminal(d.id, { store_id: Number(d.store_id), name: d.name, commission_percent: commPct, active: d.active });
        toast.success("Terminal actualizada");
      } else {
        await createTerminal({ store_id: Number(d.store_id), name: d.name, commission_percent: commPct, active: d.active });
        toast.success("Terminal creada");
      }
      void invalidateTerminals();
      closeModal();
    } catch {
      toast.error("Error al guardar terminal");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await deleteTerminal(id);
      void invalidateTerminals();
      toast.success("Terminal eliminada");
    } catch {
      toast.error("Error al eliminar terminal");
    }
  };

  const setField = (key: keyof TerminalFormData, value: string | boolean) =>
    setModal(m => m ? { ...m, data: { ...m.data, [key]: value } } : m);

  return (
    <div>
      <SectionHeader icon={Smartphone} title="Terminales de Pago" sub="Lectoras / TPV con comisión · PAYMENT_TERMINALS"
        action={
          <Btn variant="red" onClick={openCreate} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={14} />Nueva Terminal
          </Btn>
        }
      />
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: TM }}><Loader2 size={24} className="animate-spin" /></div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {terminals.map(t => (
            <div key={t.id} style={{ ...GLASS, borderRadius: 16, padding: "14px 20px", display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--td-panel-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Smartphone size={16} color={t.active ? "#BB77FF" : TM} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
                  <p style={{ color: TP, fontWeight: 900, fontSize: 14, margin: 0 }}>{t.name}</p>
                  <Badge color={t.active ? "purple" : "red"}>{t.active ? "Activa" : "Inactiva"}</Badge>
                  {t.store && <Badge color="blue">{t.store.name}</Badge>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
                  <Percent size={10} color={TM} />
                  <span style={{ fontSize: 11, color: TS }}>{t.commission_percent}% comisión</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Btn onClick={() => openEdit(t)}><Edit2 size={12} /></Btn>
                <Btn onClick={() => void remove(t.id)} style={{ color: "#FF4433" }}><Trash2 size={12} /></Btn>
              </div>
            </div>
          ))}
          {terminals.length === 0 && <div style={{ textAlign: "center", padding: 40, color: TM, fontSize: 13 }}>No hay terminales registradas</div>}
        </div>
      )}
      {modal?.open && (
        <Modal title={modal.data.id ? "Editar Terminal" : "Nueva Terminal"} onClose={closeModal}>
          <div style={{ display: "grid", gap: 14 }}>
            <Field label="Nombre *">
              <input type="text" style={INPUT} value={modal.data.name} onChange={e => setField("name", e.target.value)} placeholder="ej. Terminal 1" />
            </Field>
            <Field label="Sucursal *">
              <select value={modal.data.store_id} onChange={e => setField("store_id", e.target.value)} style={{ ...INPUT, appearance: "none" as const }}>
                <option value="">Seleccionar sucursal…</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Comisión (%)">
              <input type="number" min={0} max={100} step={0.01} style={INPUT} value={modal.data.commission_percent} onChange={e => setField("commission_percent", e.target.value)} placeholder="0.00" />
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <button type="button" onClick={() => setField("active", !modal.data.active)}
                style={{ background: "none", border: "none", cursor: "pointer", color: modal.data.active ? "#00CC66" : TM }}>
                {modal.data.active ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
              <span style={{ color: TP, fontSize: 13, fontWeight: 700 }}>Terminal Activa</span>
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <Btn onClick={closeModal}>Cancelar</Btn>
            <Btn variant="red" onClick={save} disabled={saving} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {modal.data.id ? "Guardar" : "Crear Terminal"}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── TAB: Precios por Tienda ──────────────────────────────────────────────────
function TabPreciosTienda() {
  const [products, setProducts]           = useState<Product[]>([]);
  const [search, setSearch]               = useState("");
  const [showDropdown, setShowDropdown]   = useState(false);
  const [selected, setSelected]           = useState<Product | null>(null);
  const [storePrices, setStorePrices]     = useState<StorePriceRow[]>([]);
  const [drafts, setDrafts]               = useState<Record<number, { price_1: string; price_2: string; price_3: string }>>({});
  const [loadingProds, setLoadingProds]   = useState(false);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [savingStore, setSavingStore]     = useState<number | null>(null);

  // Debounced product search
  useEffect(() => {
    if (!showDropdown) return;
    const t = setTimeout(() => {
      setLoadingProds(true);
      getProducts({ search: search || undefined, per_page: 30 })
        .then(res => setProducts(res.data))
        .catch(() => toast.error("Error al buscar productos"))
        .finally(() => setLoadingProds(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search, showDropdown]);

  // Load store prices when a product is selected
  useEffect(() => {
    if (!selected) { setStorePrices([]); setDrafts({}); return; }
    setLoadingPrices(true);
    getStorePrices(selected.id)
      .then(rows => {
        setStorePrices(rows);
        const d: Record<number, { price_1: string; price_2: string; price_3: string }> = {};
        rows.forEach(r => {
          d[r.store_id] = {
            price_1: r.prices["price_1"] != null ? String(r.prices["price_1"]) : "",
            price_2: r.prices["price_2"] != null ? String(r.prices["price_2"]) : "",
            price_3: r.prices["price_3"] != null ? String(r.prices["price_3"]) : "",
          };
        });
        setDrafts(d);
      })
      .catch(() => toast.error("Error al cargar precios"))
      .finally(() => setLoadingPrices(false));
  }, [selected]);

  const pickProduct = (p: Product) => {
    setSelected(p);
    setSearch(p.name);
    setShowDropdown(false);
  };

  const clearProduct = () => {
    setSelected(null);
    setSearch("");
    setStorePrices([]);
    setDrafts({});
  };

  const setDraftField = (storeId: number, field: "price_1" | "price_2" | "price_3", val: string) =>
    setDrafts(d => ({ ...d, [storeId]: { ...d[storeId]!, [field]: val } }));

  const saveRow = async (storeId: number) => {
    if (!selected) return;
    const d = drafts[storeId];
    if (!d) return;
    setSavingStore(storeId);
    try {
      await updateStorePrices(selected.id, storeId, {
        price_1: d.price_1 !== "" ? Number(d.price_1) : null,
        price_2: d.price_2 !== "" ? Number(d.price_2) : null,
        price_3: d.price_3 !== "" ? Number(d.price_3) : null,
      });
      toast.success("Precios guardados");
      const rows = await getStorePrices(selected.id);
      setStorePrices(rows);
    } catch { toast.error("Error al guardar precios"); }
    finally { setSavingStore(null); }
  };

  return (
    <div>
      <SectionHeader icon={CreditCard} title="Precios por Tienda" sub="Sobreescritura de precios por sucursal · STORE_PRICES" />

      {/* Product search */}
      <div style={{ ...GLASS, borderRadius: 18, padding: 20, marginBottom: 20 }}>
        <p style={{ color: TM, fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", margin: "0 0 10px 0" }}>Seleccionar Producto</p>
        <div style={{ position: "relative" }}>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setShowDropdown(true); if (selected) { setSelected(null); setStorePrices([]); setDrafts({}); } }}
              onFocus={() => setShowDropdown(true)}
              placeholder="Buscar por nombre o SKU..."
              style={{ ...INPUT, paddingRight: selected ? 80 : 36 }}
            />
            {loadingProds && (
              <Loader2 size={13} className="animate-spin" color={TM} style={{ position: "absolute", right: selected ? 44 : 12, top: "50%", transform: "translateY(-50%)" }} />
            )}
            {selected && (
              <button onClick={clearProduct} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: TS, display: "flex" }}>
                <X size={15} />
              </button>
            )}
          </div>

          {showDropdown && !selected && products.length > 0 && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 50, borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(12,12,20,0.97)", backdropFilter: "blur(20px)", maxHeight: 220, overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
              {products.map(p => (
                <button
                  key={p.id}
                  onMouseDown={() => pickProduct(p)}
                  style={{ width: "100%", background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.04)", padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, textAlign: "left" }}
                >
                  <Package size={13} color={TM} style={{ flexShrink: 0 }} />
                  <span style={{ color: TP, fontSize: 13, fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  {p.sku && <span style={{ color: TM, fontSize: 10, fontFamily: "monospace", flexShrink: 0 }}>{p.sku}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {selected && (
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, background: "rgba(224,34,26,0.08)", border: "1px solid rgba(224,34,26,0.18)" }}>
            <Package size={13} color={RED} style={{ flexShrink: 0 }} />
            <span style={{ color: TP, fontSize: 12, fontWeight: 700, flex: 1 }}>{selected.name}</span>
            {selected.sku && <span style={{ color: TM, fontSize: 10, fontFamily: "monospace" }}>{selected.sku}</span>}
          </div>
        )}
      </div>

      {/* Prices grid */}
      {selected && (
        <div style={{ ...GLASS, borderRadius: 18, overflow: "hidden" }}>
          {loadingPrices ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
              <Loader2 size={22} className="animate-spin" color={TM} />
            </div>
          ) : storePrices.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: TM, fontSize: 13 }}>No hay sucursales configuradas</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {["Sucursal", "Normal (A)", "Oferta (B)", "Mayoreo (C)", ""].map(h => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: TM }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {storePrices.map((row, idx) => {
                  const draft = drafts[row.store_id] ?? { price_1: "", price_2: "", price_3: "" };
                  const isSaving = savingStore === row.store_id;
                  return (
                    <tr key={row.store_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{ color: TP, fontSize: 13, fontWeight: 700 }}>{row.store_name}</span>
                      </td>
                      {(["price_1", "price_2", "price_3"] as const).map(field => (
                        <td key={field} style={{ padding: "8px 16px" }}>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={draft[field]}
                            onChange={e => setDraftField(row.store_id, field, e.target.value)}
                            placeholder="—"
                            style={{ ...INPUT, width: 110, padding: "6px 10px", fontSize: 12 }}
                          />
                        </td>
                      ))}
                      <td style={{ padding: "8px 16px" }}>
                        <Btn
                          onClick={() => void saveRow(row.store_id)}
                          disabled={isSaving}
                          style={{ background: RED_G, display: "flex", alignItems: "center", gap: 6 }}
                        >
                          {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                          Guardar
                        </Btn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main AdminPage ────────────────────────────────────────────────────────────
type TabId = "sucursales" | "bodegas" | "usuarios" | /* "roles" | */ "categorias" | "inventario" | /* "precios_tienda" | */ "terminales" | "permisos" | "cancelaciones";

const TABS: { id: TabId; label: string; icon: React.ElementType; sub: string }[] = [
  { id: "sucursales",     label: "Sucursales",       icon: Store,      sub: "STORES" },
  { id: "bodegas",        label: "Bodegas",          icon: Warehouse,  sub: "WAREHOUSES" },
  { id: "usuarios",       label: "Usuarios",         icon: Users,      sub: "USERS" },
  // { id: "roles",          label: "Roles",            icon: Shield,     sub: "ROLES + PERMS" },
  { id: "categorias",     label: "Categorías",       icon: Tag,        sub: "PROD_CATEGORIES" },
  { id: "inventario",     label: "Inventario",       icon: Package,    sub: "INVENTORY" },
  // { id: "precios_tienda", label: "Precios x Tienda", icon: CreditCard, sub: "STORE_PRICES" },
  { id: "terminales",     label: "Terminales",       icon: Smartphone, sub: "PAYMENT_TERMINALS" },
  { id: "permisos",       label: "Permisos",         icon: Shield,     sub: "PRICE_PERMISSIONS" },
  { id: "cancelaciones",  label: "Cancelaciones",    icon: Trash2,     sub: "SALE_CANCELLATIONS" },
];

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabId>("sucursales");
  const { user } = useAuth();
  const navigate = useNavigate();

  // Redirect non-admin users immediately
  useEffect(() => {
    if (user && !canAccessAdmin(user.roles)) {
      void navigate("/", { replace: true });
      toast.error("No tienes permiso para acceder a administración");
    }
  }, [user?.roles]);

  const renderTab = () => {
    switch (activeTab) {
      case "sucursales":     return <TabSucursales />;
      case "bodegas":        return <TabBodegas />;
      case "usuarios":       return <TabUsuarios />;
      // case "roles":          return <TabRoles />;
      case "categorias":     return <TabCategorias />;
      case "inventario":     return <TabInventario />;
      // case "precios_tienda": return <TabPreciosTienda />;
      case "terminales":     return <TabTerminales />;
      case "permisos":       return <TabPermisos />;
      case "cancelaciones":  return <TabCancelaciones />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: BG, color: TP }}>
      {/* Sidebar tabs */}
      <aside style={{ width: 200, borderRight: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.2)", display: "flex", flexDirection: "column", padding: "20px 10px", gap: 4, flexShrink: 0, overflowY: "auto" }}>
        <div style={{ paddingLeft: 10, marginBottom: 16 }}>
          <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.2em", color: RED, margin: 0 }}>Administración</p>
          <p style={{ fontSize: 10, color: TM, margin: "2px 0 0 0" }}>Sistema Tadaima</p>
        </div>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                borderRadius: 12, cursor: "pointer", transition: "all 0.15s", textAlign: "left",
                background: isActive ? "rgba(224,34,26,0.12)" : "transparent",
                border: isActive ? "1px solid rgba(224,34,26,0.25)" : "1px solid transparent",
              }}
            >
              <tab.icon size={15} color={isActive ? RED : TM} />
              <div>
                <p style={{ fontSize: 12, fontWeight: 900, color: isActive ? "#FF5544" : TS, margin: 0 }}>{tab.label}</p>
                <p style={{ fontSize: 8, color: TM, margin: 0, fontFamily: "monospace" }}>{tab.sub}</p>
              </div>
            </button>
          );
        })}
      </aside>

      {/* Content */}
      <main style={{ flex: 1, overflowY: "auto", padding: 28 }}>
        {renderTab()}
      </main>
    </div>
  );
}
