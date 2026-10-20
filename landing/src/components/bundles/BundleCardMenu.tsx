import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import { POPUP_BG, POPUP_BORDER, RED_SOFT, TEXT_HI } from "@/components/promos/promoTokens";

export interface BundleMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface BundleCardMenuProps {
  items: readonly BundleMenuItem[];
  ariaLabel: string;
  testId?: string;
}

/**
 * Menú ⋮ de la tarjeta: botón de 44 px y lista con teclado (↑/↓, Enter, Esc).
 * Hecho a mano (sin dependencias) para no cargar la librería de menús por tres
 * opciones; cierra con clic afuera o Esc.
 */
export function BundleCardMenu({ items, ariaLabel, testId }: BundleCardMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(true); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const onListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    const index = buttons.findIndex(b => b === document.activeElement);
    const next = buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length];
    next?.focus();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
        className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-white/10"
        style={{ color: TEXT_HI, cursor: "pointer" }}
        {...(testId ? { "data-testid": testId } : {})}
      >
        <MoreVertical size={20} aria-hidden />
      </button>
      {open && (
        <ul
          ref={listRef}
          role="menu"
          onKeyDown={onListKeyDown}
          className="absolute right-0 z-20 mt-1 min-w-44 overflow-hidden rounded-2xl py-1"
          style={{ background: POPUP_BG, border: POPUP_BORDER, boxShadow: "0 12px 28px -8px rgba(0,0,0,0.6)" }}
        >
          {items.map(item => (
            <li key={item.key} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => { close(true); item.onSelect(); }}
                className="block w-full px-4 py-2.5 text-left text-[15px] font-bold hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ color: item.danger ? RED_SOFT : TEXT_HI, cursor: "pointer" }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
