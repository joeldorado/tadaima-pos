import { useState } from "react";
import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, Mail, MessageSquare, RefreshCw } from "lucide-react";
import { listUsLeads } from "@tadaima/api";
import type { UsLeadSource } from "@tadaima/api";
import { queryKeys } from "@/lib/queryKeys";

const cardStyle: CSSProperties = {
  background: "var(--td-card-bg)",
  border: "1px solid var(--td-card-border)",
  borderRadius: 16,
  padding: 16,
};

const FILTER_CHIPS: { value: UsLeadSource | ""; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "newsletter", label: "Newsletter" },
  { value: "contact", label: "Contacto" },
];

const SOURCE_META: Record<UsLeadSource, { label: string; color: string; bg: string }> = {
  newsletter: { label: "Newsletter", color: "#38BDF8", bg: "rgba(0,136,203,0.12)" },
  contact:    { label: "Contacto",   color: "#34D399", bg: "rgba(16,185,129,0.12)" },
};

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

/**
 * TadaimaUS · Leads — bandeja del "We hear you! / Sign Up" (newsletter, solo
 * email) y del formulario de contacto (nombre + mensaje). Solo lectura en v1;
 * el correo de welcome se manda después.
 */
export function LeadsPanel() {
  const [source, setSource] = useState<UsLeadSource | "">("");

  const leadsQuery = useQuery({
    queryKey: queryKeys.usStore.leads({ source }),
    queryFn: () => listUsLeads(source ? { source } : {}),
    retry: 1,
  });
  const leads = leadsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTER_CHIPS.map((chip) => {
          const active = source === chip.value;
          return (
            <button
              key={chip.value}
              onClick={() => setSource(chip.value)}
              className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest cursor-pointer transition-all"
              style={active
                ? { background: "linear-gradient(135deg, #BB1100 0%, #E0221A 100%)", color: "#fff" }
                : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)" }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <div style={cardStyle}>
        <div className="flex items-center gap-2 mb-3">
          <Mail size={15} color="#38BDF8" />
          <p className="text-[10px] font-black uppercase tracking-widest m-0" style={{ color: "var(--td-text-md)" }}>
            Leads del sitio US · {leads.length}
          </p>
        </div>

        {leadsQuery.isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={18} className="animate-spin" style={{ color: "var(--td-text-lo)" }} />
          </div>
        ) : leadsQuery.isError ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <AlertTriangle size={24} color="#fbbf24" />
            <p className="text-xs font-bold text-center m-0" style={{ color: "var(--td-text-md)" }}>
              No se pudieron cargar los leads.
            </p>
            <button
              onClick={() => void leadsQuery.refetch()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest cursor-pointer"
              style={{ background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", color: "var(--td-text-md)" }}
            >
              <RefreshCw size={11} />
              Reintentar
            </button>
          </div>
        ) : leads.length === 0 ? (
          <p className="text-xs font-bold text-center py-10 m-0" style={{ color: "var(--td-text-lo)" }}>
            Aún no hay leads. Aparecen aquí cuando alguien se registra al
            newsletter o manda el formulario de contacto de la tienda US.
          </p>
        ) : (
          <div className="space-y-1.5">
            {leads.map((lead) => {
              const meta = SOURCE_META[lead.source];
              return (
                <div
                  key={lead.id}
                  className="flex items-start gap-3 p-2.5 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <span
                    className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg shrink-0 mt-0.5"
                    style={{ background: meta.bg, border: `1px solid ${meta.color}44`, color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  {/* Consentimiento explícito de marketing: sin este check NO
                      se le puede mandar publicidad a ese correo. */}
                  {lead.marketing_consent && (
                    <span
                      className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg shrink-0 mt-0.5 flex items-center gap-1"
                      style={{ background: "rgba(16,185,129,0.12)", border: "1px solid #34D39944", color: "#34D399" }}
                      title="Aceptó recibir correos de marketing"
                    >
                      <Check size={9} />
                      Opt-in
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black m-0 truncate" style={{ color: "var(--td-text-hi)" }}>
                      {lead.name ? `${lead.name} · ` : ""}
                      <a href={`mailto:${lead.email}`} style={{ color: "#38BDF8" }}>{lead.email}</a>
                    </p>
                    {lead.message && (
                      <p className="text-[11px] font-medium m-0 mt-1 flex items-start gap-1.5" style={{ color: "var(--td-text-md)", whiteSpace: "pre-wrap" }}>
                        <MessageSquare size={11} className="mt-0.5 shrink-0" style={{ color: "var(--td-text-lo)" }} />
                        {lead.message}
                      </p>
                    )}
                  </div>
                  <span className="text-[9px] font-bold shrink-0" style={{ color: "var(--td-text-lo)" }}>
                    {fmtDate(lead.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
