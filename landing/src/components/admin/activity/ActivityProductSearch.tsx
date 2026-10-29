import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Package, Search, X } from "lucide-react";
import { getProducts, type Product } from "@tadaima/api";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { productTypeLabel } from "@/lib/activityFormat";
import { inputStyle, labelClass } from "./activityUi";

interface Props {
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}

const MAX_SELECTED = 10;

/**
 * Buscador de producto para fijar el historial a uno o varios productos.
 * Escribe nombre, SKU o código → elige → queda como chip. Los ids que vienen
 * de la URL se resuelven a nombre con `GET /products?ids=`.
 */
export function ActivityProductSearch({ selectedIds, onChange }: Props) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const debounced = useDebouncedValue(text.trim(), 300);
  const boxRef = useRef<HTMLDivElement>(null);

  const resultsQuery = useQuery({
    queryKey: ["activity", "product-search", debounced],
    queryFn: () => getProducts({ search: debounced, per_page: 8 }),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });

  const idsKey = useMemo(() => [...selectedIds].sort((a, b) => a - b).join(","), [selectedIds]);
  const selectedQuery = useQuery({
    queryKey: ["activity", "product-lookup", idsKey],
    queryFn: () => getProducts({ ids: idsKey, per_page: MAX_SELECTED }),
    enabled: idsKey.length > 0,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const results = (resultsQuery.data?.data ?? []).filter((p) => !selectedIds.includes(p.id));
  const selectedById = new Map<number, Product>((selectedQuery.data?.data ?? []).map((p) => [p.id, p]));

  const pick = (p: Product) => {
    if (selectedIds.length >= MAX_SELECTED) return;
    onChange([...selectedIds, p.id]);
    setText("");
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-1" ref={boxRef}>
      <span className={labelClass} style={{ color: "var(--td-text-lo)" }}>Producto</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {selectedIds.map((id) => {
          const p = selectedById.get(id);
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full pl-2 pr-1 py-0.5 text-[10px] font-black"
              style={{ background: "rgba(167,139,250,0.14)", border: "1px solid rgba(167,139,250,0.35)", color: "#C4B5FD" }}
              title={p ? `${p.name} · ${p.sku}` : `Producto #${id}`}
            >
              <Package size={10} />
              <span className="max-w-[180px] truncate">{p?.name ?? (selectedQuery.isLoading ? "…" : `#${id}`)}</span>
              <button
                type="button"
                aria-label="Quitar producto"
                onClick={() => onChange(selectedIds.filter((x) => x !== id))}
                className="rounded-full p-0.5 hover:bg-white/10"
              >
                <X size={10} />
              </button>
            </span>
          );
        })}
        <div className="relative">
          <Search size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--td-text-lo)", pointerEvents: "none" }} />
          <input
            type="text"
            value={text}
            onChange={(e) => { setText(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={selectedIds.length ? "Agregar otro…" : "Nombre, SKU o código…"}
            aria-label="Buscar producto"
            disabled={selectedIds.length >= MAX_SELECTED}
            style={{ ...inputStyle, paddingLeft: 24, minWidth: 220 }}
          />
          {resultsQuery.isFetching && (
            <Loader2 size={12} className="animate-spin" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "var(--td-text-lo)" }} />
          )}
          {open && debounced.length >= 2 && (
            <div
              className="absolute z-30 mt-1 w-[360px] max-h-72 overflow-auto rounded-xl shadow-2xl"
              style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)" }}
              role="listbox"
            >
              {results.length === 0 && !resultsQuery.isFetching ? (
                <p className="px-3 py-3 text-[11px]" style={{ color: "var(--td-text-lo)" }}>Sin resultados para «{debounced}»</p>
              ) : (
                results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => pick(p)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.04]"
                    style={{ borderBottom: "1px solid var(--td-divider)" }}
                  >
                    <Package size={14} style={{ color: "#A78BFA", flexShrink: 0 }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-black" style={{ color: "var(--td-text-hi)" }}>{p.name}</span>
                      <span className="block truncate font-mono text-[10px]" style={{ color: "var(--td-text-lo)" }}>
                        {p.sku}{p.barcode && p.barcode !== p.sku ? ` · ${p.barcode}` : ""}
                      </span>
                    </span>
                    {productTypeLabel((p as { product_type?: string }).product_type) && (
                      <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>
                        {productTypeLabel((p as { product_type?: string }).product_type)}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
