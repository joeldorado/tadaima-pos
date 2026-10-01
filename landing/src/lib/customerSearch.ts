/**
 * Búsqueda local de clientes (Gestión de Clientes, 2026-10-01): sin importar
 * acentos ni mayúsculas, palabra por palabra (todas deben aparecer en nombre,
 * correo, teléfono o número de socio). Antes era `name.includes(q)` con la
 * frase completa: "andrea lizarraga" no encontraba a "Andrea Lizárraga Navarro".
 */

export interface SearchableCustomer {
  name: string;
  email?: string | null;
  phone?: string | null;
  external_member_id?: string | null;
}

/** Minúsculas y sin acentos ("Lizárraga Núñez" → "lizarraga nunez"). */
export function normalizeSearchText(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function matchesCustomerSearch(customer: SearchableCustomer, q: string): boolean {
  const words = normalizeSearchText(q).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  const haystack = normalizeSearchText(
    [customer.name, customer.email ?? "", customer.external_member_id ?? ""].join(" "),
  );
  const phoneDigits = (customer.phone ?? "").replace(/\D/g, "");

  return words.every(word => {
    if (haystack.includes(word)) return true;
    const digits = word.replace(/\D/g, "");
    return digits.length >= 3 && digits === word.replace(/[\s()+-]/g, "") && phoneDigits.includes(digits);
  });
}
