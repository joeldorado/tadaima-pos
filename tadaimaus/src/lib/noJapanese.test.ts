import { describe, expect, it } from 'vitest'

/**
 * Guardia de idioma: la tienda US es 100% inglés por decisión de producto —
 * el japonés mezclado con el inglés confundía al cliente. Este test evita que
 * se cuele de vuelta en el próximo rediseño, que es justo cuando pasaría.
 *
 * Cubre hiragana, katakana y kanji (CJK unificado). Los nombres de marca en
 * romaji ("Tadaima", "Okaeri") no son japonés escrito y siguen permitidos.
 *
 * Se leen los archivos con `import.meta.glob` de Vite en vez de `node:fs`:
 * así el test no obliga a meter @types/node a una app que solo depende de
 * react + react-dom (con node:fs, `tsc -b` del build truena).
 */
const CJK = /[぀-ゟ゠-ヿ一-龯]/

const SOURCES = import.meta.glob('../**/*.{ts,tsx,css}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('the storefront ships no Japanese text', () => {
  it('has no CJK characters anywhere under src/', () => {
    // Este archivo contiene los rangos a propósito.
    const files = Object.entries(SOURCES).filter(
      ([path]) => !path.endsWith('noJapanese.test.ts'),
    )

    // Si el glob se rompiera, el test pasaría en vacío y no guardaría nada.
    expect(files.length).toBeGreaterThan(25)

    const offenders = files.flatMap(([path, contents]) =>
      contents
        .split('\n')
        .map((text, index) => ({ path, line: index + 1, text }))
        .filter((entry) => CJK.test(entry.text))
        .map((entry) => `${entry.path}:${entry.line} → ${entry.text.trim()}`),
    )

    expect(offenders).toEqual([])
  })
})
