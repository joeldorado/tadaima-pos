import { Loader2, Save } from "lucide-react";

/**
 * Piezas compartidas de los paneles del Catálogo Online (Control del Sistema).
 */

export const GLASS: React.CSSProperties = {
  background: "var(--td-panel-bg)",
  backdropFilter: "blur(28px) saturate(160%)",
  WebkitBackdropFilter: "blur(28px) saturate(160%)",
  border: "1px solid var(--td-panel-border)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)",
};

interface PanelCardProps {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export function PanelCard({ icon, iconColor, title, subtitle, children }: PanelCardProps) {
  return (
    <div className="p-8 rounded-[32px]" style={GLASS}>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center" style={{ color: iconColor }}>
          {icon}
        </div>
        <div>
          <h2 className="text-base font-black text-white uppercase tracking-[0.1em]">{title}</h2>
          <p className="text-[9px] font-black uppercase text-white/20 tracking-widest mt-0.5">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function PanelLoader() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={24} className="animate-spin text-white/20" />
    </div>
  );
}

interface SaveButtonProps {
  saving: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
  tone?: "red" | "green";
}

export function SaveButton({ saving, disabled, onClick, label, tone = "red" }: SaveButtonProps) {
  const bg = tone === "green"
    ? { background: "linear-gradient(135deg, #047857 0%, #10B981 100%)", boxShadow: "0 0 24px rgba(16,185,129,0.2)" }
    : { background: "linear-gradient(135deg, #BB1100 0%, #E0221A 100%)", boxShadow: "0 0 24px rgba(224,34,26,0.25)" };
  return (
    <button
      onClick={onClick}
      disabled={disabled || saving}
      className="flex items-center gap-3 px-8 py-3.5 rounded-2xl font-black uppercase tracking-widest text-[10px] text-white transition-all disabled:opacity-50"
      style={bg}
    >
      {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
      {label}
    </button>
  );
}
