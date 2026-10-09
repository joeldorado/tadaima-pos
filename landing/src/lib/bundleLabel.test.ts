import { describe, expect, it } from "vitest";
import {
  LABEL_HEIGHT_MM, LABEL_WIDTH_MM, MAX_COPIES, buildLabelHtml, clampCopies, escapeHtml, formatLabelPrice,
  labelBarcodeValue,
} from "./bundleLabel";
import type { LabelData } from "./bundleLabel";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" data-test="code"><rect/></svg>';
const DATA: LabelData = { name: "Paquete <b>Goku</b> & Vegeta", price: 450, sku: "PAQ-0001", barcode: "4006381333931" };

describe("labelBarcodeValue", () => {
  it("EAN-13 válido → EAN13", () => {
    expect(labelBarcodeValue(DATA)).toEqual({ value: "4006381333931", format: "EAN13" });
    expect(labelBarcodeValue({ ...DATA, barcode: " 4006381333931 " })).toEqual({ value: "4006381333931", format: "EAN13" });
  });

  it("código inválido → CODE128 del código tal cual", () => {
    expect(labelBarcodeValue({ ...DATA, barcode: "ABC-123" })).toEqual({ value: "ABC-123", format: "CODE128" });
    expect(labelBarcodeValue({ ...DATA, barcode: "4006381333932" })).toEqual({ value: "4006381333932", format: "CODE128" });
  });

  it("sin código → CODE128 del SKU", () => {
    expect(labelBarcodeValue({ ...DATA, barcode: null })).toEqual({ value: "PAQ-0001", format: "CODE128" });
    expect(labelBarcodeValue({ ...DATA, barcode: "  " })).toEqual({ value: "PAQ-0001", format: "CODE128" });
  });
});

describe("clampCopies", () => {
  it("acota a 1..MAX_COPIES y limpia NaN/decimales", () => {
    expect(clampCopies(5)).toBe(5);
    expect(clampCopies(0)).toBe(1);
    expect(clampCopies(-2)).toBe(1);
    expect(clampCopies(Number.NaN)).toBe(1);
    expect(clampCopies(3.7)).toBe(3);
    expect(clampCopies(MAX_COPIES + 1)).toBe(MAX_COPIES);
  });
});

describe("escapeHtml / formatLabelPrice", () => {
  it("escapa &, <, >, comillas", () => {
    expect(escapeHtml(`<b>"Goku" & 'Vegeta'</b>`)).toBe("&lt;b&gt;&quot;Goku&quot; &amp; &#39;Vegeta&#39;&lt;/b&gt;");
    expect(escapeHtml("sin nada")).toBe("sin nada");
  });

  it("precio en pesos sin centavos cuando son cero", () => {
    expect(formatLabelPrice(450)).toBe("$450");
    expect(formatLabelPrice(450.5)).toBe("$450.50");
    expect(formatLabelPrice(1250)).toBe("$1,250");
    expect(formatLabelPrice(Number.NaN)).toBe("$0");
  });
});

describe("buildLabelHtml", () => {
  const html = buildLabelHtml(DATA, SVG, 3);

  it("es un documento completo con @page de 58×40 mm y sin scripts", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain(`@page { size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm; margin: 2mm }`);
    expect(html).toContain("@page");
    expect(html.toLowerCase()).not.toContain("<script");
  });

  it("escapa el nombre, pinta el precio y el SKU", () => {
    expect(html).toContain("Paquete &lt;b&gt;Goku&lt;/b&gt; &amp; Vegeta");
    expect(html).not.toContain("<b>Goku</b>");
    expect(html).toContain("$450");
    expect(html).toContain("PAQ-0001");
  });

  it("repite la etiqueta y el SVG tantas veces como copias, con salto de página salvo en la última", () => {
    expect(html.split(SVG).length - 1).toBe(3);
    expect(html.split('class="label"').length - 1).toBe(3);
    expect(html.split("page-break-after: always").length - 1).toBe(2);
  });

  it("una sola copia no lleva salto de página; copias fuera de rango se acotan", () => {
    const one = buildLabelHtml(DATA, SVG, 1);
    expect(one.split(SVG).length - 1).toBe(1);
    expect(one).not.toContain("page-break-after: always");
    expect(buildLabelHtml(DATA, SVG, 0).split(SVG).length - 1).toBe(1);
    expect(buildLabelHtml(DATA, SVG, 999).split(SVG).length - 1).toBe(MAX_COPIES);
  });

  it("solo usa negro puro para el texto (la térmica lava los grises)", () => {
    expect(html).not.toMatch(/#(555|666|777|888|999|aaa|bbb|ccc)\b/i);
    expect(html).toContain("color: #000");
  });
});
