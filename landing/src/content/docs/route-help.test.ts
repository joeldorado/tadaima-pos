import { describe, it, expect } from "vitest";
import { ROUTE_HELP, helpTopicFor } from "./route-help";
import { DOC_TOPICS } from "./index";

describe("ROUTE_HELP", () => {
  it("todos los slugs destino existen en DOC_TOPICS", () => {
    const slugs = new Set(DOC_TOPICS.map((t) => t.slug));
    for (const entry of ROUTE_HELP) {
      expect(slugs.has(entry.topic), `topic '${entry.topic}' no existe en DOC_TOPICS`).toBe(true);
    }
  });

  it("cada ruta principal del POS resuelve a su tema", () => {
    expect(helpTopicFor("/caja")).toBe("cobro-caja");
    expect(helpTopicFor("/products")).toBe("alta-producto");
    expect(helpTopicFor("/cortes")).toBe("cortes-caja");
    expect(helpTopicFor("/pre-sales")).toBe("preventas");
    expect(helpTopicFor("/sales")).toBe("reportes"); // → historial-ventas cuando exista
    expect(helpTopicFor("/transfers")).toBe("traslados");
    expect(helpTopicFor("/clients")).toBe("clientes");
    expect(helpTopicFor("/reports")).toBe("reportes");
    expect(helpTopicFor("/layaways")).toBe("apartados");
    expect(helpTopicFor("/promos")).toBe("promos-nxm");
    expect(helpTopicFor("/insumos")).toBe("insumos");
    expect(helpTopicFor("/buscar-tiendas")).toBe("existencias");
    expect(helpTopicFor("/settings")).toBe("tienda-online");
    expect(helpTopicFor("/stores")).toBe("tiendas-almacenes");
    expect(helpTopicFor("/admin")).toBe("usuarios-rbac");
  });

  it("matchea subrutas pero no prefijos parciales", () => {
    expect(helpTopicFor("/caja/whatever")).toBe("cobro-caja");
    expect(helpTopicFor("/cajayx")).toBeUndefined();
  });

  it("rutas sin tutorial regresan undefined", () => {
    expect(helpTopicFor("/")).toBeUndefined();
    expect(helpTopicFor("/login")).toBeUndefined();
    expect(helpTopicFor("/documentacion")).toBeUndefined();
  });
});
