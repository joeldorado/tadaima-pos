import { useEffect, useState } from "react";

/**
 * Devuelve `value` con retraso: solo cambia cuando el valor lleva `delayMs`
 * sin moverse. Para buscadores que pegan al API (p. ej. el selector de
 * productos de Paquetes): el usuario teclea libre y la petición sale una vez.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
