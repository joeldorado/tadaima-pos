import { TabTadaimaUS } from "@/components/admin/TabTadaimaUS";

/**
 * TadaimaUS — página dedicada del módulo admin de la tienda US (tadaimaus.com,
 * precios en dólares, pedidos de contacto sin cobro online).
 *
 * Reusa el MISMO módulo que el tab "TadaimaUS" de AdminPage (una sola
 * implementación, dos puntos de entrada — DRY):
 *  - Publicados: buscar productos existentes del POS y publicarlos con precio
 *    manual en USD (se reusa foto/nombre del producto; nombre/descripción EN
 *    opcionales), tabla con precio editable, visibilidad y stock.
 *  - Pedidos: pedidos dummy de la tienda US (folio US-XXXXX) con datos de
 *    contacto, items expandibles y cambio de status.
 *
 * Gate de acceso (solo admin):
 *  - Ruta /tadaima-us envuelta en <ProtectedRoute requiresPage="admin">.
 *  - Entrada "TadaimaUS" al final del menú, visible solo para rol admin
 *    (NAV_BY_ROLE.admin en Layout.tsx).
 */
export function TadaimaUsPage() {
  return (
    <div className="min-h-screen app-bg p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <TabTadaimaUS />
      </div>
    </div>
  );
}
