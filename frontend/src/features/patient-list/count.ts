export function displayCount(count: number | undefined): string {
  return typeof count === 'number' && Number.isFinite(count) ? String(count) : '—'
}
