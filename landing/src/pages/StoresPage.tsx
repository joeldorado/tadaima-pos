import { useState, useEffect } from "react";
import { useAuth } from "@tadaima/auth";
import { useActiveStore } from "@/contexts/StoreContext";
import { getStores, createStore, updateStore, createWarehouse } from "@tadaima/api";
import type { Store as ApiStore } from "@tadaima/api";
import { toast } from "sonner";
import {
  Store, Plus, Edit2, Phone, Mail, MapPin,
  CheckCircle, XCircle, Loader2, X, Save,
} from "lucide-react";

const RED     = "var(--td-red)";
const RED_DIM = "var(--td-red-dim)";
const RED_BRD = "var(--td-red-brd)";

interface StoreForm {
  name: string;
  address: string;
  phone: string;
  email: string;
  active: boolean;
}

const EMPTY_FORM: StoreForm = {
  name: "",
  address: "",
  phone: "",
  email: "",
  active: true,
};

// ─── Store form modal ─────────────────────────────────────────────────────────

interface StoreModalProps {
  store: ApiStore | null;
  companyId: number | null | undefined;
  onSave: (saved: ApiStore) => void;
  onClose: () => void;
}

function StoreModal({ store, companyId, onSave, onClose }: StoreModalProps) {
  const isEdit = !!store;
  const [form, setForm] = useState<StoreForm>(
    isEdit
      ? { name: store.name, address: store.address ?? "", phone: store.phone ?? "", email: store.email ?? "", active: store.active }
      : { ...EMPTY_FORM }
  );
  const [saving, setSaving] = useState(false);

  function field(key: keyof StoreForm) {
    return {
      value: form[key] as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(f => ({ ...f, [key]: e.target.value })),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      let saved: ApiStore;
      if (isEdit && store) {
        saved = await updateStore(store.id, {
          name: form.name,
          address: form.address || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          active: form.active,
        });
      } else {
        saved = await createStore({
          company_id: companyId ?? 0,
          name: form.name,
          address: form.address || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          active: form.active,
        });
        // Auto-create a warehouse linked to the new store
        await createWarehouse({
          company_id: companyId ?? 0,
          store_id: saved.id,
          name: saved.name,
          type: "store",
          active: true,
        });
      }
      toast.success(isEdit ? "Tienda actualizada" : "Tienda creada");
      onSave(saved);
    } catch {
      toast.error("Error al guardar la tienda");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--td-input-bg)",
    border: "1px solid var(--td-input-border)",
    borderRadius: 10,
    padding: "9px 12px",
    color: "var(--td-input-text)",
    fontSize: 13,
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--td-text-lo)",
    marginBottom: 4,
    display: "block",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-6 w-[400px] shadow-2xl"
        style={{ background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: RED_DIM, border: `1px solid ${RED_BRD}` }}>
              <Store size={16} style={{ color: RED }} />
            </div>
            <span style={{ color: "rgba(255,255,255,0.85)", fontWeight: 600, fontSize: 15 }}>
              {isEdit ? "Editar Tienda" : "Nueva Tienda"}
            </span>
          </div>
          <button onClick={onClose} style={{ color: "rgba(255,255,255,0.3)" }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Nombre */}
          <div>
            <label style={labelStyle}>Nombre *</label>
            <input
              required
              placeholder="ej. Sucursal Centro"
              style={inputStyle}
              {...field("name")}
            />
          </div>

          {/* Dirección */}
          <div>
            <label style={labelStyle}>Dirección</label>
            <input
              placeholder="Calle, número, colonia..."
              style={inputStyle}
              {...field("address")}
            />
          </div>

          <div className="flex gap-3">
            {/* Teléfono */}
            <div className="flex-1">
              <label style={labelStyle}>Teléfono</label>
              <input
                type="tel"
                placeholder="55 1234 5678"
                style={inputStyle}
                {...field("phone")}
              />
            </div>

            {/* Email */}
            <div className="flex-1">
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                placeholder="tienda@email.com"
                style={inputStyle}
                {...field("email")}
              />
            </div>
          </div>

          {/* Activa */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, active: !f.active }))}
              className="flex items-center gap-2"
            >
              <div
                className="w-9 h-5 rounded-full transition-all relative"
                style={{ background: form.active ? "rgba(204,34,0,0.6)" : "rgba(255,255,255,0.1)" }}
              >
                <div
                  className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                  style={{
                    background: form.active ? "#fff" : "rgba(255,255,255,0.3)",
                    left: form.active ? "calc(100% - 18px)" : "2px",
                  }}
                />
              </div>
              <span style={{ fontSize: 12, color: form.active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)" }}>
                {form.active ? "Activa" : "Inactiva"}
              </span>
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:bg-white/10"
              style={{ color: "var(--td-icon-inactive)", border: "1px solid var(--td-panel-border)" }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
              style={{
                background: saving || !form.name.trim() ? "rgba(204,34,0,0.3)" : "linear-gradient(135deg, #BB1100 0%, #FF3322 100%)",
                color: "#fff",
                opacity: !form.name.trim() ? 0.5 : 1,
              }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isEdit ? "Guardar" : "Crear Tienda"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Store card ───────────────────────────────────────────────────────────────

interface StoreCardProps {
  store: ApiStore;
  onEdit: (store: ApiStore) => void;
  canEdit?: boolean;
}

function StoreCard({ store, onEdit, canEdit = true }: StoreCardProps) {
  return (
    <div
      className="glass-dark rounded-2xl p-5 flex flex-col gap-3"
      style={{ border: "1px solid var(--td-panel-border)" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: RED_DIM, border: `1px solid ${RED_BRD}` }}>
            <Store size={17} style={{ color: RED }} />
          </div>
          <div>
            <div style={{ color: "rgba(255,255,255,0.85)", fontWeight: 600, fontSize: 14 }}>
              {store.name}
            </div>
            {store.active ? (
              <div className="flex items-center gap-1 mt-0.5">
                <CheckCircle size={10} style={{ color: "#4ade80" }} />
                <span style={{ fontSize: 10, color: "#4ade80" }}>Activa</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 mt-0.5">
                <XCircle size={10} style={{ color: "rgba(255,255,255,0.25)" }} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>Inactiva</span>
              </div>
            )}
          </div>
        </div>
        {canEdit && (
          <button
            onClick={() => onEdit(store)}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/10"
            style={{ border: "1px solid var(--td-panel-border)", color: "var(--td-icon-inactive)" }}
          >
            <Edit2 size={13} />
          </button>
        )}
      </div>

      {/* Details */}
      {(store.address || store.phone || store.email) && (
        <div className="flex flex-col gap-1.5 pt-1" style={{ borderTop: "1px solid var(--td-panel-border)" }}>
          {store.address && (
            <div className="flex items-center gap-2">
              <MapPin size={11} style={{ color: "rgba(255,255,255,0.25)" }} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{store.address}</span>
            </div>
          )}
          {store.phone && (
            <div className="flex items-center gap-2">
              <Phone size={11} style={{ color: "rgba(255,255,255,0.25)" }} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{store.phone}</span>
            </div>
          )}
          {store.email && (
            <div className="flex items-center gap-2">
              <Mail size={11} style={{ color: "rgba(255,255,255,0.25)" }} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{store.email}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function StoresPage() {
  const { user } = useAuth();
  const { refreshStores } = useActiveStore();
  const [stores, setStores] = useState<ApiStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalStore, setModalStore] = useState<ApiStore | null>(null);
  const [showModal, setShowModal] = useState(false);

  const companyId = user?.company_id;
  // Permisos: solo admin puede crear/editar tiendas y ver TODAS las sucursales.
  // Gerente y cajero solo VEN su tienda asignada — no pueden ver datos de otras
  // sucursales desde esta pantalla (cambio QA Web 5: el gerente veía todas).
  const isAdminUser = user?.roles?.some(r => ["admin", "super_admin", "owner", "dueño"].includes(r.toLowerCase())) ?? false;
  const canEditStores = isAdminUser; // solo admin
  const canSeeAllStores = isAdminUser; // solo admin; gerente y cajero ven solo la suya

  async function load() {
    setLoading(true);
    try {
      const list = await getStores();
      // Cajero solo ve SU tienda asignada. Sin store_id retornamos lista vacía
      // (caso defensivo: admin sin tienda asignada vería todas porque canSeeAllStores=true).
      const filtered = canSeeAllStores
        ? list
        : list.filter(s => user?.store_id != null && s.id === user.store_id);
      setStores(filtered);
    } catch {
      toast.error("Error al cargar tiendas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function handleSaved(saved: ApiStore) {
    setStores(prev => {
      const idx = prev.findIndex(s => s.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    void refreshStores();
    setShowModal(false);
    setModalStore(null);
  }

  function openNew() {
    setModalStore(null);
    setShowModal(true);
  }

  function openEdit(store: ApiStore) {
    setModalStore(store);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setModalStore(null);
  }

  return (
    <div className="min-h-screen app-bg p-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Store size={16} style={{ color: "rgba(255,255,255,0.25)" }} />
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, fontWeight: 500 }}>Configuración</span>
          </div>
          <h1 style={{ color: "rgba(255,255,255,0.85)", fontSize: 24, fontWeight: 700 }}>Tiendas</h1>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginTop: 4 }}>
            {stores.length} {stores.length === 1 ? "tienda registrada" : "tiendas registradas"}
          </p>
        </div>

        {companyId && canEditStores && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #BB1100 0%, #FF3322 100%)", color: "#fff" }}
          >
            <Plus size={16} />
            Nueva Tienda
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center gap-3 py-16 justify-center">
          <Loader2 size={22} className="animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Cargando tiendas...</span>
        </div>
      ) : stores.length === 0 ? (
        <div
          className="glass-dark rounded-2xl p-10 flex flex-col items-center gap-4 text-center"
          style={{ border: `1px solid ${RED_BRD}`, maxWidth: 400 }}
        >
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: RED_DIM, border: `1px solid ${RED_BRD}` }}>
            <Store size={26} style={{ color: RED }} />
          </div>
          <div>
            <div style={{ color: "rgba(255,255,255,0.8)", fontWeight: 600, fontSize: 16 }}>
              Sin tiendas aún
            </div>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
              Crea tu primera tienda o sucursal para poder configurar el sistema.
            </p>
          </div>
          {companyId && canEditStores && (
            <button
              onClick={openNew}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm"
              style={{ background: "linear-gradient(135deg, #BB1100 0%, #FF3322 100%)", color: "#fff" }}
            >
              <Plus size={15} />
              Crear primera tienda
            </button>
          )}
          {!companyId && (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
              Tu usuario no tiene empresa asignada — contacta al superadmin.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {stores.map(s => (
            <StoreCard key={s.id} store={s} onEdit={openEdit} canEdit={canEditStores} />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <StoreModal
          store={modalStore}
          companyId={companyId}
          onSave={handleSaved}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
