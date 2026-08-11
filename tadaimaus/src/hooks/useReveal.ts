import { useEffect, useRef, useState, type RefObject } from 'react'

interface UseRevealResult<T extends HTMLElement> {
  readonly ref: RefObject<T | null>
  readonly isRevealed: boolean
}

/**
 * One-shot IntersectionObserver: `isRevealed` flips true the first time the
 * element enters the viewport. Pair with the `.reveal` CSS class — under
 * reduced-motion the transition is instant (global kill in base.css).
 */
export function useReveal<T extends HTMLElement>(): UseRevealResult<T> {
  const ref = useRef<T>(null)
  const [isRevealed, setRevealed] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true)
          observer.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -48px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, isRevealed }
}
