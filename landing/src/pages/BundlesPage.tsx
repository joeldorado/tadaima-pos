import { useMemo, useState } from "react";
import { Boxes, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { deleteBundle, updateBundle, type Bundle } from "@tadaima/api";
import { useActiveStore } from "@/contexts/StoreContext";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useBundleCache, useBundleViewer, useBundlesQuery } from "@/hooks/queries/useBundles";
import { useStoresQuery } from "@/hooks/queries/useStores";
import { assembleErrorText } from "@/lib/bundleDraft";
import { availabilityFor } from "@/lib/bundleMath";
import { filterProductsByText, findScannedProduct } from "@/lib/promoProductPicker";
import { looksLikeProductCode } from "@/lib/scanGuards";
import { ConfirmDialog } from "@/components/promos/ConfirmDialog";
import { PromoButton } from "@/components/promos/PromoButton";
import { PromoDialog } from "@/components/promos/PromoDialog";
import { AMBER, TEXT_HI, TEXT_MD, tint } from "@/components/promos/promoTokens";
import { AssembleDialog } from "@/components/bundles/AssembleDialog";
import { BundleDetailDialog } from "@/components/bundles/BundleDetailDialog";
import { BundleEditDialog } from "@/components/bundles/BundleEditDialog";
import { BundleLabelModal } from "@/components/bundles/BundleLabelModal";
import { BundleList, type BundlesView } from "@/components/bundles/BundleList";
import { BundleWizard } from "@/components/bundles/BundleWizard";
import { DisassembleDialog } from "@/components/bundles/DisassembleDialog";
import { StorePill, StoreSelect } from "@/components/bundles/StoreSelect";
import { BUNDLE_COLOR, MODULE_LABEL } from "@/components/bundles/bundleTokens";

const NO_BUNDLES: Bundle[] = [];
const VIEW_STORAGE_KEY = "tadaima-bundles-view";

function readStoredView(): BundlesView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "table" ? "table" : "cards";
  } catch {
    return "cards";
  }
}

type Dialog =
  | { kind: "wizard" }
  | { kind: "assemble"; bundle: Bundle }
  | { kind: "disassemble"; bundle: Bundle }
  | { kind: "detail"; bundleId: number }
  | { kind: "edit"; bundle: Bundle }
  | { kind: "label"; bundle: Bundle }
  | { kind: "delete"; bundle: Bundle }
  | null;

function LoadError({ message, retrying, onRetry }: { message: string; retrying: boolean; onRetry: () => void }) {
  return (
    <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3" style={{ background: "rgba(224,34,26,0.10)", border: "1px solid rgba(224,34,26,0.4)" }}>
      <p className="text-[15px] font-bold" style={{ color: TEXT_HI }}>{message}</p>
      <PromoButton icon={<RefreshCw size={16} aria-hidden />} loading={retrying} onClick={onRetry}>Reintentar</PromoButton>
    </div>
  );
}

/**
 * Paquetes (2026-10-07): combos de 2+ productos con su propio stock por tienda.
 * El admin elige tienda (o ve todas); gerente/cajero trabajan con la suya.
 */
export function BundlesPage() {
  const viewer = useBundleViewer();
  const { activeStore } = useActiveStore();
  const storesQuery = useStoresQuery({ active: true, enabled: viewer.isAdmin });
  const stores = useMemo(() => storesQuery.data ?? [], [storesQuery.data]);
  const [adminStoreId, setAdminStoreId] = useState<number | null>(() => activeStore?.id ?? null);
  const storeId = viewer.isAdmin ? adminStoreId : viewer.storeId;

  const bundlesQuery = useBundlesQuery({ storeId });
  const { invalidate, applyFresh } = useBundleCache();
  const bundles = bundlesQuery.data?.data ?? NO_BUNDLES;

  const [query, setQuery] = useState("");
  const [view, setView] = useState<BundlesView>(readStoredView);
  const changeView = (next: BundlesView) => {
    setView(next);
    try { localStorage.setItem(VIEW_STORAGE_KEY, next); } catch { /* sin storage: solo esta sesión */ }
  };
  const [dialog, setDialog] = useState<Dialog>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [scanMiss, setScanMiss] = useState<string | null>(null);

  const visible = useMemo(() => {
    const filtered = filterProductsByText(bundles, query);
    return [...filtered].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      const ma = availabilityFor(a, storeId)?.max_buildable ?? 0;
      const mb = availabilityFor(b, storeId)?.max_buildable ?? 0;
      if (ma !== mb) return mb - ma;
      return a.name.localeCompare(b.name, "es");
    });
  }, [bundles, query, storeId]);

  const resolveScan = (code: string) => {
    const hit = findScannedProduct(bundles, code);
    if (hit) { setScanMiss(null); setQuery(""); setDialog({ kind: "detail", bundleId: hit.id }); }
    else setScanMiss(`No hay paquetes con el código "${code.trim()}".`);
  };
  useBarcodeScanner({ onScan: resolveScan, enabled: dialog === null });

  const toggleActive = async (bundle: Bundle) => {
    setTogglingId(bundle.id);
    try {
      const fresh = await updateBundle(bundle.id, { active: !bundle.active });
      applyFresh(fresh);
      invalidate();
      toast.success(bundle.active ? "Paquete desactivado: ya no sale en Caja." : "Paquete activado.");
    } catch (err: unknown) {
      toast.error(assembleErrorText(err, "No se pudo cambiar el estado del paquete."));
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDelete = async (bundle: Bundle) => {
    setDeleting(true);
    try {
      await deleteBundle(bundle.id);
      invalidate();
      toast.success("Paquete borrado.");
      setDialog(null);
    } catch (err: unknown) {
      toast.error(assembleErrorText(err, "No se pudo borrar el paquete."));
    } finally {
      setDeleting(false);
    }
  };

  const openDetail = (bundle: Bundle) => setDialog({ kind: "detail", bundleId: bundle.id });
  const canOperate = viewer.isAdmin || viewer.storeId != null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl p-3" style={tint(BUNDLE_COLOR)}>
            <Boxes size={24} aria-hidden />
          </div>
          <div>
            <h1 className="text-[26px] font-black leading-tight" style={{ color: TEXT_HI }}>{MODULE_LABEL}</h1>
            <p className="text-[15px] font-semibold" style={{ color: TEXT_MD }}>
              Junta varios productos en un paquete con su propio precio y código. Se vende en Caja como cualquier producto.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {viewer.isAdmin ? (
            <StoreSelect
              stores={stores}
              value={adminStoreId}
              onChange={setAdminStoreId}
              allLabel="Todas las tiendas"
              ariaLabel="Tienda para ver existencias"
            />
          ) : viewer.storeName ? (
            <StorePill name={viewer.storeName} />
          ) : null}
          <PromoButton
            variant="primary"
            className="px-5 text-[16px]"
            icon={<Plus size={20} aria-hidden />}
            onClick={() => setDialog({ kind: "wizard" })}
            data-testid="new-bundle-btn"
          >
            Nuevo paquete
          </PromoButton>
        </div>
      </header>

      {!canOperate && (
        <p className="mb-4 rounded-2xl px-4 py-3 text-[15px] font-bold" style={{ ...tint(AMBER), color: TEXT_HI }}>
          Tu usuario no tiene tienda asignada. Pide al admin que te asigne una para armar paquetes.
        </p>
      )}
      {scanMiss && (
        <p className="mb-3 text-[14px] font-bold" style={{ color: AMBER }} aria-live="polite">{scanMiss}</p>
      )}

      {bundlesQuery.isError ? (
        <LoadError message="No se pudieron cargar los paquetes. Revisa tu conexión." retrying={bundlesQuery.isFetching} onRetry={() => void bundlesQuery.refetch()} />
      ) : (
        <BundleList
          bundles={visible}
          total={bundles.length}
          loading={bundlesQuery.isLoading}
          viewer={viewer}
          storeId={storeId}
          query={query}
          onQueryChange={next => { setQuery(next); setScanMiss(null); }}
          onQueryEnter={typed => { if (looksLikeProductCode(typed)) resolveScan(typed); }}
          togglingId={togglingId}
          onNew={() => setDialog({ kind: "wizard" })}
          view={view}
          onViewChange={changeView}
          onAssemble={bundle => setDialog({ kind: "assemble", bundle })}
          onDisassemble={bundle => setDialog({ kind: "disassemble", bundle })}
          onLabel={bundle => setDialog({ kind: "label", bundle })}
          onDetail={openDetail}
          onEdit={bundle => setDialog({ kind: "edit", bundle })}
          onToggleActive={bundle => { void toggleActive(bundle); }}
          onDelete={bundle => setDialog({ kind: "delete", bundle })}
        />
      )}

      {dialog?.kind === "wizard" && (
        <BundleWizard
          defaultStoreId={storeId}
          stores={stores}
          viewer={viewer}
          existingSkus={bundles.map(b => b.sku)}
          onClose={() => setDialog(null)}
          onPrintLabel={bundle => setDialog({ kind: "label", bundle })}
        />
      )}
      {dialog?.kind === "assemble" && (
        <AssembleDialog
          bundle={dialog.bundle}
          stores={stores}
          viewer={viewer}
          defaultStoreId={storeId}
          onClose={() => setDialog(null)}
          onDone={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "disassemble" && (
        <DisassembleDialog
          bundle={dialog.bundle}
          stores={stores}
          viewer={viewer}
          defaultStoreId={storeId}
          onClose={() => setDialog(null)}
          onDone={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "detail" && (
        <BundleDetailDialog
          bundleId={dialog.bundleId}
          viewer={viewer}
          storeId={storeId}
          onClose={() => setDialog(null)}
          onEdit={bundle => setDialog({ kind: "edit", bundle })}
          onLabel={bundle => setDialog({ kind: "label", bundle })}
          onAssemble={bundle => setDialog({ kind: "assemble", bundle })}
          onDisassemble={bundle => setDialog({ kind: "disassemble", bundle })}
        />
      )}
      {dialog?.kind === "edit" && (
        <BundleEditDialog bundle={dialog.bundle} viewer={viewer} onClose={() => setDialog(null)} onSaved={() => setDialog(null)} />
      )}
      {dialog?.kind === "label" && (
        <BundleLabelModal bundle={dialog.bundle} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "delete" && (() => {
        const { bundle } = dialog;
        const stock = bundle.stock_total;
        const where = bundle.availability.filter(row => row.stock_exhibicion > 0).map(row => `${row.store_name}: ${row.stock_exhibicion.toLocaleString("es-MX")}`).join(" · ");
        // Con armados no se puede borrar: se explica y se ofrece ir a desarmar (nada de un botón que no hace nada).
        if (stock > 0) {
          return (
            <PromoDialog
              title="Primero hay que desarmarlo"
              size="sm"
              onClose={() => setDialog(null)}
              testId="bundle-delete-dialog"
              footer={(
                <>
                  <PromoButton onClick={() => setDialog(null)}>Entendido</PromoButton>
                  {(viewer.isAdmin || viewer.storeId != null) && (
                    <PromoButton variant="primary" onClick={() => setDialog({ kind: "disassemble", bundle })} data-testid="bundle-delete-go-disassemble">
                      Ir a desarmar
                    </PromoButton>
                  )}
                </>
              )}
            >
              <p className="text-[15px] font-semibold leading-relaxed" style={{ color: TEXT_MD }}>
                <b style={{ color: TEXT_HI }}>{bundle.name}</b> tiene <b style={{ color: TEXT_HI }}>{stock.toLocaleString("es-MX")} paquetes armados</b>{where ? ` (${where})` : ""}.
                Al desarmarlos las piezas regresan al inventario y entonces sí se puede borrar.
              </p>
            </PromoDialog>
          );
        }
        return (
          <ConfirmDialog
            title="¿Borrar este paquete?"
            confirmLabel="Sí, borrar"
            busyLabel="Borrando…"
            busy={deleting}
            onCancel={() => setDialog(null)}
            onConfirm={() => { void confirmDelete(bundle); }}
            testId="bundle-delete-dialog"
            confirmTestId="bundle-delete-confirm"
          >
            <b>{bundle.name}</b> ({bundle.sku}) desaparece de la lista y de Caja. Los tickets ya cobrados no cambian. Esta acción no se puede deshacer.
          </ConfirmDialog>
        );
      })()}
    </div>
  );
}
