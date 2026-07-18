import { Suspense, lazy } from "react"
import type { CatalogBackgroundSlug } from "@tadaima/api"
import type { CatalogTheme } from "@/lib/catalogThemes"
import { ShaderBackground } from "../ShaderBackground"

/**
 * Capa de fondo del Catálogo Online (Catálogo v4) — punto único que conoce la
 * página. El tema pone el color; este componente pone el efecto.
 *
 * La galaxia va con `lazy` a propósito: `OnlineCatalogPage` se importa de forma
 * eager en el router, así que un import estático metería `ogl` (~50 kB) en el
 * bundle principal de TODOS los cajeros. Así solo baja si la tienda está en
 * modo galaxia.
 */
const GalaxyBackground = lazy(() => import("./GalaxyBackground"))

interface CatalogBackgroundProps {
  background: CatalogBackgroundSlug
  theme: CatalogTheme
}

export function CatalogBackground({ background, theme }: CatalogBackgroundProps) {
  switch (background) {
    case "shader":
      // key={slug} remonta el canvas limpio al cambiar de paleta.
      return <ShaderBackground key={theme.slug} tint={theme.shaderTint} />

    case "galaxy":
      return (
        <Suspense fallback={null}>
          <GalaxyBackground theme={theme} />
        </Suspense>
      )

    case "gradient":
      // No monta nada: el degradado del tema ya viaja en --cat-page-bg
      // (ver catalogSurfaceVars).
      return null
  }
}
