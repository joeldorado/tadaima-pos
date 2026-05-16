import { useEffect, useRef, useState } from "react";
import { X, Camera, AlertCircle, Loader2 } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";

interface CameraScannerModalProps {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}

const READER_ID = "tadaima-camera-scanner-reader";

export function CameraScannerModal({ open, onClose, onDetected }: CameraScannerModalProps) {
  const qrRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setError(null);
    setStarting(true);

    const start = async () => {
      try {
        const qr = new Html5Qrcode(READER_ID, { verbose: false });
        qrRef.current = qr;
        await qr.start(
          { facingMode: "environment" },
          { fps: 12, qrbox: { width: 260, height: 260 } },
          (decodedText) => {
            if (cancelled) return;
            qr.stop()
              .catch(() => undefined)
              .finally(() => {
                qrRef.current = null;
                onDetected(decodedText.trim());
              });
          },
          () => {
            // frames sin código — silencioso
          },
        );
        if (cancelled) {
          await qr.stop().catch(() => undefined);
          qrRef.current = null;
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "No se pudo iniciar la cámara";
        setError(msg);
      } finally {
        if (!cancelled) setStarting(false);
      }
    };

    void start();

    return () => {
      cancelled = true;
      const qr = qrRef.current;
      if (qr) {
        qr.stop()
          .catch(() => undefined)
          .finally(() => {
            qrRef.current = null;
          });
      }
    };
  }, [open, onDetected]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#E0221A]/10 border border-[#E0221A]/20 flex items-center justify-center">
              <Camera size={16} className="text-[#E0221A]" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">Escanear código</h3>
              <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">
                QR · Código de barras
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} className="text-white/60" />
          </button>
        </div>

        <div className="relative aspect-square bg-black">
          <div id={READER_ID} className="absolute inset-0" />
          {starting && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/50">
              <Loader2 size={28} className="animate-spin" />
              <p className="text-xs font-bold uppercase tracking-widest">Iniciando cámara…</p>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <AlertCircle size={32} className="text-red-400" />
              <p className="text-sm font-bold text-white">No se pudo acceder a la cámara</p>
              <p className="text-xs text-white/50">{error}</p>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-white/10">
          <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest text-center">
            Apunta al folio o al SKU
          </p>
        </div>
      </div>
    </div>
  );
}
