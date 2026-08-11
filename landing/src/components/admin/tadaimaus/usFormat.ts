/** Formato USD para el módulo TadaimaUS del admin (en-US: $25.00). */
export const fmtUsd = (n: number | string): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n) || 0);

/** Extrae el mensaje del ApiError normalizado por el client (o cae al fallback). */
export const errMsg = (e: unknown, fallback: string): string =>
  typeof e === "object" && e !== null && "message" in e && typeof (e as { message: unknown }).message === "string"
    ? (e as { message: string }).message
    : fallback;
