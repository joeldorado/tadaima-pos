import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search, Mail, Phone, MapPin, History,
  User, UserPlus, Star, Zap, Award,
  ChevronRight, X, Users, Loader2, Save, Edit2, RefreshCw, BadgeCheck
} from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  createCustomer,
  updateCustomer,
  searchExternalCustomers,
  refreshMember,
  type Customer,
  type ExternalCardLookup,
} from "@tadaima/api";
import { useQueryClient } from "@tanstack/react-query";
import { useCustomersQuery } from "@/hooks/queries/useCustomers";
import { queryKeys } from "@/lib/queryKeys";
import { isValidEmail, isValidPhone } from "@/lib/validation";

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

/** Color del estatus de socio Tadaima (activo/inactivo/sin sincronizar). */
function socioStatusColor(status?: string | null): string {
  if (!status) return "#9CA3AF";                                   // sin sincronizar
  return status.toUpperCase() === "ACTIVO" ? "#00CC66" : "#FF4422"; // activo / inactivo
}

/** True si la vigencia ya pasó (solo informativo en la ficha). */
function isExpired(date?: string | null): boolean {
  if (!date) return false;
  const d = new Date(date);
  return !isNaN(d.getTime()) && d < new Date(new Date().toDateString());
}

/** "Hace 5 min" para member_synced_at. */
function formatSync(iso?: string | null): string {
  if (!iso) return "Nunca";
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "Nunca";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1)  return "Hace un momento";
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `Hace ${hrs} h`;
  return `Hace ${Math.floor(hrs / 24)} d`;
}

/** Badge de socio Tadaima con color por estatus. Concepto APARTE del tier de puntos. */
function SocioBadge({ status, size = "sm" }: { status?: string | null | undefined; size?: "sm" | "md" }) {
  const color = socioStatusColor(status);
  const label = !status
    ? "Socio Tadaima"
    : status.toUpperCase() === "ACTIVO" ? "Socio · Activo" : "Socio · Inactivo";
  const pad = size === "md" ? "px-3 py-1 text-[10px]" : "px-2 py-0.5 text-[8px]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-black uppercase tracking-widest ${pad}`}
      style={{ background: `${color}1a`, color, border: `1px solid ${color}55` }}
    >
      <BadgeCheck size={size === "md" ? 12 : 9} />
      {label}
    </span>
  );
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
  const [saving, setSaving]           = useState(false);
  const [search, setSearch]           = useState("");
  const [selectedId, setSelectedId]   = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm]               = useState<EditingCustomer>(EMPTY_FORM);
  const [extResults, setExtResults]   = useState<ExternalCardLookup[]>([]);
  const [addingExt, setAddingExt]     = useState<string | null>(null);
  const [filterMode, setFilterMode]   = useState<"all" | "socios" | "locales">("all");
  const [refreshingMember, setRefreshingMember] = useState(false);

  const queryClient = useQueryClient();
  const customersQuery = useCustomersQuery();
  const customers: Customer[] = customersQuery.data?.data ?? [];
  const loading = customersQuery.isPending;

  useEffect(() => {
    if (customersQuery.error) toast.error("Error al cargar clientes");
  }, [customersQuery.error]);

  useEffect(() => {
    const first = customers[0];
    if (selectedId === null && first) setSelectedId(first.id);
  }, [customers, selectedId]);

  const invalidateCustomers = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.customers.all }),
    [queryClient]
  );

  // Refresca el estatus del socio desde Supabase al abrir su ficha (Supabase y
  // la BD local están desconectados; así no se queda con un estatus viejo).
  useEffect(() => {
    if (selectedId == null) return;
    const c = customers.find(x => x.id === selectedId);
    if (!c?.external_member_id) return;
    let cancelled = false;
    void (async () => {
      try {
        await refreshMember(selectedId);
        if (!cancelled) void invalidateCustomers();
      } catch { /* deja el snapshot en cache si Supabase no responde */ }
    })();
    return () => { cancelled = true; };
    // Un refresh por apertura de ficha. customers se lee al disparar, no en deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const handleRefreshMember = useCallback(async (id: number) => {
    setRefreshingMember(true);
    try {
      await refreshMember(id);
      void invalidateCustomers();
      toast.success("Estatus de socio actualizado");
    } catch {
      toast.error("No se pudo actualizar el estatus (Supabase)");
    } finally {
      setRefreshingMember(false);
    }
  }, [invalidateCustomers]);

  // Validación inline (Joel 2026-06-12): label rojo bajo el campo en cuanto
  // el dato es inválido — mismo regex compartido que Sucursales/Usuarios.
  const phoneError = form.phone.trim() && !isValidPhone(form.phone)
    ? "Teléfono inválido — deben ser 10 dígitos (ej. 55 1234 5678)" : null;
  const emailError = form.email.trim() && !isValidEmail(form.email)
    ? "Correo inválido (ej. cliente@correo.com)" : null;

  // ── Guardar (crear o actualizar) ───────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    if (phoneError || emailError) {
      toast.error(phoneError ?? emailError ?? "");
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
        toast.success("Cliente actualizado");
      } else {
        saved = await createCustomer(payload);
        toast.success("Cliente registrado");
      }
      void invalidateCustomers();

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
    customers.filter(c => {
      const q = search.toLowerCase();
      const matchesSearch =
        c.name.toLowerCase().includes(q) ||
        (c.email?.toLowerCase().includes(q)) ||
        (c.phone?.includes(search)) ||
        (c.external_member_id?.toLowerCase().includes(q));
      if (!matchesSearch) return false;
      if (filterMode === "socios")  return !!c.external_member_id;
      if (filterMode === "locales") return !c.external_member_id;
      return true;
    }),
    [customers, search, filterMode]
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
        // OJO: ext.nivel ("b") es el nivel de membresía, NO el tier de puntos.
        // Mandarlo como loyalty_tier reventaba el enum del backend (422).
        member_status:      ext.estatus  ?? undefined,
        member_level:       ext.nivel    ?? undefined,
        member_expires_at:  ext.vigencia ?? undefined,
      });
      void invalidateCustomers();
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
                { label: "Socios", val: customers.filter(c => c.external_member_id).length, icon: BadgeCheck, color: "#00CC66" },
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

            {/* Filtro: socios Tadaima vs clientes locales (para que el cajero distinga) */}
            <div className="flex gap-2">
              {([
                { key: "all",     label: "Todos" },
                { key: "socios",  label: "Socios Tadaima" },
                { key: "locales", label: "Clientes locales" },
              ] as const).map(chip => {
                const active = filterMode === chip.key;
                return (
                  <button
                    key={chip.key}
                    onClick={() => setFilterMode(chip.key)}
                    className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all"
                    style={active
                      ? { background: "linear-gradient(135deg,#CC2200,#FF4422)", color: "#fff", border: "1px solid rgba(255,120,90,0.3)" }
                      : { background: "var(--td-input-bg)", color: "var(--td-text-md)", border: "1px solid var(--td-input-border)" }}
                  >
                    {chip.label}
                  </button>
                );
              })}
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
                          {ext.estatus && <div className="mt-1.5"><SocioBadge status={ext.estatus} /></div>}
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
                    {c.external_member_id && (
                      <div className="mt-1.5"><SocioBadge status={c.member_status} /></div>
                    )}
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

                {/* Socio Tadaima — estatus en vivo (concepto APARTE de los puntos) */}
                {selected.external_member_id && (
                  <div
                    className="p-6 rounded-[32px] border space-y-4"
                    style={{
                      borderColor: `${socioStatusColor(selected.member_status)}40`,
                      background: `${socioStatusColor(selected.member_status)}0d`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <SocioBadge status={selected.member_status} size="md" />
                      <button
                        onClick={() => void handleRefreshMember(selected.id)}
                        disabled={refreshingMember}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/10 text-white/50 hover:text-white hover:bg-white/5 transition-all disabled:opacity-40 shrink-0"
                      >
                        <RefreshCw size={12} className={refreshingMember ? "animate-spin" : ""} />
                        {refreshingMember ? "..." : "Actualizar"}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-1">ID Socio</p>
                        <p className="text-xs font-bold text-white truncate">{selected.external_member_id}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-1">Nivel membresía</p>
                        <p className="text-xs font-bold text-white uppercase">{selected.member_level ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-1">Vigencia</p>
                        <p className="text-xs font-bold truncate" style={{ color: isExpired(selected.member_expires_at) ? "#FF4422" : "#fff" }}>
                          {selected.member_expires_at ?? "Sin dato"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-1">Últ. sincronización</p>
                        <p className="text-xs font-bold text-white/70 truncate">{formatSync(selected.member_synced_at)}</p>
                      </div>
                    </div>
                    {(selected.member_status ?? "").toUpperCase() !== "ACTIVO" && (
                      <p className="text-[10px] font-bold" style={{ color: "#FF4422" }}>
                        Socio inactivo — en Caja se cobra precio normal (sin descuento de socio).
                      </p>
                    )}
                  </div>
                )}

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
                    style={{ ...T.input, ...(phoneError ? { borderColor: "rgba(248,113,113,0.7)" } : {}) }}
                  />
                  {phoneError && (
                    <p className="text-[10px] font-bold text-red-400 ml-4">{phoneError}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-4">Correo Electrónico</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="cliente@correo.com"
                    className="w-full px-6 py-4 rounded-3xl outline-none border transition-all font-bold text-sm"
                    style={{ ...T.input, ...(emailError ? { borderColor: "rgba(248,113,113,0.7)" } : {}) }}
                  />
                  {emailError && (
                    <p className="text-[10px] font-bold text-red-400 ml-4">{emailError}</p>
                  )}
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
