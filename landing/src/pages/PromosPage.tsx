import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion as Motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import {
  TicketPercent, Tv, Share2, Download, MessageCircle, X, Loader2, ImageOff,
} from "lucide-react";
import {
  getProductsLight, getLightPrice, getProductImageBase64, getProductPromotions, getStores,
  type ProductLight, type Store,
} from "@tadaima/api";
import { useAuth } from "@tadaima/auth";
import { isAdmin as isAdminRole } from "@/lib/permisos";

// ─── Tokens visuales (convención de páginas glass) ────────────────────────────
const PANEL  = "var(--td-panel-bg)";
const BORDER = "1px solid var(--td-panel-border)";
const CARD_B = "1px solid var(--td-card-border)";
const SOFT   = "var(--td-surface-soft)";
const THI    = "var(--td-text-hi)";
const TMD    = "var(--td-text-md)";
const TLO    = "var(--td-text-lo)";
const GREEN  = "#34d399";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n || 0);

type LightPromo = NonNullable<ProductLight["active_promotions"]>[number];

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
  const free = promo.buy_n - promo.pay_m;
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
          fontSize: 230, fontWeight: 900, lineHeight: 0.9, letterSpacing: "-0.04em",
          background: "linear-gradient(135deg, #FF3322 0%, #FFB199 100%)",
          WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
          textShadow: "0 0 80px rgba(255,51,34,0.25)",
        }}>
          {promo.buy_n}×{promo.pay_m}
        </div>
        <div style={{ marginTop: 8, fontSize: 34, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.35em", color: GREEN }}>
          {free === 1 ? "1 gratis" : `${free} gratis`} · {promo.name}
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
          Llévate {promo.buy_n} y paga solo {promo.pay_m} · {fmt(price * promo.pay_m)}
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
function ShareBannerModal({ product, promo, onClose }: {
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
      const dataUrl = await toPng(nodeRef.current, { pixelRatio: 1, cacheBust: false });
      const blob = await (await fetch(dataUrl)).blob();
      return new File([blob], `promo-${promo.buy_n}x${promo.pay_m}-${product.sku || product.id}.png`, { type: "image/png" });
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
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url; a.download = file.name; a.click();
    URL.revokeObjectURL(url);
    toast.success("Imagen descargada");
  };

  const handleShareImage = async () => {
    const file = await exportPng();
    if (!file) return;
    try {
      if (navigator.canShare?.({ files: [file] })) {
        // Abre el share sheet del dispositivo → WhatsApp → lista de contactos.
        await navigator.share({ files: [file], title: `Promo ${promo.buy_n}x${promo.pay_m} — ${product.name}` });
      } else {
        toast.info("Este navegador no comparte imágenes — usa Descargar y mándala por WhatsApp.");
      }
    } catch {
      /* usuario canceló el share — no es error */
    }
  };

  const handleWhatsAppText = () => {
    const price = getLightPrice(product, 1);
    const lines = [
      `🔥 *PROMO ${promo.buy_n}x${promo.pay_m}* — ${promo.name}`,
      `${product.name}`,
      `Llévate ${promo.buy_n} y paga solo ${promo.pay_m} · ${fmt(price * promo.pay_m)}`,
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
              {promo.buy_n}x{promo.pay_m} · {product.name}
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

// ══════════════════════════════════════════════════════════════════════════════
// Modo TV: carrusel fullscreen auto-rotativo para la pantalla de la tienda.
// ══════════════════════════════════════════════════════════════════════════════
const TV_ROTATE_MS = 8000;

function TvMode({ items, onExit }: {
  items: { product: ProductLight; promo: LightPromo }[];
  onExit: () => void;
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const id = window.setInterval(() => setIdx(i => (i + 1) % items.length), TV_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [items.length]);

  // Fullscreen + salir con Esc (el browser dispara fullscreenchange al salir).
  useEffect(() => {
    const el = document.documentElement;
    void el.requestFullscreen?.().catch(() => { /* sin fullscreen igual funciona */ });
    const onFsChange = () => { if (!document.fullscreenElement) onExit(); };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = items.length ? items[idx % items.length] : null;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 400, cursor: "none", overflow: "hidden", background: "radial-gradient(1400px 900px at 25% -10%, #3a0a06 0%, #16090c 45%, #0a0a0f 100%)", color: "#fff", fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif" }}
      onDoubleClick={onExit}
      data-testid="tv-mode"
    >
      {/* Glow */}
      <div style={{ position: "absolute", top: "-15%", right: "-10%", width: "45vw", height: "45vw", borderRadius: "50%", background: "radial-gradient(circle, rgba(224,34,26,0.3) 0%, transparent 70%)" }} />
      <div style={{ position: "absolute", bottom: "-20%", left: "-12%", width: "50vw", height: "50vw", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,68,34,0.15) 0%, transparent 70%)" }} />

      {/* Logo esquina */}
      <div style={{ position: "absolute", top: "3vh", left: "3vw", display: "flex", alignItems: "center", gap: 14, zIndex: 2 }}>
        <div style={{ width: "5vh", height: "5vh", minWidth: 40, minHeight: 40, borderRadius: 12, background: "#fff", padding: 4, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src="/tadaima-logo.jpeg" alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </div>
        <span style={{ fontSize: "3.2vh", fontWeight: 900 }}>Tadaima</span>
      </div>
      <div style={{ position: "absolute", top: "3.6vh", right: "3vw", fontSize: "2vh", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.3em", color: "rgba(255,255,255,0.5)", zIndex: 2 }}>
        Promociones vigentes
      </div>

      <AnimatePresence mode="wait">
        {current ? (
          <Motion.div
            key={`${current.product.id}-${current.promo.id}`}
            initial={{ opacity: 0, scale: 0.96, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.02, y: -24 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: "6vw", padding: "0 6vw", zIndex: 1 }}
          >
            {/* Foto */}
            <div style={{ width: "34vw", maxWidth: "58vh", aspectRatio: "1 / 1", borderRadius: "3vh", overflow: "hidden", background: "rgba(255,255,255,0.04)", border: "2px solid rgba(255,255,255,0.12)", boxShadow: "0 30px 90px rgba(0,0,0,0.6), 0 0 80px rgba(224,34,26,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {current.product.image
                ? <img src={current.product.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: "8vh", fontWeight: 900, color: "rgba(255,255,255,0.15)" }}>Tadaima</span>}
            </div>

            {/* Texto */}
            <div style={{ maxWidth: "44vw" }}>
              <div style={{
                fontSize: "22vh", fontWeight: 900, lineHeight: 0.9, letterSpacing: "-0.04em",
                background: "linear-gradient(135deg, #FF3322 0%, #FFB199 100%)",
                WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
              }}>
                {current.promo.buy_n}×{current.promo.pay_m}
              </div>
              <div style={{ marginTop: "1vh", fontSize: "3.4vh", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.3em", color: GREEN }}>
                {current.promo.buy_n - current.promo.pay_m === 1 ? "1 gratis" : `${current.promo.buy_n - current.promo.pay_m} gratis`} · {current.promo.name}
              </div>
              <div style={{ marginTop: "3vh", fontSize: "5.4vh", fontWeight: 900, lineHeight: 1.1 }}>{current.product.name}</div>
              <div style={{ marginTop: "1.6vh", fontSize: "3.4vh", fontWeight: 800, color: "rgba(255,255,255,0.85)" }}>
                Llévate {current.promo.buy_n}, paga {current.promo.pay_m} · {fmt(getLightPrice(current.product, 1) * current.promo.pay_m)}
              </div>
            </div>
          </Motion.div>
        ) : (
          <Motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
            <div style={{ fontSize: "9vh", fontWeight: 900 }}>Bienvenido a Tadaima</div>
            <div style={{ marginTop: "2vh", fontSize: "3vh", fontWeight: 700, color: "rgba(255,255,255,0.55)" }}>Pregunta por nuestras promociones</div>
          </Motion.div>
        )}
      </AnimatePresence>

      {/* Dots de progreso */}
      {items.length > 1 && (
        <div style={{ position: "absolute", bottom: "3.4vh", left: 0, right: 0, display: "flex", justifyContent: "center", gap: 10, zIndex: 2 }}>
          {items.map((it, i) => (
            <div key={`${it.product.id}-${it.promo.id}`} style={{ width: i === idx ? 26 : 9, height: 9, borderRadius: 99, background: i === idx ? "#FF3322" : "rgba(255,255,255,0.25)", transition: "all 0.4s" }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Página Promos
// ══════════════════════════════════════════════════════════════════════════════
export function PromosPage() {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.roles);

  // Sin endpoint global de promos: se enumeran desde los productos light
  // (active_promotions viene embebido). Refetch 60s → la TV se actualiza sola.
  const productsQuery = useQuery({
    queryKey: ["promos-products"],
    queryFn: () => getProductsLight(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Nombres de tienda para las etiquetas (solo admin las necesita todas).
  const storesQuery = useQuery({
    queryKey: ["promos-stores"],
    queryFn: () => getStores(),
    enabled: isAdmin,
    staleTime: 5 * 60_000,
  });
  const storeName = (id: number | null | undefined): string | null => {
    if (id == null) return null;
    return (storesQuery.data as Store[] | undefined)?.find(s => s.id === id)?.name ?? `Tienda #${id}`;
  };

  const promoItems = useMemo(() => {
    const products = productsQuery.data?.data ?? [];
    return products
      .map(p => {
        // Scoping por tienda: gerente/cajero solo ven promos globales o de SU
        // tienda; admin ve todas (con etiqueta de tienda).
        const visible = (p.active_promotions ?? []).filter(pr =>
          isAdmin || pr.store_id == null || pr.store_id === (user?.store_id ?? null));
        return { p, visible };
      })
      .filter(({ p, visible }) => p.active && visible.length > 0)
      .map(({ p, visible }) => ({
        product: p,
        promo: [...visible].sort((a, b) => b.priority - a.priority || a.id - b.id)[0]!,
      }))
      .sort((a, b) => a.product.name.localeCompare(b.product.name, "es"));
  }, [productsQuery.data, isAdmin, user?.store_id]);

  const [shareItem, setShareItem] = useState<{ product: ProductLight; promo: LightPromo } | null>(null);
  const [tvMode, setTvMode] = useState(false);

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl p-2.5" style={{ background: "rgba(224,34,26,0.12)", border: "1px solid rgba(224,34,26,0.3)" }}>
            <TicketPercent size={20} style={{ color: "var(--td-red)" }} />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-wide" style={{ color: THI }}>Promos</h1>
            <p className="text-[11px] font-bold" style={{ color: TMD }}>
              Promociones NxM vigentes — comparte el banner o proyecta el Modo TV en tienda.
            </p>
          </div>
        </div>
        <button
          onClick={() => setTvMode(true)}
          data-testid="tv-mode-btn"
          className="flex items-center gap-2 rounded-2xl px-5 py-3 text-[11px] font-black uppercase tracking-widest"
          style={{ background: "var(--td-red-g, linear-gradient(135deg, #BB1100, #FF3322))", border: "1px solid rgba(224,34,26,0.5)", color: "#fff", cursor: "pointer", boxShadow: "0 6px 18px rgba(224,34,26,0.35)" }}
        >
          <Tv size={14} /> Modo TV
        </button>
      </div>

      {/* Nota de gestión */}
      <p className="text-[10px] font-bold mt-3 mb-5" style={{ color: TLO }}>
        Las promos se crean/editan en <b>Productos → editar → tab Promos</b>. Aplican en todas las tiendas.
      </p>

      {/* Grid */}
      {productsQuery.isLoading ? (
        <div className="flex items-center justify-center py-24"><Loader2 size={22} className="animate-spin" style={{ color: TLO }} /></div>
      ) : promoItems.length === 0 ? (
        <div className="rounded-3xl p-12 text-center" style={{ background: PANEL, border: BORDER }}>
          <TicketPercent size={34} className="mx-auto mb-3" style={{ color: TLO, opacity: 0.5 }} />
          <p className="text-sm font-black uppercase tracking-widest" style={{ color: THI }}>Sin promos vigentes</p>
          <p className="text-[11px] font-bold mt-1" style={{ color: TMD }}>Crea una en Productos → editar producto → tab Promos (2x1, 3x2…).</p>
          <p className="text-[10px] font-bold mt-2" style={{ color: TLO }}>
            ¿Creaste una y no sale? Revisa que no esté <b>Programada</b> (fecha de inicio futura), <b>Pausada</b> o <b>Vencida</b>, que el producto esté activo, y que la promo sea de tu tienda (o de todas).
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {promoItems.map(({ product, promo }) => (
            <Motion.div
              key={`${product.id}-${promo.id}`}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-3xl overflow-hidden flex flex-col"
              style={{ background: PANEL, border: BORDER }}
            >
              {/* Foto + badge */}
              <div style={{ position: "relative", height: 170, background: SOFT, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {product.image
                  ? <img src={product.image} alt={product.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontSize: 34, fontWeight: 900, color: "rgba(255,255,255,0.12)" }}>Tadaima</span>}
                <span style={{ position: "absolute", top: 10, left: 10, padding: "4px 12px", borderRadius: 10, fontSize: 15, fontWeight: 900, color: "#fff", background: "linear-gradient(135deg, #BB1100, #FF3322)", boxShadow: "0 4px 14px rgba(224,34,26,0.5)" }}>
                  {promo.buy_n}×{promo.pay_m}
                </span>
              </div>

              {/* Info */}
              <div className="p-4 flex-1 flex flex-col">
                <p className="text-[13px] font-black leading-tight" style={{ color: THI }}>{product.name}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: TLO }}>
                  {promo.name}
                  {promo.store_id != null && (
                    <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 6, fontSize: 8, fontWeight: 900, color: "#60A5FA", background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.3)" }}>
                      {isAdmin ? (storeName(promo.store_id) ?? "Solo una tienda") : "Solo tu tienda"}
                    </span>
                  )}
                </p>
                <p className="text-[12px] font-black mt-2" style={{ color: GREEN }}>
                  Llévate {promo.buy_n}, paga {promo.pay_m} · {fmt(getLightPrice(product, 1) * promo.pay_m)}
                </p>
                {promo.priority > 0 && (
                  <p className="text-[9px] font-bold mt-1" style={{ color: TLO }}>Prioridad {promo.priority}</p>
                )}
                <button
                  onClick={() => setShareItem({ product, promo })}
                  data-testid={`share-promo-${product.id}`}
                  className="mt-3 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[11px] font-black uppercase tracking-widest"
                  style={{ background: "rgba(37,211,102,0.08)", border: "1px solid rgba(37,211,102,0.35)", color: "#25D366", cursor: "pointer" }}
                >
                  <Share2 size={12} /> Compartir
                </button>
              </div>
            </Motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {shareItem && (
          <ShareBannerModal product={shareItem.product} promo={shareItem.promo} onClose={() => setShareItem(null)} />
        )}
      </AnimatePresence>
      {tvMode && <TvMode items={promoItems} onExit={() => setTvMode(false)} />}
    </div>
  );
}
