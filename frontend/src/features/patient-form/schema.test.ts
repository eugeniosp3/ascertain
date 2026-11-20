import { describe, expect, it } from 'vitest'
import { emptyPatientValues } from './mapping'
import { patientFormSchema } from './schema'

const valid = {
  ...emptyPatientValues(),
  first_name: 'Ada',
  last_name: 'Example',
  date_of_birth: '1980-01-02',
}

describe('patient form validation', () => {
  it('accepts an empty optional profile and a real leap day', () => {
    expect(patientFormSchema.safeParse(valid).success).toBe(true)
    expect(patientFormSchema.safeParse({ ...valid, date_of_birth: '2000-02-29' }).success).toBe(
      true,
    )
  })

  it.each([
    ['first_name', '  '],
    ['last_name', ''],
    ['date_of_birth', '2001-02-29'],
    ['date_of_birth', 'not-a-date'],
    ['date_of_birth', '2999-01-01'],
    ['last_visit', '2999-01-01'],
    ['last_visit', '2024-04-31'],
    ['email', 'bad-email'],
    ['phone', 'telephone'],
    ['middle_initial', 'AB'],
    ['status', 'pending'],
    ['blood_type', 'C+'],
    ['allergy_status', 'none'],
    ['postal_code', 'x'.repeat(11)],
  ])('rejects invalid %s: %s', (field, value) => {
    const result = patientFormSchema.safeParse({ ...valid, [field]: value })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.issues.some((issue) => issue.path[0] === field)).toBe(true)
  })

  it('accepts January 1, 1900 as the earliest date of birth', () => {
    expect(patientFormSchema.safeParse({ ...valid, date_of_birth: '1900-01-01' }).success).toBe(
      true,
    )
    const result = patientFormSchema.safeParse({ ...valid, date_of_birth: '1899-12-31' })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.issues).toEqual([
        expect.objectContaining({
          path: ['date_of_birth'],
          message: 'Date of birth must be on or after January 1, 1900.',
        }),
      ])
  })

  it('accepts a last visit on the date of birth and rejects one before it', () => {
    for (const last_visit of ['', '1980-01-02', '1980-01-03']) {
      expect(patientFormSchema.safeParse({ ...valid, last_visit }).success).toBe(true)
    }
    const result = patientFormSchema.safeParse({ ...valid, last_visit: '1980-01-01' })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.issues).toEqual([
        expect.objectContaining({
          path: ['last_visit'],
          message: 'Last visit cannot be before the date of birth.',
        }),
      ])
  })

  it('compares visit order only when both dates are valid', () => {
    const result = patientFormSchema.safeParse({
      ...valid,
      date_of_birth: '1980-02-30',
      last_visit: '1970-01-01',
    })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.issues.map((issue) => [issue.path, issue.message])).toEqual([
        [['date_of_birth'], 'Enter a valid date.'],
      ])
  })

  it('requires a reported list and distinguishes unknown from no known allergies', () => {
    expect(patientFormSchema.safeParse({ ...valid, allergy_status: 'reported' }).success).toBe(
      false,
    )
    for (const allergy_status of ['unknown', 'no_known']) {
      const result = patientFormSchema.safeParse({
        ...valid,
        allergy_status,
        allergies: ['Example allergen'],
      })
      expect(result.success).toBe(false)
    }
    expect(
      patientFormSchema.safeParse({
        ...valid,
        allergy_status: 'reported',
        allergies: ['Example allergen'],
      }).success,
    ).toBe(true)
  })

  it('bounds list sizes and labels and locates condition errors on the row', () => {
    expect(
      patientFormSchema.safeParse({
        ...valid,
        conditions: Array.from({ length: 101 }, () => ({ code: '', label: 'Condition' })),
      }).success,
    ).toBe(false)
    expect(
      patientFormSchema.safeParse({
        ...valid,
        allergies: Array.from({ length: 101 }, () => 'Allergen'),
        allergy_status: 'reported',
      }).success,
    ).toBe(false)
    const result = patientFormSchema.safeParse({
      ...valid,
      conditions: [{ code: 'x'.repeat(17), label: '' }],
    })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.issues.map((issue) => issue.path)).toEqual([
        ['conditions', 0, 'code'],
        ['conditions', 0, 'label'],
      ])
    expect(
      patientFormSchema.safeParse({
        ...valid,
        allergies: ['x'.repeat(501)],
        allergy_status: 'reported',
      }).success,
    ).toBe(false)
  })
})
