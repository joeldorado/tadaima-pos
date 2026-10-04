import { describe, expect, it } from "vitest";
import { LINE_COMMENT_MAX, lineCommentPayload, normalizeLineComment, withLineComment } from "./lineComment";

describe("normalizeLineComment", () => {
  it("quita espacios de sobra al inicio, al final y en medio", () => {
    expect(normalizeLineComment("  para   la promo \n")).toBe("para la promo");
  });

  it("solo espacios es 'sin comentario'", () => {
    expect(normalizeLineComment("   ")).toBe("");
  });

  it("corta al tope que acepta el server", () => {
    const largo = "a".repeat(LINE_COMMENT_MAX + 25);
    expect(normalizeLineComment(largo)).toHaveLength(LINE_COMMENT_MAX);
  });

  it("no deja un espacio colgando si el corte cae después de una palabra", () => {
    const texto = `${"a".repeat(LINE_COMMENT_MAX - 1)} cola`;
    expect(normalizeLineComment(texto)).toBe("a".repeat(LINE_COMMENT_MAX - 1));
  });
});

describe("withLineComment", () => {
  const linea: { lineId: string; quantity: number; comment?: string } = { lineId: "L1", quantity: 2 };

  it("pone el comentario ya limpio", () => {
    expect(withLineComment(linea, "  regalo ")).toEqual({ lineId: "L1", quantity: 2, comment: "regalo" });
  });

  it("vacío quita la llave en vez de dejarla en blanco", () => {
    const conComentario = { ...linea, comment: "regalo" };
    expect(withLineComment(conComentario, "  ")).toEqual(linea);
    expect(withLineComment(conComentario, "  ")).not.toHaveProperty("comment");
  });

  it("no muta la línea original", () => {
    const original = { ...linea, comment: "viejo" };
    withLineComment(original, "nuevo");
    expect(original.comment).toBe("viejo");
  });
});

describe("lineCommentPayload", () => {
  it("solo viaja al cobrar si hay comentario", () => {
    expect(lineCommentPayload({ comment: " lo recoge Juan " })).toEqual({ comment: "lo recoge Juan" });
    expect(lineCommentPayload({})).toEqual({});
    expect(lineCommentPayload({ comment: "  " })).toEqual({});
  });
});
