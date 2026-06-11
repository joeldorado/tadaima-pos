export type PriceLevel = "a" | "b" | "c" | "d" | "e";

// Nombres de negocio de los niveles de precio (Joel 2026-06-10):
// 1=Normal, 2=Socio, 3=Mayorista. 4/5 quedan genéricos hasta que tengan nombre.
export const PRICE_LEVEL_LABELS: Record<PriceLevel, string> = {
  a: "Normal", b: "Socio", c: "Mayorista", d: "Precio D", e: "Precio E",
};

// Labels para forms de captura (price_1..price_5), en orden de nivel.
export const PRICE_FORM_LABELS = [
  "Precio Normal (Default)", "Precio Socio", "Precio Mayorista", "Precio D", "Precio E",
] as const;

// Color de identidad por nivel (Caja): Normal=verde (precio de venta default),
// Socio=ámbar, Mayorista=azul — Socio/Mayorista conservan los tonos que ya
// usaba el catálogo de Caja. D/E con tonos propios por si se usan.
export const PRICE_LEVEL_COLORS: Record<PriceLevel, string> = {
  a: "#10B981", b: "#F59E0B", c: "#3B82F6", d: "#8B5CF6", e: "#EC4899",
};

// Mismos colores como triplete RGB para fondos/bordes translúcidos
// (`rgba(${PRICE_LEVEL_RGB[lvl]},0.12)`).
export const PRICE_LEVEL_RGB: Record<PriceLevel, string> = {
  a: "16,185,129", b: "245,158,11", c: "59,130,246", d: "139,92,246", e: "236,72,153",
};
