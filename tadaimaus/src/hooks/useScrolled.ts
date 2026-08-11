import { useEffect, useState } from 'react'

/** True once the page scrolls past `threshold` px (rAF-throttled listener). */
export function useScrolled(threshold = 12): boolean {
  const [isScrolled, setScrolled] = useState(false)

  useEffect(() => {
    let frame = 0
    const update = (): void => {
      frame = 0
      setScrolled(window.scrollY > threshold)
    }
    const onScroll = (): void => {
      if (frame === 0) frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [threshold])

  return isScrolled
}
