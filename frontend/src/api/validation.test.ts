import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyPatientValues, toPatientWrite } from '../features/patient-form/mapping'
import { patientFormSchema } from '../features/patient-form/schema'
import { demoId } from '../fixtures/demo-data'
import { validateComment, validateNote, validatePatient } from './validation'

const form = {
  ...emptyPatientValues(),
  first_name: 'Ada',
  last_name: 'Example',
  date_of_birth: '1980-01-02',
}
const write = toPatientWrite(form)

afterEach(() => vi.useRealTimers())

describe('patient form and mock validation follow backend limits', () => {
  it.each([
    ['first_name', 100],
    ['last_name', 100],
    ['address_line1', 255],
    ['address_line2', 255],
    ['city', 100],
    ['postal_code', 10],
  ] as const)('accepts the server boundary and rejects overflow for %s', (field, max) => {
    const valid = { ...form, [field]: 'a'.repeat(max) }
    expect(validatePatient(toPatientWrite(valid))[field]).toBe('a'.repeat(max))
    expect(patientFormSchema.safeParse({ ...valid, [field]: 'a'.repeat(max + 1) }).success).toBe(
      false,
    )
    expect(() => validatePatient({ ...write, [field]: 'a'.repeat(max + 1) })).toThrow()
  })

  it.each(['1', '.', 'é', '🩺'])(
    'accepts any single middle-initial character: %s',
    (middle_initial) => {
      expect(validatePatient(toPatientWrite({ ...form, middle_initial })).middle_initial).toBe(
        middle_initial,
      )
    },
  )

  it.each(['N', 'New York', '123'])('requires exactly two state characters: %s', (state) => {
    expect(patientFormSchema.safeParse({ ...form, state }).success).toBe(false)
    expect(() => validatePatient({ ...write, state })).toThrow()
  })

  it('accepts null state, literal two-character state, and explicitly null optional fields', () => {
    expect(validatePatient(write)).toEqual(write)
    expect(validatePatient(toPatientWrite({ ...form, state: '12' })).state).toBe('12')
    expect(() => validatePatient({ ...write, state: '' })).toThrow()
    expect(() =>
      validatePatient({ ...write, phone: undefined } as unknown as typeof write),
    ).toThrow()
  })

  it.each([
    '1234567',
    '+1 (212) 555-0100 ext. 123456',
    '212-555-0100 x42',
    '212.555.0100 #12',
    '12345678901234567890',
  ])('accepts valid phone syntax and digit counts: %s', (phone) => {
    expect(validatePatient(toPatientWrite({ ...form, phone })).phone).toBe(phone)
  })

  it.each([
    '123456',
    '123456789012345678901',
    '212-555-0100 ext. 1234567',
    '212-555-0100 x',
    '12+34567',
    '212/555/0100',
    '1'.padEnd(41, '-'),
  ])('rejects invalid phone syntax or length: %s', (phone) => {
    expect(patientFormSchema.safeParse({ ...form, phone }).success).toBe(false)
    expect(() => validatePatient({ ...write, phone })).toThrow()
  })

  it('uses 16-character codes and 500-character condition labels and allergies', () => {
    const input = {
      ...form,
      conditions: [{ code: 'c'.repeat(16), label: 'l'.repeat(500) }],
      allergies: ['a'.repeat(500)],
      allergy_status: 'reported' as const,
    }
    expect(validatePatient(toPatientWrite(input)).conditions[0]?.code).toHaveLength(16)
    for (const value of [
      { ...input, conditions: [{ code: 'c'.repeat(17), label: 'Valid' }] },
      { ...input, conditions: [{ code: '', label: 'l'.repeat(501) }] },
      { ...input, allergies: ['a'.repeat(501)] },
    ]) {
      expect(patientFormSchema.safeParse(value).success).toBe(false)
    }
    for (const value of [
      { ...write, conditions: [{ code: 'c'.repeat(17), label: 'Valid' }] },
      { ...write, conditions: [{ code: null, label: 'l'.repeat(501) }] },
      { ...write, allergies: ['a'.repeat(501)], allergy_status: 'reported' as const },
    ])
      expect(() => validatePatient(value)).toThrow()
  })
})

describe('discussion and note write limits', () => {
  it('accepts 100 distinct note references and rejects duplicates and overflow', () => {
    const note_ids = Array.from({ length: 100 }, (_, index) => demoId('note', index + 1))
    expect(validateComment({ body: 'x'.repeat(10_000), note_ids }).note_ids).toHaveLength(100)
    expect(() =>
      validateComment({ body: 'Text', note_ids: [...note_ids, demoId('note', 101)] }),
    ).toThrow()
    expect(() =>
      validateComment({ body: 'Text', note_ids: [note_ids[0]!, note_ids[0]!] }),
    ).toThrow()
    expect(() => validateComment({ body: 'x'.repeat(10_001), note_ids: [] })).toThrow()
  })

  it('requires real timezone-aware clinical timestamps and rejects even microseconds in the future', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-20T15:00:00Z'))
    expect(
      validateNote({ timestamp: '2026-11-20T10:00:00-05:00', content: 'x'.repeat(20_000) }).content,
    ).toHaveLength(20_000)
    for (const timestamp of [
      '2026-11-20T15:00:00.000001Z',
      '2026-11-20T15:00:01Z',
      '2026-11-20T15:00:00',
      '2026-11-20T24:00:00Z',
      '2026-02-30T15:00:00Z',
    ]) {
      expect(() => validateNote({ timestamp, content: 'Text' })).toThrow()
    }
    expect(() =>
      validateNote({ timestamp: '2026-11-20T15:00:00Z', content: 'x'.repeat(20_001) }),
    ).toThrow()
  })
})
