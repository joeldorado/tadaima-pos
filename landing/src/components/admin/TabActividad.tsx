import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { History } from "lucide-react";
import { toast } from "sonner";
import { exportActivityCsv } from "@tadaima/api";
import { RefreshDataButton } from "@/components/layout/RefreshDataButton";
import { useActivityQuery, useActivitySummaryQuery } from "@/hooks/queries/useActivity";
import { useUsersQuery } from "@/hooks/queries/useUsers";
import { daysAgoLocal, getTodayLocal } from "@/lib/date";
import { downloadWithRetry } from "@/lib/downloadFile";
import {
  buildActivitySummaryParams,
  filtersEqual,
  filtersFromSearchParams,
  filtersToSearchParams,
  type ActivityFilterState,
} from "@/lib/activityParams";
import { ActivityFilterBar } from "./activity/ActivityFilterBar";
import { ActivityFocusHeader } from "./activity/ActivityFocusHeader";
import { ActivitySummaryCards } from "./activity/ActivitySummaryCards";
import { ActivityTable } from "./activity/ActivityTable";

const DEFAULT_RANGE_DAYS = 29;

/**
 * Administración → Actividad (solo admin, 2026-10-29).
 * Quién hizo qué, con qué producto y en qué tienda: feed unificado de
 * movimientos de stock + bitácora del sistema.
 *
 * Los filtros APLICADOS viven en la URL (`/admin?tab=actividad&p=3349&u=14…`,
 * para compartir el enlace). La barra edita un BORRADOR y solo consulta al
 * servidor con el botón «Filtrar» (Joel 2026-10-29: cada clic en un chip
 * disparaba una consulta pesada). Los atajos de navegación (clic en un
 * producto o persona, paginación) sí aplican de inmediato.
 */
export function TabActividad() {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaults = useMemo(() => ({ from: daysAgoLocal(DEFAULT_RANGE_DAYS), to: getTodayLocal() }), []);
  const applied = useMemo(() => filtersFromSearchParams(searchParams, defaults), [searchParams, defaults]);
  const [isExporting, setIsExporting] = useState(false);

  // Borrador ligado a lo aplicado: cuando la URL cambia por un atajo (producto,
  // persona, reset, paginación) el borrador se alinea en el mismo render.
  const [draftState, setDraftState] = useState<{ base: ActivityFilterState; draft: ActivityFilterState }>({ base: applied, draft: applied });
  const draft = draftState.base === applied ? draftState.draft : applied;

  const commit = useCallback((patch: Partial<ActivityFilterState>) => {
    setSearchParams((prev) => filtersToSearchParams({ ...filtersFromSearchParams(prev, defaults), ...patch }, defaults, prev), { replace: true });
  }, [defaults, setSearchParams]);

  const editDraft = useCallback((patch: Partial<ActivityFilterState>) => {
    setDraftState((s) => ({ base: applied, draft: { ...(s.base === applied ? s.draft : applied), ...patch } }));
  }, [applied]);

  const applyDraft = useCallback(() => {
    commit({ ...draft, page: 1 });
  }, [commit, draft]);

  const reset = useCallback(() => {
    setSearchParams((prev) => {
      const sp = new URLSearchParams();
      const tab = prev.get("tab");
      if (tab) sp.set("tab", tab);
      return sp;
    }, { replace: true });
  }, [setSearchParams]);

  const feedQuery = useActivityQuery(applied);
  const summaryQuery = useActivitySummaryQuery(applied);
  const usersQuery = useUsersQuery();

  const events = feedQuery.data?.data ?? [];
  const pagination = feedQuery.data?.pagination;
  const summary = summaryQuery.data;
  const isDirty = !filtersEqual(draft, applied);
  const noiseHidden = summary
    ? summary.noise_excluded.zero_adjustments + summary.noise_excluded.print_logs + summary.noise_excluded.duplicate_adjust_logs
    : null;
  const feedError = feedQuery.error ? ((feedQuery.error as { message?: string }).message ?? "Error desconocido") : null;

  // Mensaje del overlay: con filtros nuevos la tabla muestra la página anterior
  // (placeholder) mientras llega la nueva → "Filtrando"; mismo filtro
  // recargado (botón Actualizar) → "Actualizando nuevos registros".
  const loadingMessage = feedQuery.isFetching
    ? (feedQuery.isPlaceholderData || feedQuery.isLoading ? "Filtrando…" : "Actualizando nuevos registros…")
    : null;

  const focusProductId = applied.productIds.length === 1 ? applied.productIds[0]! : null;
  const focusUserName = applied.userId ? (usersQuery.data ?? []).find((u) => u.id === applied.userId)?.name ?? null : null;

  const pickProduct = (id: number) => commit({ productIds: [id], page: 1 });
  const pickUser = (id: number) => commit({ userId: id, page: 1 });

  const onExport = async () => {
    setIsExporting(true);
    try {
      const { blob, filename } = await exportActivityCsv(buildActivitySummaryParams(applied));
      downloadWithRetry(blob, filename);
      if ((pagination?.total ?? 0) > 20000) {
        toast.warning("El CSV se corta en 20,000 filas", { description: "Acota el rango o filtra por producto/usuario para exportar todo." });
      }
    } catch (err: unknown) {
      toast.error("No se pudo exportar", { description: (err as { message?: string }).message ?? undefined });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col" style={{ padding: "4px 0 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,68,34,0.12)", border: "1px solid rgba(255,68,34,0.30)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <History size={18} color="#FF6B4A" />
        </div>
        <div className="min-w-0">
          <h2 style={{ color: "var(--td-text-hi)", fontSize: 16, fontWeight: 900, margin: 0 }}>Actividad del sistema</h2>
          <p style={{ color: "var(--td-text-lo)", fontSize: 10, margin: 0, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Quién hizo qué · {pagination ? `${pagination.total.toLocaleString("es-MX")} eventos` : "cargando…"} · {applied.from} → {applied.to}
          </p>
        </div>
        <div className="ml-auto">
          <RefreshDataButton variant="inline" updatedAt={feedQuery.dataUpdatedAt || undefined} />
        </div>
      </div>

      <ActivityFilterBar
        state={draft}
        onChange={editDraft}
        onApply={applyDraft}
        isDirty={isDirty}
        isFetching={feedQuery.isFetching}
        onReset={reset}
        onExport={() => { void onExport(); }}
        isExporting={isExporting}
        noiseHidden={noiseHidden}
      />

      <ActivityFocusHeader
        productId={focusProductId}
        userId={applied.userId}
        sampleEvents={events}
        summary={summary}
        userName={focusUserName}
        onClearProduct={() => commit({ productIds: [], page: 1 })}
        onClearUser={() => commit({ userId: null, page: 1 })}
      />

      {focusProductId === null && (
        <ActivitySummaryCards
          summary={summary}
          isLoading={summaryQuery.isLoading || summaryQuery.isFetching}
          onPickUser={pickUser}
          onPickProduct={pickProduct}
        />
      )}

      <ActivityTable
        events={events}
        pagination={pagination}
        isLoading={feedQuery.isLoading}
        loadingMessage={loadingMessage}
        error={feedError}
        pageSize={applied.perPage}
        onPageChange={(page) => commit({ page })}
        onPageSizeChange={(size) => commit({ perPage: size, page: 1 })}
        onPickProduct={pickProduct}
        onPickUser={pickUser}
      />
    </div>
  );
}
