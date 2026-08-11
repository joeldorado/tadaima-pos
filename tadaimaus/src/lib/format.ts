/** Formats a USD amount as "USD 12.00" — same convention as the original site. */
export function formatUsd(value: string | number): string {
  const amount = typeof value === 'number' ? value : Number.parseFloat(value)
  if (!Number.isFinite(amount)) return 'USD 0.00'
  return `USD ${amount.toFixed(2)}`
}
