import { PackageSearch, ArrowLeftRight } from "lucide-react"
import type { DocTopic } from "./types"

const CAT = "Inventario"

const existencias: DocTopic = {
  slug: "existencias",
  title: "Existencias e inventario",
  category: CAT,
  icon: PackageSearch,
  summary: "Consultar stock por tienda y mover producto entre Piso, Bodega y Central.",
  sections: [
    {
      heading: "Consultar stock",
      blocks: [
        { kind: "prose", text: "En Inventario / Existencias buscas por nombre, SKU o código y ves cuánto hay en cada tienda y ubicación. El gerente y el cajero ven el stock de su tienda." },
      ],
    },
    {
      heading: "Las tres ubicaciones",
      blocks: [
        { kind: "table", head: ["Ubicación", "Vendible en Caja"], rows: [
          ["Piso", "Sí — es lo que está al frente para vender."],
          ["Bodega", "No — respaldo atrás; muévelo a Piso para venderlo."],
          ["Central", "No — almacén central de la cadena."],
        ] },
        { kind: "callout", tone: "info", title: "Mover con QuickStock", text: "Desde el producto (o el modal QuickStock) ajustas cantidades y mueves entre Piso y Bodega. Cada ajuste queda en auditoría con su diferencia (delta)." },
      ],
    },
  ],
}

const traslados: DocTopic = {
  slug: "traslados",
  title: "Traslados entre tiendas",
  category: CAT,
  icon: ArrowLeftRight,
  summary: "Enviar producto de una sucursal a otra y confirmarlo al recibir.",
  sections: [
    {
      heading: "Flujo",
      blocks: [
        { kind: "steps", items: [
          { title: "Solicitar el traslado", detail: "Eliges producto, cantidad y tiendas origen/destino. Queda “pendiente” hasta que se confirme." },
          { title: "Confirmar / completar", detail: "El admin puede “Completar ahora”. El gerente solo solicita; la confirmación del destino la hace el admin." },
        ] },
        { kind: "callout", tone: "info", title: "Nivel bodega", text: "Los traslados se manejan a nivel de bodega entre tiendas, de modo que el stock cuadre en origen y destino." },
      ],
    },
  ],
}

export const INVENTARIO_TOPICS: DocTopic[] = [existencias, traslados]
