import { UserCircle2, BarChart2 } from "lucide-react"
import type { DocTopic } from "./types"

const CAT = "Clientes y reportes"

const clientes: DocTopic = {
  slug: "clientes",
  title: "Clientes",
  category: CAT,
  icon: UserCircle2,
  summary: "Alta de clientes, socios Tadaima y su historial de compras.",
  sections: [
    {
      heading: "Alta y uso",
      blocks: [
        { kind: "prose", text: "Registras clientes con sus datos básicos. En Caja los asignas a una venta manualmente o escaneando su tarjeta TAD de socio Tadaima." },
        { kind: "callout", tone: "info", title: "Socio Tadaima", text: "El socio se identifica con su id externo (external_member_id, ligado a Supabase). Al asignarlo, la venta toma el precio nivel Socio automáticamente — salvo en pago con tarjeta o en preventa, donde no aplica." },
        { kind: "callout", tone: "warn", title: "Supabase es solo lectura", text: "El padrón de socios (loyalty) se lee desde el POS pero no se escribe ni se migra desde aquí." },
      ],
    },
  ],
}

const reportes: DocTopic = {
  slug: "reportes",
  title: "Reportes",
  category: CAT,
  icon: BarChart2,
  summary: "Reporte del día, rangos de fechas y análisis de ventas, productos y caja.",
  sections: [
    {
      heading: "Qué hay",
      blocks: [
        { kind: "prose", text: "El “Reporte del Día” resume la operación de la jornada. La sección de Reportes agrega ventas (con 7 presets de fecha), top de productos, clientes y sesiones de caja con su descuadre." },
        { kind: "callout", tone: "warn", title: "Costos y utilidad: por permiso", text: "El costo, la utilidad y la ganancia bruta solo se ven con el permiso “ver costos” (por defecto, admin). Gerente y cajero ven ventas sin esa información financiera." },
        { kind: "prose", text: "El histórico se consulta por rango de fechas (por defecto hoy → hoy). Todo es imprimible y exportable a PDF." },
      ],
    },
  ],
}

export const CLIENTES_REPORTES_TOPICS: DocTopic[] = [clientes, reportes]
