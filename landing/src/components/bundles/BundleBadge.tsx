import { tint } from "@/components/promos/promoTokens";
import { BUNDLE_COLOR, ENTITY } from "./bundleTokens";

/**
 * Píldora "Paquete" para Caja (resultados de búsqueda y líneas del carrito):
 * violeta, distinta del azul "Tomo" y del verde "Promo". `small` es para las
 * filas flex del carrito (sin margen propio: el contenedor ya separa con gap);
 * sin `small` va en línea con el texto, a la derecha del nombre.
 */
export function BundleBadge({ small }: { small?: boolean }) {
  return (
    <span
      title={`${ENTITY.One}: se arma con varios productos`}
      className="inline-flex shrink-0 items-center rounded-full font-extrabold uppercase tracking-wide"
      style={{
        ...tint(BUNDLE_COLOR),
        fontSize: small ? 10 : 11,
        lineHeight: 1.2,
        padding: "2px 8px",
        verticalAlign: "middle",
        ...(small ? {} : { marginLeft: 8 }),
      }}
    >
      {ENTITY.One}
    </span>
  );
}
