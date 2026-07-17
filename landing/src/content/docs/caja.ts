import { ShoppingCart, Wallet, ShoppingBasket } from "lucide-react"
import type { DocTopic } from "./types"

const CAT = "Caja y ventas"

const cobroCaja: DocTopic = {
  slug: "cobro-caja",
  title: "Cobro en Caja",
  category: CAT,
  icon: ShoppingCart,
  summary: "Escanear, armar el carrito y cobrar en efectivo, tarjeta, dólares o mixto.",
  sections: [
    {
      heading: "Antes de vender: abrir caja",
      blocks: [
        { kind: "prose", text: "Cada usuario abre su caja con el efectivo inicial del cajón. Todo lo que cobres queda en tu sesión hasta que cierres y hagas tu corte." },
      ],
    },
    {
      heading: "Armar la venta",
      blocks: [
        { kind: "steps", items: [
          { title: "Busca o escanea el producto", detail: "Lector USB (QR / Code128 / EAN13) o escribe nombre/SKU. Re-escanear el mismo producto NO suma: entra con cantidad 1 y ajustas con +/−." },
          { title: "Asigna cliente (opcional)", detail: "Manual, o escanea la tarjeta TAD de socio Tadaima (asigna cliente y precio socio automático). Lo quitas con la ✕ del pie." },
          { title: "Ajusta cantidades y descuentos", detail: "Puedes poner un descuento manual por línea (con motivo y quién autoriza); se acumula sobre cualquier promo." },
        ] },
        { kind: "callout", tone: "info", title: "Cargar una preventa", text: "Escribe el folio (empieza con PREV-) en el buscador y se carga el pedido con sus productos y cliente." },
      ],
    },
    {
      heading: "Cobrar",
      blocks: [
        { kind: "prose", text: "El cobro puede ser mixto: combina efectivo + tarjeta + dólares + transferencia en una misma venta." },
        { kind: "callout", tone: "info", title: "Dólares con tipo de cambio", text: "Al recibir dólares, el sistema usa el TC del día y muestra el cambio bilingüe (USD/MXN). Se guardan los dólares físicos recibidos y el TC de esa venta para el corte y los reportes." },
        { kind: "callout", tone: "warn", title: "Comisión de terminal", text: "La comisión de la terminal la absorbe la tienda — NUNCA se le cobra al cliente. Solo se registra el % por venta para reportes." },
        { kind: "prose", text: "Al terminar se imprime el ticket térmico. Desde Ventas puedes reimprimirlo." },
      ],
    },
  ],
}

const cortesCaja: DocTopic = {
  slug: "cortes-caja",
  title: "Cortes de caja",
  category: CAT,
  icon: Wallet,
  summary: "Cerrar la caja, comparar declarado vs esperado y el corte del gerente.",
  sections: [
    {
      heading: "Cerrar tu caja",
      blocks: [
        { kind: "prose", text: "Al final del turno usa el botón “Cerrar Caja”. Declaras el efectivo contado y el sistema lo compara contra lo esperado (inicial + ventas en efectivo − salidas) y marca el descuadre si lo hay." },
        { kind: "callout", tone: "warn", title: "Caja de día anterior", text: "Si dejaste una caja abierta de un día previo, aparece un banner de aviso y no puedes vender sobre esa sesión vieja: primero ciérrala y abre una nueva." },
      ],
    },
    {
      heading: "Cortes e historial",
      blocks: [
        { kind: "prose", text: "En “Cortes” consultas el historial de sesiones (cada una imprimible). El indicador “Abierta {hora}” te dice cuáles siguen sin cerrar." },
        { kind: "callout", tone: "info", title: "Corte del gerente", text: "El gerente ve los cortes de su tienda con KPIs (sesiones, ventas, entradas, salidas). El cálculo aplica IVA 16% sobre la comisión de terminal y guarda los dólares físicos + TC de cada sesión." },
      ],
    },
  ],
}

const insumos: DocTopic = {
  slug: "insumos",
  title: "Insumos y origen del dinero",
  category: CAT,
  icon: ShoppingBasket,
  summary: "Registrar compras de operación indicando de dónde salió el dinero.",
  sections: [
    {
      heading: "Registrar una compra",
      blocks: [
        { kind: "steps", items: [
          { title: "Menú Insumos → tab “Registrar compra”", detail: "" },
          { title: "Elige el insumo", detail: "Escribe el nombre (cinta, bolsas…). Si no existe, se crea al vuelo y queda seleccionado." },
          { title: "Cantidad y monto", detail: "" },
          { title: "“¿De dónde salió el dinero?”", detail: "Elige el origen. Si no es de la caja, aparece “¿Quién puso el dinero?” (ej. Mario)." },
          { title: "Nota opcional y “Registrar compra”", detail: "" },
        ] },
      ],
    },
    {
      heading: "El origen del dinero define el corte",
      blocks: [
        { kind: "table", head: ["Origen", "¿Toca tu corte?"], rows: [
          ["Caja", "Sí. El efectivo sale de tu cajón y pega a tu corte. Necesitas caja abierta."],
          ["Caja chica", "No. Es gasto registrado fuera del cajón."],
          ["Dinero propio", "No. Solo queda como registro (con el nombre de quién puso el dinero)."],
        ] },
        { kind: "callout", tone: "gold", title: "Regla simple", text: "Solo el origen “Caja” descuenta del efectivo esperado. Caja chica y dinero propio son registro y no descuadran tu corte." },
        { kind: "prose", text: "Abajo ves “Compras de hoy”. El histórico completo se consulta en el tab Reporte, con su rango de fechas y desglose por origen del dinero." },
      ],
    },
  ],
}

export const CAJA_TOPICS: DocTopic[] = [cobroCaja, cortesCaja, insumos]
