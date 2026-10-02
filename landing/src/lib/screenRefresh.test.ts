import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver, onlineManager } from "@tanstack/react-query";
import { isScreenRefreshing, refreshScreen, registerScreenRefresh, updatedAgoLabel } from "./screenRefresh";

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
}

/** Monta una query como si una pantalla la estuviera mostrando. */
async function mountQuery(client: QueryClient, key: string, fn: () => Promise<unknown>) {
  const observer = new QueryObserver(client, { queryKey: [key], queryFn: fn });
  const unsubscribe = observer.subscribe(() => {});
  await vi.waitFor(() => expect(observer.getCurrentResult().isFetching).toBe(false));
  return unsubscribe;
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach(c => c());
});

describe("refreshScreen", () => {
  it("vuelve a pedir las queries que están en pantalla", async () => {
    const client = makeClient();
    const fn = vi.fn().mockResolvedValue("ok");
    cleanups.push(await mountQuery(client, "ventas", fn));
    expect(fn).toHaveBeenCalledTimes(1);

    const res = await refreshScreen(client);

    expect(res).toEqual({ ok: true, failed: 0 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("marca como viejas las queries de otras pantallas sin pedirlas", async () => {
    const client = makeClient();
    const otra = vi.fn().mockResolvedValue("ok");
    await client.prefetchQuery({ queryKey: ["otra"], queryFn: otra });

    await refreshScreen(client);

    expect(otra).toHaveBeenCalledTimes(1);
    expect(client.getQueryState(["otra"])?.isInvalidated).toBe(true);
  });

  it("corre las cargas manuales registradas y deja de correrlas al quitarlas", async () => {
    const client = makeClient();
    const load = vi.fn().mockResolvedValue(undefined);
    const unregister = registerScreenRefresh(load);

    await refreshScreen(client);
    unregister();
    await refreshScreen(client);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("avisa error si una carga manual truena", async () => {
    const client = makeClient();
    cleanups.push(registerScreenRefresh(() => Promise.reject(new Error("sin red"))));

    const res = await refreshScreen(client);

    expect(res).toEqual({ ok: false, failed: 1 });
  });

  it("avisa error si una query en pantalla falla al actualizar", async () => {
    const client = makeClient();
    const fn = vi.fn().mockResolvedValueOnce("ok").mockRejectedValueOnce(new Error("500"));
    cleanups.push(await mountQuery(client, "cortes", fn));

    const res = await refreshScreen(client);

    expect(res).toEqual({ ok: false, failed: 1 });
  });

  it("no cuenta errores viejos de antes de actualizar", async () => {
    const client = makeClient();
    const fn = vi.fn().mockRejectedValueOnce(new Error("500")).mockResolvedValueOnce("ok");
    cleanups.push(await mountQuery(client, "reportes", fn));
    expect(client.getQueryState(["reportes"])?.status).toBe("error");

    const res = await refreshScreen(client);

    expect(res.ok).toBe(true);
  });

  it("dos clics seguidos hacen un solo refresh", async () => {
    const client = makeClient();
    const load = vi.fn().mockResolvedValue(undefined);
    cleanups.push(registerScreenRefresh(load));

    const a = refreshScreen(client);
    const b = refreshScreen(client);
    expect(isScreenRefreshing()).toBe(true);
    expect(b).toBe(a);
    await a;

    expect(load).toHaveBeenCalledTimes(1);
    expect(isScreenRefreshing()).toBe(false);
  });
});

describe("refreshScreen sin red o con red colgada", () => {
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it("sin internet no dice 'Datos actualizados'", async () => {
    const client = makeClient();
    const load = vi.fn().mockResolvedValue(undefined);
    cleanups.push(registerScreenRefresh(load));
    onlineManager.setOnline(false);

    const res = await refreshScreen(client);

    expect(res.ok).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it("si la red se cuelga, suelta el botón al vencer el tope", async () => {
    const client = makeClient();
    cleanups.push(registerScreenRefresh(() => new Promise(() => {})));

    const res = await refreshScreen(client, { timeoutMs: 20 });

    expect(res).toEqual({ ok: false, failed: 1 });
    expect(isScreenRefreshing()).toBe(false);
  });
});

describe("updatedAgoLabel", () => {
  const t0 = 1_000_000_000_000;
  it("menos de un minuto → hace un momento", () => {
    expect(updatedAgoLabel(t0, t0 + 59_000)).toBe("hace un momento");
  });
  it("minutos y horas", () => {
    expect(updatedAgoLabel(t0, t0 + 5 * 60_000)).toBe("hace 5 min");
    expect(updatedAgoLabel(t0, t0 + 125 * 60_000)).toBe("hace 2 h");
  });
  it("reloj atrasado no da negativo", () => {
    expect(updatedAgoLabel(t0, t0 - 10_000)).toBe("hace un momento");
  });
});
