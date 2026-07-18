import { useEffect, useState } from "react";

/**
 * Suscribe a una media query CSS y devuelve si hace match (reactivo al resize).
 * Uso: const isNarrow = useMediaQuery("(max-width: 767px)").
 * SSR-safe: arranca en false si no hay window.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
