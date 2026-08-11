import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus, Loader2, PackagePlus, X } from "lucide-react";
import { createUsListing, uploadUsImage } from "@tadaima/api";
import type { UsCategory } from "@tadaima/api";
import { queryKeys } from "@/lib/queryKeys";
import { errMsg } from "./usFormat";

const inputStyle: CSSProperties = {
  background: "var(--td-input-bg)",
  border: "1px solid var(--td-input-border)",
  borderRadius: 10,
  color: "var(--td-input-text)",
  outline: "none",
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 700,
  width: "100%",
  boxSizing: "border-box",
};

const US_CATEGORY_OPTIONS: { value: UsCategory; label: string }[] = [
  { value: "figures", label: "Figuras" },
  { value: "manga", label: "Manga" },
  { value: "tcg", label: "TCG" },
  { value: "other", label: "Otro" },
];

interface CustomListingModalProps {
  onClose: () => void;
}

/**
 * TadaimaUS · alta DUMMY — producto que solo existe en la tienda US (sin
 * producto POS detrás): nombre + precio USD + categoría + foto (archivo vía
 * /us/uploads o URL pegada). Pensado para Pier: lo mínimo indispensable.
 */
export function CustomListingModal({ onClose }: CustomListingModalProps) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [category, setCategory] = useState<UsCategory>("other");
  const [imageUrl, setImageUrl] = useState("");
  const [isUploading, setUploading] = useState(false);

  const createMutation = useMutation({
    mutationFn: () =>
      createUsListing({
        product_id: null,
        name_en: name.trim(),
        price_usd: Math.round(Number(priceInput) * 100) / 100,
        category,
        ...(imageUrl.trim() ? { image_url: imageUrl.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success("Producto creado en la tienda US");
      void qc.invalidateQueries({ queryKey: queryKeys.usStore.all });
      onClose();
    },
    onError: (e) => toast.error(errMsg(e, "No se pudo crear el producto")),
  });

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadUsImage(file);
      setImageUrl(url);
      toast.success("Foto subida");
    } catch (e) {
      toast.error(errMsg(e, "No se pudo subir la foto"));
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    if (createMutation.isPending || isUploading) return;
    if (name.trim().length < 2) {
      toast.error("Captura el nombre del producto");
      return;
    }
    const price = Number(priceInput);
    if (!Number.isFinite(price) || price <= 0) {
      toast.error("Captura el precio en dólares (mayor a 0)");
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-md rounded-2xl p-5" style={{ background: "var(--td-panel-bg, #16161c)", border: "1px solid var(--td-panel-border, rgba(255,255,255,0.1))" }}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest m-0" style={{ color: "#38BDF8" }}>Producto dummy</p>
            <h3 className="text-sm font-black m-0 mt-1" style={{ color: "var(--td-text-hi)" }}>Crear producto solo-US</h3>
            <p className="text-[9px] font-bold m-0" style={{ color: "var(--td-text-lo)" }}>
              No toca el POS ni el inventario — vive solo en la tienda US.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg inline-flex items-center justify-center cursor-pointer shrink-0"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--td-text-md)" }}
          >
            <X size={13} />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-[9px] font-black uppercase tracking-widest block mb-1" style={{ color: "var(--td-text-lo)" }}>
              Nombre (inglés, obligatorio)
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Funko Pop Rengoku"
              autoFocus
              style={inputStyle}
            />
          </label>

          <label className="block">
            <span className="text-[9px] font-black uppercase tracking-widest block mb-1" style={{ color: "var(--td-text-lo)" }}>
              Precio en dólares (obligatorio)
            </span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="25.00"
              style={inputStyle}
            />
          </label>

          <label className="block">
            <span className="text-[9px] font-black uppercase tracking-widest block mb-1" style={{ color: "var(--td-text-lo)" }}>
              Categoría US
            </span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as UsCategory)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {US_CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <div>
            <span className="text-[9px] font-black uppercase tracking-widest block mb-1" style={{ color: "var(--td-text-lo)" }}>
              Foto (opcional)
            </span>
            <div className="flex items-center gap-2">
              <div className="w-14 h-14 rounded-lg overflow-hidden flex items-center justify-center shrink-0" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}>
                {imageUrl.trim() ? (
                  <img src={imageUrl} alt="Vista previa" className="w-full h-full object-cover" />
                ) : (
                  <ImagePlus size={16} style={{ color: "var(--td-text-lo)" }} />
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-50"
                  style={{ background: "rgba(0,136,203,0.15)", border: "1px solid rgba(0,136,203,0.4)", color: "#38BDF8" }}
                >
                  {isUploading ? <Loader2 size={11} className="animate-spin" /> : <ImagePlus size={11} />}
                  {isUploading ? "Subiendo…" : "Subir foto"}
                </button>
                <input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="…o pega la URL de una imagen"
                  style={{ ...inputStyle, padding: "6px 10px", fontSize: 10 }}
                />
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--td-text-md)" }}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={createMutation.isPending || isUploading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #0369A1 0%, #0088CB 100%)", color: "#fff" }}
          >
            {createMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <PackagePlus size={12} />}
            Crear producto
          </button>
        </div>
      </div>
    </div>
  );
}
