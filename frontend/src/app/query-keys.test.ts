import { describe, expect, it } from 'vitest'
import { partialMatchKey } from '@tanstack/react-query'
import { notificationKeys, patientKeys } from './query-keys'

describe('query-key prefix helpers', () => {
  it('keep the exact prefix arrays that invalidation and removal rely on', () => {
    expect(patientKeys.patient('p')).toEqual(['patients', 'p'])
    expect(patientKeys.allComments('p')).toEqual(['patients', 'p', 'comments'])
    expect(notificationKeys.all).toEqual(['notifications'])
    expect(notificationKeys.actor('one')).toEqual(['notifications', 'one'])
  })

  it('match the per-patient and per-viewer keys they prefix', () => {
    const matches = (prefix: readonly unknown[], queryKey: readonly unknown[]) =>
      partialMatchKey(queryKey, prefix)
    expect(matches(patientKeys.patient('p'), patientKeys.notes('p'))).toBe(true)
    expect(matches(patientKeys.patient('p'), patientKeys.summary('p'))).toBe(true)
    expect(matches(patientKeys.allComments('p'), patientKeys.comments('p', 'one', {}))).toBe(true)
    expect(matches(patientKeys.patient('p'), patientKeys.detail('p', 'one'))).toBe(false)
    expect(matches(notificationKeys.all, patientKeys.notificationSummary('one'))).toBe(true)
    expect(matches(notificationKeys.actor('one'), patientKeys.notificationSummary('one'))).toBe(
      true,
    )
    expect(matches(notificationKeys.actor('two'), patientKeys.notificationSummary('one'))).toBe(
      false,
    )
  })
})
