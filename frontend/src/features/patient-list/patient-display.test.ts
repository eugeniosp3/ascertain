import { describe, expect, it } from 'vitest'
import { formatRecordNumber, getInitials, getPatientName } from '@/utils/patient'
import { displayCount } from './count'

describe('patient display helpers', () => {
  it('formats empty, single-part, and multi-part names without guessing identifiers', () => {
    expect(getInitials('')).toBe('')
    expect(getInitials('  Ada  ')).toBe('A')
    expect(getInitials('Ada M Lovelace')).toBe('AL')
    expect(getPatientName({ first_name: 'Ada', middle_initial: null, last_name: 'Lovelace' })).toBe(
      'Ada Lovelace',
    )
    expect(getPatientName({ first_name: 'Ada', middle_initial: 'M', last_name: 'Lovelace' })).toBe(
      'Ada M Lovelace',
    )
    expect(formatRecordNumber({ source_patient_id: 'PT-123', mrn: 'MRN-9', id: 'opaque-id' })).toBe(
      'PT-123',
    )
    expect(formatRecordNumber({ mrn: 'MRN-9', id: 'opaque-id' })).toBe('MRN-9')
  })
  it('preserves zero while distinguishing unavailable counts', () => {
    expect(displayCount(0)).toBe('0')
    expect(displayCount(undefined)).toBe('—')
    expect(displayCount(Number.NaN)).toBe('—')
  })
})
