import { useState, useEffect } from "react";
import { getStores } from "@tadaima/api";
import type { Store } from "@tadaima/api";
import { Store as StoreIcon } from "lucide-react";

interface Props {
  value: number | "all";
  onChange: (v: number | "all") => void;
}

export function AdminStoreFilter({ value, onChange }: Props) {
  const [stores, setStores] = useState<Store[]>([]);

  useEffect(() => {
    getStores({ active: true }).then(setStores).catch(() => {});
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <StoreIcon size={13} style={{ color: "var(--td-text-lo)", flexShrink: 0 }} />
      <select
        value={value}
        onChange={e => onChange(e.target.value === "all" ? "all" : Number(e.target.value))}
        style={{
          background: "var(--td-input-bg)",
          border: "1px solid var(--td-input-border)",
          borderRadius: 16,
          color: value === "all" ? "var(--td-text-lo)" : "var(--td-text-hi)",
          outline: "none",
          padding: "10px 16px",
          fontSize: 11,
          fontWeight: 800,
          cursor: "pointer",
          minWidth: 160,
          appearance: "none" as const,
        }}
      >
        <option value="all">Todas las tiendas</option>
        {stores.map(s => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </div>
  );
}
