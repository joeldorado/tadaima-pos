/**
 * GalaxyField — Barrel export.
 *
 * Copiado de la FX library (JOEL/IDD/fx-library/effects/GalaxyField) para el
 * fondo "galaxia" del Catálogo Online. Se omitieron `controls.ts` y
 * `metadata.json` (playground de la librería) y se ajustó el useEffect de
 * uniforms para `noUncheckedIndexedAccess`.
 *
 * NO se importa directo desde la página: el wrapper
 * `components/catalog/backgrounds/GalaxyBackground.tsx` lo carga con
 * React.lazy para que `ogl` salga en su propio chunk.
 */
export { GalaxyField, default } from './GalaxyField'
export type { GalaxyFieldProps } from './GalaxyField'
export { GalaxyFieldPresets, GalaxyFieldPresetNames } from './presets'
export type { GalaxyFieldPreset } from './presets'
