import { Check } from "lucide-react";
import { CARD_BORDER, GREEN_SOLID, SOFT_BG, TEXT_HI, TEXT_MD } from "@/components/promos/promoTokens";

export interface WizardStep<S extends number> {
  step: S;
  title: string;
}

interface BundleStepHeaderProps<S extends number> {
  steps: ReadonlyArray<WizardStep<S>>;
  current: S;
  onGoTo: (step: S) => void;
}

/** Cabecera de pasos (copiada del asistente de Promos, que no la exporta). */
export function BundleStepHeader<S extends number>({ steps, current, onGoTo }: BundleStepHeaderProps<S>) {
  return (
    <ol className="mb-5 grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map(({ step, title }) => {
        const done = step < current;
        const active = step === current;
        return (
          <li key={step}>
            <button
              type="button"
              disabled={!done}
              onClick={() => onGoTo(step)}
              aria-current={active ? "step" : undefined}
              className="flex w-full flex-col items-start gap-1.5 rounded-xl px-2 py-2 text-left sm:flex-row sm:items-center sm:gap-2.5"
              style={{ cursor: done ? "pointer" : "default", background: active ? SOFT_BG : "transparent" }}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px] font-black"
                style={done || active ? { background: GREEN_SOLID, color: "#04120c" } : { border: CARD_BORDER, color: TEXT_MD }}
              >
                {done ? <Check size={16} aria-hidden /> : step}
              </span>
              <span className="text-[14px] font-bold leading-tight" style={{ color: active ? TEXT_HI : TEXT_MD }}>{title}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
