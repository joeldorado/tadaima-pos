import { describe, it, expect } from "vitest";
import {
  buildSearchIndex,
  flattenBlocksText,
  normalizeSearchText,
  searchDocs,
  sectionAnchor,
  slugify,
  type DocsSearchTopicInput,
} from "./docsSearch";

describe("normalizeSearchText", () => {
  it("pasa a minúsculas y quita acentos", () => {
    expect(normalizeSearchText("Impresión Automática")).toBe("impresion automatica");
    expect(normalizeSearchText("CAJA")).toBe("caja");
  });

  it("conserva la ñ como letra buscable consistente", () => {
    // ñ → NFD separa la virgulilla (U+0303, dentro del rango que se elimina):
    // lo importante es que query y haystack pasen por la MISMA normalización.
    expect(normalizeSearchText("niño")).toBe(normalizeSearchText("nino"));
  });
});

describe("slugify", () => {
  it("convierte headings reales a kebab-case sin acentos", () => {
    expect(slugify("Cerrar tu caja")).toBe("cerrar-tu-caja");
    expect(slugify("Antes de vender: abrir caja")).toBe("antes-de-vender-abrir-caja");
    expect(slugify("Instalación en cada caja (Windows, una sola vez)")).toBe(
      "instalacion-en-cada-caja-windows-una-sola-vez",
    );
  });

  it("recorta guiones al inicio y al final", () => {
    expect(slugify("  ¿Qué es?  ")).toBe("que-es");
  });
});

describe("sectionAnchor", () => {
  it("prefiere el id explícito de la sección", () => {
    expect(sectionAnchor({ id: "cobrar", heading: "Cobrar la venta" })).toBe("cobrar");
  });

  it("cae al slug del heading cuando no hay id", () => {
    expect(sectionAnchor({ heading: "Cortes e historial" })).toBe("cortes-e-historial");
  });
});

describe("flattenBlocksText", () => {
  it("aplana prose, steps, callout y table", () => {
    const text = flattenBlocksText([
      { kind: "prose", text: "Abre la caja" },
      { kind: "steps", items: [{ title: "Paso uno", detail: "con detalle" }, { title: "Paso dos" }] },
      { kind: "callout", tone: "info", title: "Ojo", text: "importante" },
      { kind: "table", head: ["Columna"], rows: [["celda"]] },
    ]);
    for (const chunk of ["Abre la caja", "Paso uno", "con detalle", "Paso dos", "Ojo", "importante", "Columna", "celda"]) {
      expect(text).toContain(chunk);
    }
  });

  it("ignora los bloques visuales (chips, fields, image, link)", () => {
    const text = flattenBlocksText([
      { kind: "chips", chips: [{ label: "NO-DEBE-SALIR", tone: "green" }] },
      { kind: "fields", fields: [{ label: "NO-DEBE-SALIR-2" }] },
      { kind: "image", src: "caja/01.png", alt: "NO-DEBE-SALIR-3" },
      { kind: "link", toTopic: "cobro-caja", label: "NO-DEBE-SALIR-4" },
    ]);
    expect(text.trim()).toBe("");
  });
});

const TOPICS: DocsSearchTopicInput[] = [
  {
    slug: "cobro-caja",
    title: "Cobrar en Caja",
    category: "Caja",
    summary: "Cómo armar y cobrar una venta",
    keywords: ["venta", "ticket"],
    sections: [
      {
        heading: "Cobrar",
        blocks: [{ kind: "prose", text: "Elige el método de pago y confirma" }],
      },
      {
        id: "abrir",
        heading: "Antes de vender: abrir caja",
        blocks: [{ kind: "prose", text: "Necesitas fondo inicial" }],
      },
    ],
  },
  {
    slug: "promos-nxm",
    title: "Promociones NxM",
    category: "Catálogo",
    summary: "Compra N paga M",
    sections: [{ heading: "Crear una NxM", blocks: [{ kind: "prose", text: "Define buy y pay" }] }],
  },
];

describe("buildSearchIndex", () => {
  it("genera una entrada por tema y una por sección", () => {
    const index = buildSearchIndex(TOPICS);
    expect(index).toHaveLength(5); // 2 temas + 3 secciones
    expect(index.filter((e) => e.type === "tema")).toHaveLength(2);
    expect(index.filter((e) => e.type === "seccion")).toHaveLength(3);
  });

  it("la entrada de tema indexa title, summary y keywords", () => {
    const index = buildSearchIndex(TOPICS);
    const tema = index.find((e) => e.type === "tema" && e.tema === "cobro-caja")!;
    expect(tema.haystack).toContain("cobrar en caja");
    expect(tema.haystack).toContain("armar y cobrar");
    expect(tema.haystack).toContain("ticket");
    expect(tema.seccion).toBeUndefined();
  });

  it("la sección usa su id explícito como ancla, o el slug del heading", () => {
    const index = buildSearchIndex(TOPICS);
    const conId = index.find((e) => e.type === "seccion" && e.label.startsWith("Antes"))!;
    expect(conId.seccion).toBe("abrir");
    const sinId = index.find((e) => e.type === "seccion" && e.label === "Cobrar")!;
    expect(sinId.seccion).toBe("cobrar");
  });

  it("la sección indexa heading + textos de sus bloques y apunta a su tema", () => {
    const index = buildSearchIndex(TOPICS);
    const seccion = index.find((e) => e.seccion === "cobrar")!;
    expect(seccion.haystack).toContain("metodo de pago");
    expect(seccion.tema).toBe("cobro-caja");
    expect(seccion.context).toBe("Cobrar en Caja");
  });
});

describe("searchDocs", () => {
  const index = buildSearchIndex(TOPICS);

  it("matchea sin importar acentos ni mayúsculas", () => {
    const porAcento = searchDocs(index, "MÉTODO");
    expect(porAcento.some((e) => e.seccion === "cobrar")).toBe(true);
    const sinAcento = searchDocs(index, "metodo");
    expect(sinAcento).toEqual(porAcento);
  });

  it("multi-token exige que TODOS los tokens aparezcan (AND)", () => {
    const hits = searchDocs(index, "fondo inicial");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.seccion).toBe("abrir");
    expect(searchDocs(index, "fondo nxm")).toHaveLength(0);
  });

  it("query vacía o de puros espacios no regresa nada", () => {
    expect(searchDocs(index, "")).toHaveLength(0);
    expect(searchDocs(index, "   ")).toHaveLength(0);
  });

  it("keywords del tema son buscables", () => {
    const hits = searchDocs(index, "ticket");
    expect(hits.some((e) => e.type === "tema" && e.tema === "cobro-caja")).toBe(true);
  });
});
