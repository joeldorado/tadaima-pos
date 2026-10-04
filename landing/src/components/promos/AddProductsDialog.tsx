import { useMemo, useState } from "react";
import type { ProductLight, Promotion } from "@tadaima/api";
import type { PickableCategory } from "@/lib/categoryPicker";
import { summarizeAttachOutcome } from "@/lib/promoAttach";
import { promoShortLabel } from "@/lib/promoLabel";
import { AttachProgress, AttachResult } from "./AttachResult";
import { ProductPicker } from "./ProductPicker";
import { PromoButton } from "./PromoButton";
import { PromoDialog } from "./PromoDialog";
import { useAttachRun } from "./useAttachRun";

interface AddProductsDialogProps {
  promo: Promotion;
  /** Productos activos que se pueden elegir. */
  products: readonly ProductLight[];
  categories: readonly PickableCategory[];
  loadingProducts?: boolean;
  onClose: () => void;
}

/** "Agregar productos" a una promo que ya existe: mismo selector del asistente. */
export function AddProductsDialog({ promo, products, categories, loadingProducts = false, onClose }: AddProductsDialogProps) {
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set());
  const { running, progress, outcome, run, retryPending } = useAttachRun();

  const locked = useMemo(() => new Set((promo.products ?? []).map(product => product.id)), [promo.products]);
  const names = useMemo(() => new Map(products.map(product => [product.id, product.name])), [products]);

  const count = selected.size;
  const footer = outcome && !running ? (
    <PromoButton variant="primary" onClick={onClose}>Listo</PromoButton>
  ) : running ? null : (
    <>
      <PromoButton onClick={onClose}>Cancelar</PromoButton>
      <PromoButton
        variant="primary"
        disabled={count === 0}
        onClick={() => void run(promo.id, [...selected])}
        data-testid="confirm-add-products"
      >
        {count === 0
          ? "Elige productos"
          : `Agregar ${count.toLocaleString("es-MX")} producto${count === 1 ? "" : "s"}`}
      </PromoButton>
    </>
  );

  return (
    <PromoDialog
      title="Agregar productos"
      subtitle={`${promoShortLabel(promo)} · ${promo.name}`}
      size="lg"
      busy={running}
      onClose={onClose}
      testId="assign-products-modal"
      footer={footer}
    >
      {running ? (
        <AttachProgress progress={progress} />
      ) : outcome ? (
        <AttachResult
          summary={summarizeAttachOutcome(outcome, names)}
          onRetry={() => retryPending(promo.id)}
        />
      ) : (
        <ProductPicker
          products={products}
          categories={categories}
          selected={selected}
          locked={locked}
          onChange={setSelected}
          loading={loadingProducts}
        />
      )}
    </PromoDialog>
  );
}
