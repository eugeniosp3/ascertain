function dateParts(value: string): [number, number, number] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError('Invalid date.')
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  if (
    year < 1 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError('Invalid date.')
  }
  return [year, month, day]
}

function instant(value: string): Date {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    throw new RangeError('Expected a timestamp with a timezone.')
  }
  dateParts(value.slice(0, 10))
  const date = new Date(value)
  if (
    Number.isNaN(date.getTime()) ||
    Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59 ||
    Number(value.slice(17, 19) || 0) > 59
  ) {
    throw new RangeError('Invalid timestamp.')
  }
  return date
}

// Preserve database microseconds when comparing discussion watermarks and snapshot positions.
export function timestampMicros(value: string): bigint {
  const date = instant(value)
  const fraction = /\.(\d+)/.exec(value)?.[1] ?? ''
  return BigInt(date.getTime()) * 1000n + BigInt(fraction.padEnd(6, '0').slice(3, 6))
}

export function timestampFromMicros(value: bigint): string {
  const remainder = ((value % 1000n) + 1000n) % 1000n
  return new Date(Number((value - remainder) / 1000n))
    .toISOString()
    .replace('Z', `${String(remainder).padStart(3, '0')}Z`)
}

export function formatDate(value: string | null): string {
  if (value === null) return 'Not recorded'
  const [year, month, day] = dateParts(value)
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(instant(value))
}

export function toDateTimeLocal(value?: string): string {
  const date = value === undefined ? new Date() : instant(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function toIsoTimestamp(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value)) {
    throw new RangeError('Enter a valid local date and time.')
  }
  const [year, month, day] = dateParts(value.slice(0, 10))
  const hour = Number(value.slice(11, 13))
  const minute = Number(value.slice(14, 16))
  const second = Number(value.slice(17, 19) || 0)
  const millis = Number((value.split('.')[1] ?? '').padEnd(3, '0'))
  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(hour, minute, second, millis)
  // Detect impossible calendar values and local times skipped by daylight saving.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    throw new RangeError('Enter a valid local date and time.')
  }
  return date.toISOString()
}
