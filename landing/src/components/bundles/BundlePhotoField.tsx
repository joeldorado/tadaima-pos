import { useState } from "react";
import { Camera, Upload } from "lucide-react";
import { toast } from "sonner";
import { GREEN, SOFT_BG, TEXT_MD } from "@/components/promos/promoTokens";

interface BundlePhotoFieldProps {
  photoUrl: string | null;
  onPhoto: (file: File | null) => void;
  size?: number;
}

const MAX_PHOTO_MB = 8;

/** Foto del paquete: arrastrar o tocar (mismo patrón del alta de producto). */
export function BundlePhotoField({ photoUrl, onPhoto, size = 144 }: BundlePhotoFieldProps) {
  const [dragging, setDragging] = useState(false);

  const apply = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Elige un archivo de imagen (JPG, PNG…)."); return; }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) { toast.error(`La foto pesa más de ${MAX_PHOTO_MB} MB. Elige una más ligera.`); return; }
    onPhoto(file);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="group relative flex shrink-0 flex-col items-center justify-center overflow-hidden rounded-[28px] border-2 border-dashed transition-transform focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-emerald-400"
        style={{ width: size, height: size, background: SOFT_BG, borderColor: dragging ? GREEN : "var(--td-card-border)", transform: dragging ? "scale(1.03)" : undefined }}
        onDragOver={event => { event.preventDefault(); if (!dragging) setDragging(true); }}
        onDragLeave={event => { event.preventDefault(); setDragging(false); }}
        onDrop={event => { event.preventDefault(); setDragging(false); apply(event.dataTransfer.files?.[0]); }}
      >
        {photoUrl ? (
          <>
            <img src={photoUrl} alt="Foto del paquete" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55 opacity-0 transition-opacity group-hover:opacity-100">
              <Camera size={24} className="text-white" aria-hidden />
              <span className="text-[11px] font-black uppercase tracking-widest text-white">Cambiar</span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2" style={{ color: TEXT_MD }}>
            <Upload size={22} aria-hidden />
            <span className="text-center text-[12px] font-black uppercase tracking-wider">Subir foto</span>
            <span className="text-[11px] font-semibold">Arrastra o toca</span>
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          aria-label="Foto del paquete"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          style={{ fontSize: 0 }}
          onChange={event => { apply(event.target.files?.[0]); event.target.value = ""; }}
        />
      </div>
      {photoUrl && (
        <button type="button" onClick={() => onPhoto(null)} className="text-[13px] font-bold underline" style={{ color: TEXT_MD, cursor: "pointer", border: "none", background: "transparent" }}>
          Quitar foto
        </button>
      )}
    </div>
  );
}
