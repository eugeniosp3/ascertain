const pluralRules = new Intl.PluralRules('en')

/** Keep visible and announced counts consistent, including zero and uncapped totals. */
export function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${pluralRules.select(count) === 'one' ? singular : plural}`
}
