import { Store, KeyRound, Building2 } from "lucide-react"
import type { DocTopic } from "./types"

const CAT = "Difusión y administración"

const tiendaOnline: DocTopic = {
  slug: "tienda-online",
  title: "Tienda en línea / Catálogo",
  category: CAT,
  icon: Store,
  summary: "Publicar el catálogo para que el cliente vea productos y pida por WhatsApp.",
  sections: [
    {
      heading: "Qué es",
      blocks: [
        { kind: "prose", text: "La tienda en línea es una página pública (no requiere login) donde el cliente ve los productos, sus promos vigentes y precios, y hace pedido. Arriba están la búsqueda y los filtros; entra mostrando lo más nuevo primero." },
        { kind: "steps", items: [
          { title: "El cliente arma su pedido", detail: "Filtra, busca y agrega al carrito." },
          { title: "Elige dónde recoger", detail: "Selecciona la sucursal en el carrito. Solo aparecen las tiendas que tienen número de WhatsApp configurado." },
          { title: "Pide por WhatsApp", detail: "El pedido se manda por WhatsApp a la tienda elegida." },
        ] },
        { kind: "callout", tone: "warn", title: "Tienda sin WhatsApp no aparece", text: "Si una sucursal no tiene número, no sale como opción para recoger. El número se precarga del alta de la tienda y se puede cambiar en la configuración de la tienda." },
      ],
    },
  ],
}

const usuariosRbac: DocTopic = {
  slug: "usuarios-rbac",
  title: "Usuarios y permisos (RBAC)",
  category: CAT,
  icon: KeyRound,
  summary: "Roles admin / gerente / cajero y qué puede hacer cada uno.",
  sections: [
    {
      heading: "Los tres roles",
      blocks: [
        { kind: "table", head: ["Rol", "Alcance"], rows: [
          ["Admin", "Ve y hace todo: costos, reportes globales, tiendas, usuarios, catálogos de preventa."],
          ["Gerente", "Su tienda: crea/edita productos (sin costo), cortes, promos locales. No ve reportes globales."],
          ["Cajero", "Su día a día: vender en Caja, sus cortes, alta rápida de producto (sin costo)."],
        ] },
      ],
    },
    {
      heading: "Reglas de gestión",
      blocks: [
        { kind: "callout", tone: "gold", title: "El gerente no escala privilegios", text: "El gerente gestiona usuarios de SU tienda, pero NUNCA puede crear ni promover a administrador. Esa barrera está reforzada en el servidor." },
        { kind: "prose", text: "Los permisos son por página (Caja, Reportes, Productos…) y hay permisos finos como “Gestionar Promociones” y “ver costos”, que el admin activa por usuario. El admin puede ver la contraseña de otros usuarios (copia reversible); el login sigue protegido." },
      ],
    },
  ],
}

const tiendasAlmacenes: DocTopic = {
  slug: "tiendas-almacenes",
  title: "Tiendas y almacenes",
  category: CAT,
  icon: Building2,
  summary: "Crear sucursales y almacenes — el primer paso al montar el sistema.",
  sections: [
    {
      heading: "Primeros pasos",
      blocks: [
        { kind: "prose", text: "Antes de dar de alta productos necesitas al menos una tienda. Si el sistema está vacío, el tablero de Inicio muestra un asistente de “primeros pasos” que te guía a crear la primera tienda." },
        { kind: "steps", items: [
          { title: "Crear la tienda", detail: "Nombre, teléfono (se usa como WhatsApp de la tienda en línea) y datos de la sucursal." },
          { title: "Configurar almacenes", detail: "Cada tienda maneja Piso, Bodega y el Central de la cadena." },
          { title: "Ya puedes dar de alta productos", detail: "Con inventario asignado a esas ubicaciones." },
        ] },
        { kind: "callout", tone: "info", title: "Solo admin", text: "El alta y edición de tiendas es del administrador. El gerente cambia de sucursal con el switcher del encabezado." },
      ],
    },
  ],
}

export const ADMIN_TOPICS: DocTopic[] = [tiendaOnline, usuariosRbac, tiendasAlmacenes]
