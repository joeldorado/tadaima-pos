/** Formats a USD amount as "$12.00 USD" (frozen display convention). */
export function formatUsd(value: string | number): string {
  const amount = typeof value === 'number' ? value : Number.parseFloat(value)
  if (!Number.isFinite(amount)) return '$0.00 USD'
  return `$${amount.toFixed(2)} USD`
}
