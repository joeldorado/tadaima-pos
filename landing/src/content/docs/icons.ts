import {
  ArrowLeftRight,
  BarChart2,
  BookOpen,
  Bookmark,
  Building2,
  ClipboardList,
  HelpCircle,
  KeyRound,
  Layers,
  Package,
  PackageSearch,
  Printer,
  Rocket,
  Search,
  ShieldCheck,
  ShoppingBasket,
  ShoppingCart,
  Store,
  TicketPercent,
  UserCircle2,
  Wallet,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

/**
 * Puente entre el `icon` serializable de los JSON (`data/*.json`) y los
 * componentes de lucide-react. La key es el nombre kebab-case del icono.
 * Para usar un icono nuevo en la documentación: impórtalo y agrégalo aquí.
 */
export const ICON_MAP: Record<string, LucideIcon> = {
  "arrow-left-right": ArrowLeftRight,
  "bar-chart-2": BarChart2,
  "book-open": BookOpen,
  bookmark: Bookmark,
  "building-2": Building2,
  "clipboard-list": ClipboardList,
  "help-circle": HelpCircle,
  "key-round": KeyRound,
  layers: Layers,
  package: Package,
  "package-search": PackageSearch,
  printer: Printer,
  rocket: Rocket,
  search: Search,
  "shield-check": ShieldCheck,
  "shopping-basket": ShoppingBasket,
  "shopping-cart": ShoppingCart,
  store: Store,
  "ticket-percent": TicketPercent,
  "user-circle-2": UserCircle2,
  wallet: Wallet,
}

/** Resuelve una key de icono; si no existe cae a `BookOpen` (avisa en dev). */
export function resolveIcon(key: string): LucideIcon {
  const icon = ICON_MAP[key]
  if (icon) return icon
  if (import.meta.env.DEV) {
    console.warn(`[docs] icono desconocido '${key}' — usando 'book-open' como fallback`)
  }
  return BookOpen
}
