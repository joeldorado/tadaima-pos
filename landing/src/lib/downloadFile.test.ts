import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadBlob, REVOKE_DELAY_MS } from "./downloadFile";

interface FakeAnchor {
  href: string;
  download: string;
  rel: string;
  style: { display: string };
  click: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

describe("downloadBlob", () => {
  let anchor: FakeAnchor;
  const appendChild = vi.fn();
  const createObjectURL = vi.fn(() => "blob:tadaima/1");
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    anchor = { href: "", download: "", rel: "", style: { display: "" }, click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal("document", { createElement: () => anchor, body: { appendChild } });
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("agrega el enlace a la página, le da clic y lo quita", () => {
    downloadBlob(new Blob(["x"]), "reporte.xlsx");

    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.download).toBe("reporte.xlsx");
    expect(anchor.href).toBe("blob:tadaima/1");
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.remove).toHaveBeenCalledTimes(1);
  });

  it("no libera el archivo antes de tiempo (Chrome la marcaba fallida)", () => {
    downloadBlob(new Blob(["x"]), "reporte.xlsx");

    vi.advanceTimersByTime(REVOKE_DELAY_MS - 1);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:tadaima/1");
  });
});
