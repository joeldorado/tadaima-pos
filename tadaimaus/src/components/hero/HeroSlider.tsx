import { useCallback, useEffect, useState } from 'react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { assetUrl, type UsCategory } from '../../lib/constants'

const AUTOPLAY_MS = 6000

interface HeroSlide {
  readonly id: UsCategory
  readonly kickerEn: string
  /** Título en líneas — cada línea entra con su propio reveal escalonado. */
  readonly titleLines: readonly (readonly [pre: string, accent: string])[]
  readonly tagline: string
  /** Arte del slide (los 3 banners 2000×800 del sitio original, a 1600 webp). */
  readonly image: string
  readonly primaryLabel: string
  readonly primaryHash: string
  readonly secondaryLabel: string
  readonly secondaryHash: string
}

const SLIDES: readonly HeroSlide[] = [
  {
    id: 'figures',
    kickerEn: 'Welcome home',
    titleLines: [
      ['Figures, manga', ''],
      ['and ', 'TCG'],
    ],
    tagline:
      'Figures, manga and trading card games — shipped from our shelves to your door.',
    image: assetUrl('img/hero-figures.webp'),
    primaryLabel: 'Shop figures',
    primaryHash: '#/figures',
    secondaryLabel: 'Browse TCG',
    secondaryHash: '#/tcg',
  },
  {
    id: 'manga',
    kickerEn: 'Fresh volumes',
    titleLines: [
      ['Stack your', ''],
      ['manga ', 'shelf'],
    ],
    tagline:
      'English-language volumes, box sets and hard-to-find prints — new arrivals land every week.',
    image: assetUrl('img/hero-manga.webp'),
    primaryLabel: 'Shop manga',
    primaryHash: '#/manga',
    secondaryLabel: 'See figures',
    secondaryHash: '#/figures',
  },
  {
    id: 'tcg',
    kickerEn: 'Pull your grail',
    titleLines: [
      ['Boosters, singles', ''],
      ['and ', 'grails'],
    ],
    tagline:
      'One Piece, Pokémon and more — booster boxes, premium collections and singles worth the hunt.',
    image: assetUrl('img/hero-tcg.webp'),
    primaryLabel: 'Shop TCG',
    primaryHash: '#/tcg',
    secondaryLabel: 'Browse manga',
    secondaryHash: '#/manga',
  },
]

function ArrowIcon({ direction }: { readonly direction: 'prev' | 'next' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={direction === 'prev' ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export function HeroSlider() {
  const [index, setIndex] = useState(0)
  const [isPaused, setPaused] = useState(false)
  const prefersReduced = useReducedMotion()

  const goTo = useCallback((next: number) => {
    setIndex(((next % SLIDES.length) + SLIDES.length) % SLIDES.length)
  }, [])

  useEffect(() => {
    if (isPaused || prefersReduced) return
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % SLIDES.length),
      AUTOPLAY_MS,
    )
    return () => window.clearInterval(timer)
  }, [isPaused, prefersReduced])

  const slide = SLIDES[index] ?? SLIDES[0]!

  return (
    <section
      className="hero-slider"
      aria-roledescription="carousel"
      aria-label="Featured collections"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* Escenario: capas de fondo por slide (crossfade) + shapes flotantes */}
      <div className="hero-scene" aria-hidden="true">
        {SLIDES.map((scene, sceneIndex) => (
          <div
            key={scene.id}
            className={`hero-scene-layer is-${scene.id}${
              sceneIndex === index ? ' is-active' : ''
            }`}
          >
            {/* El primer slide es el LCP: se pide con prioridad y sin lazy. */}
            <img
              className="hero-photo"
              src={scene.image}
              alt=""
              width={1600}
              height={640}
              loading={sceneIndex === 0 ? 'eager' : 'lazy'}
              fetchPriority={sceneIndex === 0 ? 'high' : 'low'}
              decoding="async"
            />
            <div className="hero-scene-pan" />
          </div>
        ))}
        <span className="hero-shape hero-shape-ring" />
        <span className="hero-shape hero-shape-dot" />
        <span className="hero-shape hero-shape-bar" />
      </div>

      {/* key={slide.id} remonta el contenido → los reveals CSS se re-disparan.
          aria-live solo cuando el autoplay está pausado (patrón APG: un carrusel
          auto-rotando no debe bombardear al lector de pantalla cada 6s). */}
      <div
        className="hero-content container"
        key={slide.id}
        aria-live={isPaused || prefersReduced ? 'polite' : 'off'}
      >
        {/* La raya arranca el eyebrow: antes separaba la mitad japonesa de la
            inglesa, ahora es solo el detalle gráfico. */}
        <p className="hero-kicker hero-reveal hero-reveal-1">
          <span className="hero-kicker-divider" aria-hidden="true" />
          {slide.kickerEn}
        </p>
        <h1 id="hero-heading">
          {slide.titleLines.map(([pre, accent], lineIndex) => (
            <span key={`${slide.id}-${lineIndex}`} className="hero-line">
              <span
                className={`hero-line-inner hero-reveal hero-reveal-${lineIndex + 2}`}
              >
                {pre}
                {accent !== '' && <span className="hero-accent">{accent}</span>}
              </span>
            </span>
          ))}
        </h1>
        <p className="hero-tagline hero-reveal hero-reveal-4">{slide.tagline}</p>
        <div className="hero-actions hero-reveal hero-reveal-4">
          <a className="btn btn-primary" href={slide.primaryHash}>
            {slide.primaryLabel}
          </a>
          <a className="btn btn-ghost" href={slide.secondaryHash}>
            {slide.secondaryLabel}
          </a>
        </div>
      </div>

      <div className="hero-controls container">
        <div className="hero-dots" role="group" aria-label="Choose slide">
          {SLIDES.map((dot, dotIndex) => (
            <button
              key={dot.id}
              type="button"
              className={`hero-dot${dotIndex === index ? ' is-active' : ''}`}
              aria-label={`Slide ${dotIndex + 1}: ${dot.primaryLabel}`}
              aria-current={dotIndex === index ? 'true' : undefined}
              onClick={() => goTo(dotIndex)}
            />
          ))}
        </div>
        <div className="hero-arrows">
          <button
            type="button"
            className="hero-arrow"
            aria-label="Previous slide"
            onClick={() => goTo(index - 1)}
          >
            <ArrowIcon direction="prev" />
          </button>
          <button
            type="button"
            className="hero-arrow"
            aria-label="Next slide"
            onClick={() => goTo(index + 1)}
          >
            <ArrowIcon direction="next" />
          </button>
        </div>
      </div>
    </section>
  )
}
