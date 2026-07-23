import { Suspense, lazy } from "react";
import type { CatalogBackgroundSlug } from "@tadaima/api";
import { ShaderBackground } from "@/components/catalog/ShaderBackground";
import type { CatalogTheme } from "@/lib/catalogThemes";

/**
 * Tira 16:9 con el fondo seleccionado corriendo DE VERDAD, teñido con el color
 * seleccionado (Catálogo v5).
 *
 * Por qué una sola tira grande y no tres miniaturas vivas: el shader compone
 * con `min(ancho, alto)`, así que en una tarjeta de 200×56 no se ve una versión
 * chica del efecto sino un recorte distinto — mentiría igual que un gradiente
 * falso, nomás gastando GPU. A 16:9 sí es la misma composición que en pantalla.
 *
 * Las tres tarjetas de arriba se quedan con su gradiente como identificador.
 */

const GalaxyBackground = lazy(() => import("@/components/catalog/backgrounds/GalaxyBackground"));

/** La tira es chica: no necesita las 30k estrellas del fondo real. */
const THUMB_GALAXY = { count: 6000, dpr: 1.5, size: 30 } as const;

interface Props {
  theme: CatalogTheme;
  background: CatalogBackgroundSlug;
  /** Color de página del tema, ya resuelto (el tema puede traer una var del POS). */
  base: string;
}

export function BackgroundPreviewStrip({ theme, background, base }: Props) {
  // En modo degradado el color ES el fondo; en los otros dos, la base oscura va
  // debajo del canvas. Si el equipo no tiene WebGL (o pide reduced-motion) no se
  // monta nada encima — que es exactamente lo que verá el cliente.
  const surface = background === "gradient" ? theme.gradientBg : base;

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-white/10"
      style={{ aspectRatio: "16 / 9", background: surface }}
      aria-label={`Vista previa del fondo con el color ${theme.label}`}
    >
      {background === "shader" && <ShaderBackground key={theme.slug} contained tint={theme.shaderTint} />}

      {background === "galaxy" && (
        <Suspense fallback={null}>
          <GalaxyBackground key={theme.slug} contained theme={theme} budget={THUMB_GALAXY} />
        </Suspense>
      )}

      <span className="absolute bottom-2 right-3 text-[8px] font-black uppercase tracking-widest text-white/25">
        En vivo
      </span>
    </div>
  );
}
