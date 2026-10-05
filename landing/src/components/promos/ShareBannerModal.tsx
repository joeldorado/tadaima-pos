import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { toBlob } from "html-to-image";
import { Share2, Download, MessageCircle, X, Loader2, ImageOff } from "lucide-react";
import {
  getLightPrice, getProductImageBase64, getProductPromotions, type ProductLight,
} from "@tadaima/api";
import { promoShortLabel } from "@/lib/promoLabel";
import type { LightPromo } from "@/lib/promoVigentes";
import { downloadBlob } from "@/lib/downloadFile";
import { promoDisplay } from "./promoDisplay";

// ─── Tokens visuales (convención de páginas glass) ────────────────────────────
const PANEL  = "var(--td-panel-bg)";
const BORDER = "1px solid var(--td-panel-border)";
const CARD_B = "1px solid var(--td-card-border)";
const SOFT   = "var(--td-surface-soft)";
const THI    = "var(--td-text-hi)";
const TMD    = "var(--td-text-md)";
const TLO    = "var(--td-text-lo)";
const GREEN  = "#34d399";

/** Carga el logo como data-URL (mismo patrón que loadTicketLogo del ticket). */
async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const resp = await fetch("/tadaima-logo.jpeg");
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Banner 1080×1350 (4:5) — el nodo que se exporta a PNG. Todo inline-style y
// solo imágenes data-URL (logo + foto vía /image-base64) para no taintear canvas.
// ══════════════════════════════════════════════════════════════════════════════
function PromoBanner({ product, promo, imgDataUrl, logoDataUrl, endsAt, nodeRef }: {
  product: ProductLight;
  promo: LightPromo;
  imgDataUrl: string | null;
  logoDataUrl: string | null;
  endsAt: string | null;
  nodeRef: React.RefObject<HTMLDivElement | null>;
}) {
  const price = getLightPrice(product, 1);
  const disp = promoDisplay(promo, price);
  const vigencia = endsAt
    ? `Válido hasta el ${new Date(endsAt).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}`
    : "Promoción por tiempo limitado";

  return (
    <div
      ref={nodeRef}
      style={{
        width: 1080, height: 1350, position: "relative", overflow: "hidden",
        background: "radial-gradient(1200px 800px at 20% -10%, #3a0a06 0%, #16090c 45%, #0a0a0f 100%)",
        fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif", color: "#fff",
        display: "flex", flexDirection: "column", alignItems: "center",
      }}
    >
      {/* Glow decorativo */}
      <div style={{ position: "absolute", top: -180, right: -180, width: 620, height: 620, borderRadius: "50%", background: "radial-gradient(circle, rgba(224,34,26,0.35) 0%, transparent 70%)" }} />
      <div style={{ position: "absolute", bottom: -220, left: -220, width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,68,34,0.18) 0%, transparent 70%)" }} />

      {/* Header: logo + wordmark */}
      <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 56, zIndex: 1 }}>
        {logoDataUrl && (
          <div style={{ width: 84, height: 84, borderRadius: 20, background: "#fff", padding: 8, boxShadow: "0 0 40px rgba(224,34,26,0.5)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            <img src={logoDataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
        )}
        <span style={{ fontSize: 52, fontWeight: 900, letterSpacing: "-0.02em" }}>Tadaima</span>
      </div>

      {/* Badge NxM gigante */}
      <div style={{ marginTop: 44, zIndex: 1, textAlign: "center" }}>
        <div style={{
          fontSize: Math.round(230 * disp.badgeScale), fontWeight: 900, lineHeight: 0.9, letterSpacing: "-0.04em",
          background: "linear-gradient(135deg, #FF3322 0%, #FFB199 100%)",
          WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
          textShadow: "0 0 80px rgba(255,51,34,0.25)",
        }}>
          {disp.badge}
        </div>
        <div style={{ marginTop: 8, fontSize: 30, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.2em", color: GREEN, padding: "0 60px" }}>
          {disp.sub}
        </div>
      </div>

      {/* Foto del producto */}
      <div style={{ marginTop: 48, zIndex: 1, width: 500, height: 500, borderRadius: 40, overflow: "hidden", background: "rgba(255,255,255,0.04)", border: "2px solid rgba(255,255,255,0.12)", boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 60px rgba(224,34,26,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {imgDataUrl
          ? <img src={imgDataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize: 120, fontWeight: 900, color: "rgba(255,255,255,0.15)" }}>Tadaima</span>}
      </div>

      {/* Nombre + precio */}
      <div style={{ marginTop: 44, zIndex: 1, textAlign: "center", padding: "0 80px" }}>
        <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1.1 }}>{product.name}</div>
        <div style={{ marginTop: 18, fontSize: 36, fontWeight: 800, color: "rgba(255,255,255,0.85)" }}>
          {disp.cta}
        </div>
      </div>

      {/* Footer vigencia */}
      <div style={{ position: "absolute", bottom: 48, left: 0, right: 0, textAlign: "center", zIndex: 1 }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: "#FFB199" }}>{vigencia}</div>
        <div style={{ marginTop: 6, fontSize: 20, fontWeight: 600, color: "rgba(255,255,255,0.45)" }}>Aplicable en tienda · Tadaima</div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Modal Compartir: preview escalado del banner + exportar PNG / share / WhatsApp
// ══════════════════════════════════════════════════════════════════════════════
export function ShareBannerModal({ product, promo, onClose }: {
  product: ProductLight;
  promo: LightPromo;
  onClose: () => void;
}) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [imgDataUrl, setImgDataUrl] = useState<string | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [exporting, setExporting] = useState(false);
  const canShareFiles = typeof navigator !== "undefined" && !!navigator.canShare;

  useEffect(() => {
    let alive = true;
    void (async () => {
      // Foto same-origin (base64) — si falla, el banner usa placeholder de marca.
      const [img, logo, promos] = await Promise.all([
        getProductImageBase64(product.id).catch(() => null),
        loadLogoDataUrl(),
        getProductPromotions(product.id).catch(() => []),
      ]);
      if (!alive) return;
      setImgDataUrl(img);
      setLogoDataUrl(logo);
      setEndsAt(promos.find(x => x.id === promo.id)?.ends_at ?? null);
      setLoadingAssets(false);
    })();
    return () => { alive = false; };
  }, [product.id, promo.id]);

  const exportPng = async (): Promise<File | null> => {
    if (!nodeRef.current) return null;
    setExporting(true);
    try {
      // toBlob directo (canvas.toBlob) — NADA de fetch(dataUrl): el CSP de la
      // app no permite data: en connect-src y el fetch se bloqueaba (QA Joel
      // 2026-07-17: "descargar imagen no genera nada").
      // skipFonts: el banner usa fuentes del sistema; sin esto html-to-image
      // intenta fetch de los stylesheets de Google Fonts y el CSP lo bloquea.
      const blob = await toBlob(nodeRef.current, { pixelRatio: 1, cacheBust: false, skipFonts: true });
      if (!blob) {
        toast.error("No se pudo generar la imagen");
        return null;
      }
      // slug del tipo de promo, no `buy_n x pay_m`: en mayoreo ambos son null
      // y el archivo salía "promo-nullxnull-…".
      const slug = promoShortLabel(promo).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
      return new File([blob], `promo-${slug}-${product.sku || product.id}.png`, { type: "image/png" });
    } catch {
      toast.error("No se pudo generar la imagen");
      return null;
    } finally {
      setExporting(false);
    }
  };

  const handleDownload = async () => {
    const file = await exportPng();
    if (!file) return;
    downloadBlob(file, file.name);
    toast.success("Imagen descargada");
  };

  const handleShareImage = async () => {
    const file = await exportPng();
    if (!file) return;
    try {
      if (navigator.canShare?.({ files: [file] })) {
        // Abre el share sheet del dispositivo → WhatsApp → lista de contactos.
        await navigator.share({ files: [file], title: `Promo ${promoShortLabel(promo)} — ${product.name}` });
      } else {
        toast.info("Este navegador no comparte imágenes — usa Descargar y mándala por WhatsApp.");
      }
    } catch {
      /* usuario canceló el share — no es error */
    }
  };

  const handleWhatsAppText = () => {
    const price = getLightPrice(product, 1);
    const disp = promoDisplay(promo, price);
    const lines = [
      `🔥 *PROMO ${disp.badge}* — ${promo.name}`,
      `${product.name}`,
      disp.cta,
      endsAt ? `Válido hasta el ${new Date(endsAt).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}` : "Por tiempo limitado",
      `Solo en tienda · Tadaima 🏪`,
    ];
    // Sin número: abre WhatsApp con el selector de contactos.
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener");
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }} onClick={onClose} />
      <div style={{ position: "relative", background: PANEL, border: BORDER, borderRadius: 28, padding: 24, width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto" }} data-testid="share-banner-modal">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: THI }}>Compartir promo</h3>
            <p style={{ margin: "3px 0 0", fontSize: 10, fontWeight: 700, color: TLO, textTransform: "uppercase", letterSpacing: "0.12em" }}>
              {promoShortLabel(promo)} · {product.name}
            </p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: TLO, padding: 4 }}><X size={18} /></button>
        </div>

        {/* Preview escalado (el nodo real mide 1080×1350) */}
        <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
          <div style={{ width: 324, height: 405, overflow: "hidden", borderRadius: 16, border: CARD_B, position: "relative" }}>
            {loadingAssets && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2, background: "rgba(0,0,0,0.4)" }}>
                <Loader2 size={22} className="animate-spin" style={{ color: "#F59E0B" }} />
              </div>
            )}
            <div style={{ transform: "scale(0.3)", transformOrigin: "top left" }}>
              <PromoBanner product={product} promo={promo} imgDataUrl={imgDataUrl} logoDataUrl={logoDataUrl} endsAt={endsAt} nodeRef={nodeRef} />
            </div>
          </div>
        </div>
        {!loadingAssets && !imgDataUrl && (
          <p style={{ margin: "10px 0 0", fontSize: 10, fontWeight: 700, color: "#F59E0B", display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
            <ImageOff size={12} /> El producto no tiene foto — el banner sale con placeholder de marca.
          </p>
        )}

        {/* Acciones */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          {canShareFiles && (
            <button onClick={() => { void handleShareImage(); }} disabled={exporting || loadingAssets}
              data-testid="share-image-btn"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", borderRadius: 14, fontSize: 12, fontWeight: 900, cursor: "pointer", color: "#fff", background: "linear-gradient(135deg, #128C4A, #25D366)", border: "1px solid rgba(37,211,102,0.4)", opacity: exporting || loadingAssets ? 0.6 : 1 }}>
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
              Compartir imagen (elige el contacto)
            </button>
          )}
          <button onClick={handleWhatsAppText}
            data-testid="share-wa-text-btn"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", borderRadius: 14, fontSize: 12, fontWeight: 900, cursor: "pointer", color: "#25D366", background: "rgba(37,211,102,0.08)", border: "1px solid rgba(37,211,102,0.35)" }}>
            <MessageCircle size={14} />
            WhatsApp con texto de la promo
          </button>
          <button onClick={() => { void handleDownload(); }} disabled={exporting || loadingAssets}
            data-testid="download-banner-btn"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", borderRadius: 14, fontSize: 12, fontWeight: 900, cursor: "pointer", color: TMD, background: SOFT, border: CARD_B, opacity: exporting || loadingAssets ? 0.6 : 1 }}>
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Descargar PNG (1080×1350)
          </button>
        </div>
      </div>
    </div>
  );
}
