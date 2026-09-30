import { describe, expect, it } from "vitest";
import { DRAFT_FILES_MAX_AGE_MS, filesKeyFor, isDraftFresh } from "./draftFiles";

describe("draftFiles helpers", () => {
  it("un borrador de fotos vive 24 horas, igual que los datos", () => {
    const now = 1_000_000_000;
    expect(isDraftFresh(now - 60_000, now)).toBe(true);
    expect(isDraftFresh(now - DRAFT_FILES_MAX_AGE_MS - 1, now)).toBe(false);
    expect(isDraftFresh(now - 10, now, 5)).toBe(false);
  });

  it("las fotos van en su propia llave junto al borrador", () => {
    expect(filesKeyFor("tadaima-product-draft:7")).toBe("tadaima-product-draft:7:files");
  });
});
