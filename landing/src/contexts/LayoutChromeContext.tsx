import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Canal página→Layout (2026-07-24, Modo Full Caja): la Caja puede pedir que el
 * sidebar desaparezca por completo para ganar ancho. El Layout no tenía ningún
 * canal con sus páginas (solo sniffing de ruta) — este context es ese canal,
 * mínimo a propósito.
 *
 * El estado se persiste por dispositivo (la caja del mostrador vive en full;
 * la laptop del admin no) con el mismo patrón directo de localStorage que
 * `tadaima-nav-collapsed`.
 */

const STORAGE_KEY = "tadaima-caja-fullscreen";

interface LayoutChrome {
  /** true = la Caja pidió pantalla completa (sidebar oculto SOLO en /caja). */
  cajaFullscreen: boolean;
  setCajaFullscreen: (v: boolean) => void;
}

const LayoutChromeContext = createContext<LayoutChrome>({
  cajaFullscreen: false,
  setCajaFullscreen: () => {},
});

export function LayoutChromeProvider({ children }: { children: ReactNode }) {
  const [cajaFullscreen, setCajaFullscreen] = useState<boolean>(
    () => localStorage.getItem(STORAGE_KEY) === "1",
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, cajaFullscreen ? "1" : "0");
  }, [cajaFullscreen]);

  return (
    <LayoutChromeContext.Provider value={{ cajaFullscreen, setCajaFullscreen }}>
      {children}
    </LayoutChromeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook del propio context
export function useLayoutChrome(): LayoutChrome {
  return useContext(LayoutChromeContext);
}
