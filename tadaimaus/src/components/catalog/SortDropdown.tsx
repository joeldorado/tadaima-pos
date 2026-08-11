import { useEffect, useRef, useState } from 'react'
import { SORT_LABELS, SORT_OPTIONS, type SortOption } from '../../lib/sortFilter'

interface SortDropdownProps {
  readonly value: SortOption
  readonly onChange: (value: SortOption) => void
}

/** First custom dropdown in the app — no native `<select>` precedent to match, so this
 * hand-builds Escape/click-outside/arrow-key support to stay accessible. */
export function SortDropdown({ value, onChange }: SortDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    function handlePointerDown(event: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const moveSelection = (direction: 1 | -1): void => {
    const currentIndex = SORT_OPTIONS.indexOf(value)
    const nextIndex = (currentIndex + direction + SORT_OPTIONS.length) % SORT_OPTIONS.length
    const next = SORT_OPTIONS[nextIndex]
    if (next !== undefined) onChange(next)
  }

  return (
    <div className="sort-dropdown" ref={rootRef}>
      <button
        type="button"
        className="sort-dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            if (isOpen) moveSelection(1)
            else setIsOpen(true)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            if (isOpen) moveSelection(-1)
            else setIsOpen(true)
          }
        }}
      >
        <span className="sort-dropdown-label">Sort by</span>
        <span className="sort-dropdown-value">{SORT_LABELS[value]}</span>
        <svg
          className="sort-dropdown-chevron"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={isOpen ? { transform: 'rotate(180deg)' } : undefined}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <ul className="sort-dropdown-menu" role="listbox" aria-label="Sort by">
          {SORT_OPTIONS.map((option) => (
            <li key={option}>
              <button
                type="button"
                role="option"
                aria-selected={option === value}
                className={`sort-dropdown-option${option === value ? ' is-selected' : ''}`}
                onClick={() => {
                  onChange(option)
                  setIsOpen(false)
                }}
              >
                {SORT_LABELS[option]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
