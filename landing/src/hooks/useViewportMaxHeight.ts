import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Detector del alto REAL de la pantalla → max-height para listas con scroll
 * interno. En vez de depender solo de la cadena flex (height:100% + minHeight:0,
 * que algún navegador/tamaño no propaga bien), mide la posición top del propio
 * contenedor con `getBoundingClientRect` y calcula cuánto espacio queda hasta el
 * fondo del viewport (`window.innerHeight`) menos `bottomGap`. Reactivo a resize.
 *
 * Uso:
 *   const [listRef, maxHeight] = useViewportMaxHeight(20);
 *   <div ref={listRef} style={{ maxHeight, overflowY: "auto" }}>…</div>
 *
 * El `ref` es un callback ref: al montar el elemento (p.ej. al abrir un modal)
 * mide de inmediato; no necesita que el contenedor exista en el primer render.
 *
 * @param bottomGap  px de respiro entre el fondo de la lista y el borde inferior.
 * @param minHeight  tope mínimo para que la lista nunca colapse a casi nada.
 */
export function useViewportMaxHeight(
  bottomGap = 20,
  minHeight = 140,
): readonly [(node: HTMLElement | null) => void, number | undefined] {
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  const elRef = useRef<HTMLElement | null>(null);

  const measure = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    setMaxHeight(Math.max(minHeight, window.innerHeight - top - bottomGap));
  }, [bottomGap, minHeight]);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      elRef.current = node;
      if (node) measure();
    },
    [measure],
  );

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  return [ref, maxHeight] as const;
}
