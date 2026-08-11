interface PriceRangeSliderProps {
  /** [dataMin, dataMax] — the full range available in the current listings. */
  readonly bounds: readonly [number, number]
  /** [selectedMin, selectedMax] */
  readonly value: readonly [number, number]
  readonly onChange: (value: readonly [number, number]) => void
}

/** Dual-handle price filter — two overlapping native range inputs, no dependency. */
export function PriceRangeSlider({ bounds, value, onChange }: PriceRangeSliderProps) {
  const [dataMin, dataMax] = bounds
  const [min, max] = value
  const disabled = dataMax <= dataMin
  const span = dataMax - dataMin

  const fillStart = span > 0 ? ((min - dataMin) / span) * 100 : 0
  const fillEnd = span > 0 ? ((max - dataMin) / span) * 100 : 100

  return (
    <div className="price-filter">
      <h3 className="catalog-filter-heading">Price</h3>
      <div className={`price-range-slider${disabled ? ' is-disabled' : ''}`}>
        <div className="price-range-track">
          <div
            className="price-range-fill"
            style={{ left: `${fillStart}%`, right: `${100 - fillEnd}%` }}
          />
        </div>
        <input
          type="range"
          className="price-range-input"
          min={dataMin}
          max={dataMax}
          value={min}
          disabled={disabled}
          aria-label="Minimum price"
          onChange={(event) => onChange([Math.min(Number(event.target.value), max), max])}
        />
        <input
          type="range"
          className="price-range-input"
          min={dataMin}
          max={dataMax}
          value={max}
          disabled={disabled}
          aria-label="Maximum price"
          onChange={(event) => onChange([min, Math.max(Number(event.target.value), min)])}
        />
      </div>
      <div className="price-range-values">
        <span>USD {min}</span>
        <span>USD {max}</span>
      </div>
    </div>
  )
}
