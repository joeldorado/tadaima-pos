import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search, Mail, Phone, MapPin, History,
  User, UserPlus, Star, Zap, Award,
  ChevronRight, X, Users, Loader2, Save, Edit2
} from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  searchExternalCustomers,
  type Customer,
  type ExternalCardLookup,
} from "@tadaima/api";

// ─── Paleta Tadaima ───────────────────────────────────────────────────────────
const T = {
  bgGrad: "var(--td-page-bg)",
  glass: {
    background: "var(--td-panel-bg)",
    backdropFilter: "blur(28px) saturate(160%)",
    WebkitBackdropFilter: "blur(28px) saturate(160%)",
    border: "1px solid var(--td-panel-border)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.04)",
  } as React.CSSProperties,
  textPrimary: "var(--td-text-hi)",
  textSecondary: "var(--td-text-md)",
  redBright: "#FF4422",
  btnRed: {
    background: "linear-gradient(135deg, #CC2200 0%, #FF4422 100%)",
    borderRadius: "9999px",
    border: "1px solid rgba(255,120,90,0.3)",
    boxShadow: "0 0 28px rgba(204,34,0,0.45), 0 6px 18px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,180,160,0.25)",
    color: "#ffffff",
  } as React.CSSProperties,
  input: {
    background: "var(--td-input-bg)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid var(--td-input-border)",
    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.08)",
    color: "var(--td-input-text)",
  } as React.CSSProperties,
  divider: "1px solid var(--td-divider)",
};

const TIER_COLORS: Record<string, string> = {
  Bronce:  "#CD7F32",
  Plata:   "#C0C0C0",
  Oro:     "#FFD700",
  Leyenda: "#FF4422",
};

/** Calcula tier a partir de puntos si el backend no lo envía */
function resolveTier(customer: Customer): string {
  if (customer.tier && customer.tier !== "Bronce") return customer.tier;
  const pts = customer.points ?? 0;
  if (pts >= 2000) return "Leyenda";
  if (pts >= 500)  return "Oro";
  if (pts >= 200)  return "Plata";
  return "Bronce";
}

type EditingCustomer = {
  id?: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

const EMPTY_FORM: EditingCustomer = { name: "", phone: "", email: "", address: "", notes: "" };

export function ClientsPage() {
  const [customers, setCustomers]     = useState<Customer[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [search, setSearch]           = useState("");
  const [selectedId, setSelectedId]   = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm]               = useState<EditingCustomer>(EMPTY_FORM);
  const [extResults, setExtResults]   = useState<ExternalCardLookup[]>([]);
  const [addingExt, setAddingExt]     = useState<string | null>(null);

  // ── Cargar clientes ────────────────────────────────────────────────────────
  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const paginated = await getCustomers();
      setCustomers(paginated.data);
      if (paginated.data.length > 0 && selectedId === null) {
        setSelectedId(paginated.data[0].id);
      }
    } catch {
      toast.error("Error al cargar clientes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchCustomers(); }, []);

  // ── Guardar (crear o actualizar) ───────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }

    const payload = {
      name:    form.name.trim(),
      phone:   form.phone.trim() || undefined,
      email:   form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      notes:   form.notes.trim() || undefined,
    };

    try {
      setSaving(true);
      let saved: Customer;

      if (form.id) {
        saved = await updateCustomer(form.id, payload);
        setCustomers(prev => prev.map(c => c.id === saved.id ? saved : c));
        toast.success("Cliente actualizado");
      } else {
        saved = await createCustomer(payload);
        setCustomers(prev => [saved, ...prev]);
        toast.success("Cliente registrado");
      }

      setSelectedId(saved.id);
      setIsModalOpen(false);
      setForm(EMPTY_FORM);
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : "Error al guardar cliente";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Abrir modal ────────────────────────────────────────────────────────────
  const openCreate = () => {
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const openEdit = (c: Customer) => {
    setForm({
      id:      c.id,
      name:    c.name,
      phone:   c.phone ?? "",
      email:   c.email ?? "",
      address: c.address ?? "",
      notes:   c.notes ?? "",
    });
    setIsModalOpen(true);
  };

  // ── Filtrado local ─────────────────────────────────────────────────────────
  const filtered = useMemo(() =>
    customers.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email?.toLowerCase().includes(search.toLowerCase())) ||
      (c.phone?.includes(search)) ||
      (c.external_member_id?.toLowerCase().includes(search.toLowerCase()))
    ),
    [customers, search]
  );

  // Supabase fallback cuando no hay resultados en POS
  useEffect(() => {
    setExtResults([]);
    if (!search.trim() || search.trim().length < 2 || filtered.length > 0) return;
    const t = setTimeout(async () => {
      const exts = await searchExternalCustomers(search.trim());
      setExtResults(exts);
    }, 400);
    return () => clearTimeout(t);
  }, [search, filtered.length]);

  const handleAddExtCustomer = useCallback(async (ext: ExternalCardLookup) => {
    setAddingExt(ext.external_member_id);
    try {
      const newCust = await createCustomer({
        name:               ext.name ?? ext.external_member_id,
        phone:              ext.phone ?? undefined,
        email:              ext.email || undefined,
        external_member_id: ext.external_member_id,
        loyalty_tier:       ext.nivel ?? undefined,
      });
      setCustomers(prev => [newCust, ...prev]);
      setSelectedId(newCust.id);
      setExtResults([]);
      setSearch("");
      toast.success(`Socio ${newCust.name} agregado`);
    } catch {
      toast.error("No se pudo agregar al socio");
    } finally {
      setAddingExt(null);
    }
  }, []);

  const selected = customers.find(c => c.id === selectedId);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col" style={{ background: T.bgGrad }}>

      {/* Navbar */}
      <header className="h-20 shrink-0 flex items-center justify-between px-8 z-20 relative" style={{ borderBottom: T.divider }}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 shadow-[0_0_20px_rgba(204,34,0,0.2)]">
            <Users size={24} style={{ color: T.redBright }} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2" style={{ color: T.textPrimary }}>
              GESTIÓN DE <span style={{ color: T.redBright }}>CLIENTES</span>
            </h1>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40" style={{ color: T.textSecondary }}>
              CRM & Programas de Lealtad Tadaima
            </p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-6 py-3 font-black text-[11px] uppercase tracking-widest transition-all hover:scale-105 active:scale-95 shadow-[0_0_25px_rgba(204,34,0,0.3)]"
          style={T.btnRed}
        >
          <UserPlus size={16} strokeWidth={3} />
          Registrar Cliente
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">

        {/* Panel izquierdo — lista */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-white/5">

          <div className="p-8 pb-4 space-y-6">
            {/* Buscador */}
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-red-500 transition-colors" size={18} />
              <input
                type="text"
                placeholder="Buscar por nombre, correo o teléfono..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-12 pr-4 py-4 rounded-[22px] outline-none border transition-all font-bold text-sm"
                style={T.input}
              />
            </div>

            {/* Stats */}
            <div className="flex gap-4 overflow-x-auto pb-2">
              {[
                { label: "Total",  val: customers.length, icon: Users, color: T.redBright },
                { label: "VIP",    val: customers.filter(c => resolveTier(c) === "Leyenda").length, icon: Star, color: "#FFD700" },
                { label: "Nuevos", val: customers.filter(c => new Date(c.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length, icon: Zap, color: "#00CC66" },
              ].map((s, i) => (
                <div key={i} className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3 shrink-0">
                  <s.icon size={14} style={{ color: s.color }} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{s.label}:</span>
                  <span className="text-xs font-black text-white">{s.val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-3">
            {loading ? (
              <div className="flex flex-col items-center justify-center p-20 gap-4">
                <Loader2 size={32} className="animate-spin text-red-500" />
                <p className="text-xs font-black uppercase tracking-widest text-white/20">Cargando clientes...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-10 gap-4">
                <Users size={40} className="text-white/10" />
                <p className="text-xs font-black uppercase tracking-widest text-white/20">
                  {search ? "Sin resultados en el POS" : "No hay clientes registrados"}
                </p>
                {extResults.length > 0 && (
                  <div className="w-full mt-2 space-y-2">
                    <p className="text-[9px] font-black text-red-400/70 uppercase tracking-widest text-center">Socios Tadaima</p>
                    {extResults.map(ext => (
                      <div
                        key={ext.external_member_id}
                        className="flex items-center gap-4 px-5 py-4 rounded-[20px] bg-white/[0.03] border border-red-500/15 hover:border-red-500/30 transition-all"
                      >
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-base font-black italic shrink-0"
                          style={{ background: "linear-gradient(135deg,#CC2200,#000)", border: "1px solid rgba(255,255,255,0.1)" }}>
                          {(ext.name ?? "?").charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-white truncate uppercase tracking-tight">{ext.name}</p>
                          <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">{ext.external_member_id}{ext.email ? ` · ${ext.email}` : ""}</p>
                        </div>
                        <button
                          type="button"
                          disabled={addingExt === ext.external_member_id}
                          onClick={() => handleAddExtCustomer(ext)}
                          className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider text-white transition-all disabled:opacity-50"
                          style={{ background: "linear-gradient(135deg,#CC2200,#FF4422)" }}
                        >
                          {addingExt === ext.external_member_id ? "..." : "Agregar"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : filtered.map(c => {
              const tier = resolveTier(c);
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`group p-5 rounded-[28px] cursor-pointer transition-all duration-300 border flex items-center gap-5 ${
                    selectedId === c.id
                      ? "bg-red-600/10 border-red-500/30 shadow-[0_8px_20px_rgba(204,34,0,0.15)]"
                      : "bg-white/[0.03] border-white/5 hover:bg-white/[0.06]"
                  }`}
                >
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-black italic shadow-lg shrink-0"
                    style={{ background: `linear-gradient(135deg, ${TIER_COLORS[tier] ?? "#555"}, #000)`, border: "1px solid rgba(255,255,255,0.1)" }}
                  >
                    {c.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-white truncate uppercase tracking-tight">{c.name}</p>
                    <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">{c.email ?? "Sin correo"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-white italic">{c.points} pts</p>
                    <div className="flex items-center justify-end gap-1.5 mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: TIER_COLORS[tier] ?? "#555" }} />
                      <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: TIER_COLORS[tier] ?? "#555" }}>{tier}</p>
                    </div>
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${selectedId === c.id ? "bg-red-500 text-white" : "bg-white/5 text-white/10 group-hover:text-white/30"}`}>
                    <ChevronRight size={16} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Panel derecho — detalle */}
        <div className="w-[450px] shrink-0 bg-white/[0.02] backdrop-blur-3xl p-10 overflow-y-auto space-y-10">
          {selected ? (() => {
            const tier = resolveTier(selected);
            return (
              <>
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-6">
                    <div
                      className="w-32 h-32 rounded-[40px] flex items-center justify-center text-4xl font-black italic shadow-2xl"
                      style={{ background: `linear-gradient(135deg, ${TIER_COLORS[tier] ?? "#555"}, #000)`, border: "2px solid rgba(255,255,255,0.1)" }}
                    >
                      {selected.name.charAt(0)}
                    </div>
                    <div className="absolute -bottom-2 -right-2 w-12 h-12 rounded-2xl bg-[#0d0d1a] border border-white/10 flex items-center justify-center shadow-xl">
                      <Award size={24} style={{ color: TIER_COLORS[tier] ?? "#555" }} />
                    </div>
                  </div>
                  <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-1">{selected.name}</h2>
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/40">
                      ID: {selected.id}
                    </span>
                    <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Nivel {tier}</span>
                  </div>
                </div>

                {/* Puntos */}
                <div className="p-8 rounded-[40px] border border-white/5 bg-gradient-to-br from-white/[0.04] to-transparent space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Star size={16} className="text-yellow-500 fill-yellow-500" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Tadaima Points</span>
                    </div>
                    <span className="text-xl font-black italic text-white">
                      {selected.points} <span className="text-[10px] not-italic text-white/20 uppercase tracking-widest ml-1">pts</span>
                    </span>
                  </div>
                  <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-red-600 rounded-full shadow-[0_0_15px_rgba(220,38,38,0.5)]" style={{ width: `${Math.min((selected.points / 2000) * 100, 100)}%` }} />
                  </div>
                  <p className="text-[10px] font-black text-white/20 uppercase tracking-widest text-center">
                    Faltan {Math.max(2000 - selected.points, 0)} pts para el siguiente nivel
                  </p>
                </div>

                {/* Info */}
                <div className="grid grid-cols-1 gap-4">
                  {[
                    { label: "Correo Electrónico", val: selected.email ?? "No registrado", icon: Mail },
                    { label: "Teléfono Móvil",     val: selected.phone ?? "No registrado", icon: Phone },
                    { label: "Dirección",           val: selected.address ?? "No registrado", icon: MapPin },
                    { label: "Notas",               val: selected.notes ?? "Sin notas adicionales", icon: History },
                  ].map((d, i) => (
                    <div key={i} className="flex items-center gap-5 p-5 rounded-[28px] bg-white/[0.02] border border-white/5 group hover:bg-white/[0.05] transition-all">
                      <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 group-hover:text-red-500 transition-colors">
                        <d.icon size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-1">{d.label}</p>
                        <p className="text-xs font-bold text-white truncate">{d.val}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => openEdit(selected)}
                  className="w-full py-5 rounded-[24px] font-black uppercase tracking-widest text-[11px] transition-all border border-white/10 text-white/40 hover:bg-white/5 hover:text-white flex items-center justify-center gap-3"
                >
                  <Edit2 size={16} /> Editar Información
                </button>
              </>
            );
          })() : (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
              <User size={48} className="text-white/5" />
              <p className="text-xs font-black uppercase tracking-widest text-white/20">Selecciona un cliente para ver detalles</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal crear/editar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute inset-0 bg-[#07070a]/90 backdrop-blur-2xl"
            onClick={() => setIsModalOpen(false)}
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="relative w-full max-w-2xl overflow-hidden rounded-[48px] border border-white/10 flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.8)]"
            style={T.glass}
          >
            {/* Header modal */}
            <div className="px-10 py-8 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-red-600/10 border border-red-500/20 flex items-center justify-center">
                  <UserPlus size={28} className="text-red-500" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white uppercase tracking-tighter">
                    {form.id ? "Editar Cliente" : "Nuevo Cliente"}
                  </h2>
                  <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] mt-1">Alta en Programa de Lealtad</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-white/20 hover:text-white">
                <X size={24} />
              </button>
            </div>

            {/* Campos */}
            <div className="p-10 space-y-6 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-4">Nombre Completo *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej. Juan Pérez"
                  className="w-full px-6 py-4 rounded-3xl outline-none border transition-all font-bold text-sm"
                  style={T.input}
                />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-4">Teléfono</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+52..."
                    className="w-full px-6 py-4 rounded-3xl outline-none border transition-all font-bold text-sm"
                    style={T.input}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-4">Correo Electrónico</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="cliente@correo.com"
                    className="w-full px-6 py-4 rounded-3xl outline-none border transition-all font-bold text-sm"
                    style={T.input}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-4">Dirección</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="Calle, Número, Colonia..."
                  className="w-full px-6 py-4 rounded-3xl outline-none border transition-all font-bold text-sm"
                  style={T.input}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-4">Notas / Observaciones</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Datos adicionales del cliente..."
                  className="w-full px-6 py-4 rounded-3xl outline-none border transition-all font-bold text-sm min-h-[100px]"
                  style={T.input}
                />
              </div>
            </div>

            {/* Footer modal */}
            <div className="px-10 py-8 border-t border-white/5 flex gap-6 bg-white/[0.02]">
              <button
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-5 rounded-[24px] font-black uppercase tracking-widest text-[11px] border border-white/10 text-white/30 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={() => { void handleSave(); }}
                disabled={saving}
                className="flex-[1.5] py-5 rounded-[24px] font-black uppercase tracking-widest text-[11px] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                style={T.btnRed}
              >
                <Save size={16} />
                {saving ? "Guardando..." : form.id ? "Actualizar Datos" : "Guardar Cliente"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
