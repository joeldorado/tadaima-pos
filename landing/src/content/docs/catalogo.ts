import { Package, TicketPercent, Layers, ShieldCheck, Store } from "lucide-react"
import type { DocTopic } from "./types"

const CAT = "Catálogo y precios"

const altaProducto: DocTopic = {
  slug: "alta-producto",
  title: "Alta de producto",
  category: CAT,
  icon: Package,
  summary: "Crear un producto con nombre, precios, métodos de pago e inventario por tienda.",
  sections: [
    {
      heading: "Dónde se hace",
      blocks: [
        { kind: "prose", text: "En el menú Productos, con el botón para agregar. Primero eliges el tipo: “Producto Normal” o la ruta de Tomos/Librería (lote). Esta guía cubre el producto normal." },
        { kind: "callout", tone: "info", title: "Checklist obligatorio", text: "Arriba del formulario ves tres requisitos: Nombre · Precio Normal · Inventario. Hasta que los tres estén completos, el botón “Guardar Cambios” queda deshabilitado." },
      ],
    },
    {
      heading: "Tab General",
      blocks: [
        { kind: "fields", fields: [
          { label: "Nombre del Producto", hint: "Ej. Funko Pop Goku SSJ", required: true },
          { label: "SKU / Código", hint: "Escanee o escriba — botón “Generar código (sin lector)” si no tienes lector" },
          { label: "Categoría", hint: "Elige categoría · botón + para crear una nueva al vuelo" },
          { label: "Proveedor", hint: "Elige proveedor · botón + para crear uno nuevo" },
        ] },
        { kind: "prose", text: "También puedes subir una imagen (arrastrar o clic en “Subir Imagen”). No es obligatoria, pero se ve en Caja y en la tienda en línea." },
      ],
    },
    {
      heading: "Tab Precios",
      blocks: [
        { kind: "prose", text: "El producto puede tener hasta 5 niveles de precio. Solo el Normal es obligatorio; los demás se usan según el cliente." },
        { kind: "table", head: ["Nivel", "Cuándo aplica"], rows: [
          ["Precio Normal (Default)", "Precio público. Obligatorio y mayor a 0."],
          ["Precio Socio", "Socios Tadaima (se asigna solo al escanear la tarjeta TAD)."],
          ["Precio Mayorista", "Ventas de volumen."],
          ["Precio D / Precio E", "Niveles extra configurables."],
        ] },
        { kind: "callout", tone: "warn", title: "Costo Real: solo admin", text: "El campo “Costo Real” solo lo ven administradores (y quien tenga el permiso de ver costos). Gerente y cajero no lo ven ni lo editan." },
        { kind: "prose", text: "Marca los “Métodos de pago aceptados” (Efectivo y/o Tarjeta) — al menos uno. Si marcas solo Efectivo, ese producto restringe la venta a efectivo/dólares. Opcional: “Pieza Única (No Resurtible)”." },
      ],
    },
    {
      heading: "Tab Inventario",
      blocks: [
        { kind: "prose", text: "Cada tienda tiene tres ubicaciones. Un producto nuevo necesita existencia en al menos una." },
        { kind: "table", head: ["Ubicación", "Qué es"], rows: [
          ["Piso", "Lo que está a la venta en el mostrador (vendible en Caja)."],
          ["Bodega", "Respaldo atrás, no vendible hasta moverlo a Piso."],
          ["Central", "Almacén central de la cadena."],
        ] },
        { kind: "callout", tone: "info", title: "Sin tiendas todavía", text: "Si no hay almacenes ni tiendas, primero créalos en Tiendas. El formulario te avisa." },
      ],
    },
    {
      heading: "Guardar",
      blocks: [
        { kind: "prose", text: "Botón “Guardar Cambios”. Al editar aparece además “Desactivar Producto (Baja)” y, para admin, “Eliminar”. El tab Promos se habilita una vez guardado el producto (ver la guía de Promos)." },
      ],
    },
  ],
}

const promosNxm: DocTopic = {
  slug: "promos-nxm",
  title: "Promo 2x1 (NxM)",
  category: CAT,
  icon: TicketPercent,
  summary: "El clásico “se lleva N y paga M”: 2x1, 3x2, etc., por producto.",
  sections: [
    {
      heading: "Dónde se crean las promos",
      blocks: [
        { kind: "prose", text: "Las promos se crean dentro del producto: Productos → editar el producto → tab Promos → “Nueva promo”. La página Promos del menú es solo un tablero de consulta de toda la cadena." },
        { kind: "callout", tone: "info", title: "Permiso", text: "Necesitas el permiso “Gestionar Promociones” (viene activado por defecto). Si no lo tienes, verás la lista en solo lectura." },
      ],
    },
    {
      heading: "Crear una NxM",
      blocks: [
        { kind: "steps", items: [
          { title: "Nueva promo → tipo “NxM (2x1, 3x2…)”", detail: "Descripción: “Se lleva N y paga M”." },
          { title: "Ponle Nombre", detail: "Ej. “Buen Fin 2x1”." },
          { title: "Llena “Se lleva (N)” y “Paga (M)”", detail: "N mínimo 2; M debe ser menor que N. Para un 2x1: N=2, M=1." },
          { title: "Opcional: fechas, prioridad y tienda", detail: "Inicia/Vence, prioridad (desempate) y la tienda (admin puede elegir “Todas las tiendas”)." },
          { title: "Crear promo", detail: "Aparece en la lista con su estado (Activa / Pausada / Vencida / Programada)." },
        ] },
        { kind: "callout", tone: "info", title: "Vista rápida", text: "El formulario muestra en vivo: “el cliente se lleva N y paga M → X gratis por cada N”. Así confirmas antes de guardar." },
      ],
    },
  ],
}

const descuentoCantidad: DocTopic = {
  slug: "descuento-cantidad",
  title: "Mayoreo",
  category: CAT,
  icon: Layers,
  summary: "“De 5 piezas en adelante, −$100 a cada una”. Precio especial por llevar volumen.",
  sections: [
    {
      heading: "Qué es",
      blocks: [
        { kind: "prose", text: "En lugar de dar producto gratis (como el 2x1), el mayoreo le baja dinero a CADA pieza cuando el cliente lleva suficientes. Defines dos números: a partir de cuántas piezas arranca, y cuánto se le descuenta a cada una." },
        { kind: "steps", items: [
          { title: "Nueva promo → tipo “Mayoreo”", detail: "Descripción: “Desde N pzas, −$X a cada una”." },
          { title: "A partir de (pzas)", detail: "Desde cuántas piezas arranca el precio de mayoreo. Mínimo 2." },
          { title: "Descuento c/pieza", detail: "Cuánto se le baja a CADA pieza, no al total." },
          { title: "Fechas / prioridad / tienda igual que la NxM", detail: "" },
        ] },
      ],
    },
    {
      heading: "La regla clave: aplica a TODAS las piezas",
      blocks: [
        { kind: "prose", text: "Al llegar al mínimo, el descuento se le aplica a cada pieza que lleve — no solo a las que pasan del mínimo. Con “desde 5, −$100 c/u”: 4 piezas no llevan nada, 5 piezas descuentan $500, 7 piezas descuentan $700 y 10 piezas descuentan $1,000." },
        { kind: "callout", tone: "gold", title: "Nunca descuenta de más", text: "El descuento total jamás pasa del precio de esas piezas. Si el cálculo diera más que el bruto, se recorta automáticamente y la línea queda en $0, nunca en negativo." },
      ],
    },
  ],
}

const reglasPromos: DocTopic = {
  slug: "reglas-promos",
  title: "Reglas de las promos",
  category: CAT,
  icon: ShieldCheck,
  summary: "Qué combinaciones permite el sistema y cómo se aplican solas en Caja.",
  sections: [
    {
      heading: "Lo que el sistema cuida solo",
      blocks: [
        { kind: "steps", items: [
          { title: "Un producto no mezcla los dos tipos a la vez", detail: "No puede tener un 2x1 y un “mayoreo” vigentes al mismo tiempo con fechas encimadas. Es uno o el otro. Si lo intentas, el sistema te dice cuál promo estorba." },
          { title: "Tope de promos por ámbito", detail: "Hay un máximo de promos activas por producto (globales y locales por tienda). El mensaje de error indica cuando llegas al tope." },
          { title: "Vigencias que no se enciman sí se permiten", detail: "Puedes programar una promo para después de que termine otra; el choque solo ocurre cuando las fechas se traslapan." },
        ] },
      ],
    },
    {
      heading: "Cómo se ve en Caja",
      blocks: [
        { kind: "prose", text: "En Caja no hay que hacer nada manual: al agregar el producto, el sistema aplica sola la MEJOR promo vigente (la que más ahorra; la prioridad desempata)." },
        { kind: "callout", tone: "info", title: "El descuento manual se acumula", text: "Si además pones un descuento manual en esa línea, se suma encima de la promo. El servidor siempre recalcula — nunca confía en montos del cliente." },
        { kind: "callout", tone: "warn", title: "Los tickets viejos no cambian", text: "Si editas o borras una promo, las ventas ya hechas quedan congeladas con lo que aplicaron. Solo cambia de aquí en adelante." },
      ],
    },
  ],
}

const overrideLocal: DocTopic = {
  slug: "override-local",
  title: "Personalizar promo por tienda",
  category: CAT,
  icon: Store,
  summary: "Un gerente ajusta una promo global para su sucursal sin tocar a las demás.",
  sections: [
    {
      heading: "Para qué sirve",
      blocks: [
        { kind: "prose", text: "El admin crea promos globales (aplican en todas las tiendas). Un gerente puede querer una versión distinta solo para su sucursal — sin afectar al resto ni a la promo general." },
        { kind: "steps", items: [
          { title: "Abre el producto → tab Promos", detail: "En una promo global verás el botón “Personalizar para mi tienda”." },
          { title: "Se prellena con los datos de la global", detail: "Ajusta lo que necesites (nombre lleva “· local”, escalones, fechas). Queda amarrada a tu tienda." },
          { title: "Crear", detail: "Desde ese momento, tu tienda usa TU versión." },
        ] },
      ],
    },
    {
      heading: "La regla de oro",
      blocks: [
        { kind: "callout", tone: "gold", title: "La local apaga a la global en tu tienda", text: "Mientras tu promo local esté vigente, la global NO aplica en tu sucursal — aunque la global descontara más. Es un reemplazo deliberado, no “la mejor de las dos”." },
        { kind: "prose", text: "Si borras o pausas tu promo local, la global vuelve sola a tu tienda. En las demás tiendas la global nunca se tocó." },
        { kind: "chips", chips: [
          { label: "Opacada en tu tienda", tone: "amber" },
          { label: "Reemplaza a la global", tone: "blue" },
        ] },
        { kind: "prose", text: "Esos chips aparecen en la lista: “Opacada…” sobre la global cuando una local la tapa, y “Reemplaza a la global” sobre tu local. Así ves de un vistazo qué manda en cada tienda." },
      ],
    },
  ],
}

export const CATALOGO_TOPICS: DocTopic[] = [
  altaProducto,
  promosNxm,
  descuentoCantidad,
  reglasPromos,
  overrideLocal,
]
