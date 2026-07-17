import { ClipboardList, Bookmark } from "lucide-react"
import type { DocTopic } from "./types"

const CAT = "Pedidos"

const preventas: DocTopic = {
  slug: "preventas",
  title: "Preventas",
  category: CAT,
  icon: ClipboardList,
  summary: "Pre-órdenes con anticipo que se liquidan al recoger. El núcleo del negocio.",
  sections: [
    {
      heading: "Cómo funciona",
      blocks: [
        { kind: "prose", text: "Una preventa es un pedido con anticipo: el cliente aparta con un adelanto y liquida el resto cuando llega el producto. Cada preventa vive en un catálogo (una campaña con sus productos, precios e imagen)." },
        { kind: "callout", tone: "info", title: "Catálogos: solo admin", text: "El admin crea/edita/cierra/cancela los catálogos (tab Catálogos), define stock por tienda e imagen. Gerente y cajero solo ven los catálogos publicados para vender." },
      ],
    },
    {
      heading: "El día a día",
      blocks: [
        { kind: "steps", items: [
          { title: "Tomar la preventa", detail: "Desde un catálogo publicado, con el anticipo del cliente." },
          { title: "Liquidar al recoger", detail: "En Caja escribe el folio (PREV-…) y se carga el pedido con productos y cliente para cobrar el saldo." },
          { title: "Seguimiento por folios", detail: "Los tabs Folios (Pendiente / Listo / Entregado / Vencido), Difusión (avisar por WhatsApp/email) y Vencidos organizan el estatus." },
        ] },
        { kind: "callout", tone: "warn", title: "Límite por cliente", text: "Un catálogo puede tener límite de piezas por cliente. Ojo: solo bloquea en los catálogos donde SE CONFIGURÓ el límite (arrancan sin límite). La identidad del cliente combina id + teléfono + socio." },
      ],
    },
  ],
}

const apartados: DocTopic = {
  slug: "apartados",
  title: "Apartados (layaways)",
  category: CAT,
  icon: Bookmark,
  summary: "El cliente abona en partes hasta cubrir el total y se lleva el producto.",
  sections: [
    {
      heading: "Flujo",
      blocks: [
        { kind: "prose", text: "A diferencia de la preventa (producto que aún no llega), el apartado es sobre producto que ya existe: el cliente lo separa y lo va abonando." },
        { kind: "steps", items: [
          { title: "Crear el apartado", detail: "Con el producto y el abono inicial del cliente." },
          { title: "Registrar abonos", detail: "Cada pago baja el saldo pendiente." },
          { title: "Entregar al liquidar", detail: "Cuando el saldo llega a cero, se entrega el producto." },
        ] },
      ],
    },
  ],
}

export const PEDIDOS_TOPICS: DocTopic[] = [preventas, apartados]
