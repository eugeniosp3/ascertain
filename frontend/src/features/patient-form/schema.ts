import { z } from 'zod'
import { formatDate } from '@/utils/dates'
import { isValidPhone, PATIENT_FIELD_LIMITS as limits } from '@/api/constraints'

export const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .refine((value) => [...value].length <= max, `Use at most ${max} characters.`)
const requiredText = (label: string, max: number) => optionalText(max).min(1, `Enter ${label}.`)

function validDate(value: string) {
  try {
    formatDate(value)
    return true
  } catch {
    return false
  }
}

// The user's local calendar day; UTC's date is already tomorrow on a US evening.
function localToday(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

// Date validation: preserve calendar dates and reject invalid or future values before a write.
const calendarDate = z
  .string()
  .refine(validDate, 'Enter a valid date.')
  .refine((value) => !validDate(value) || value <= localToday(), 'Date cannot be in the future.')

/** Form schema: validate input strings here; the write mapper converts blank optional values to null. */
export const patientFormSchema = z
  .object({
    first_name: requiredText('a first name', limits.name),
    middle_initial: optionalText(limits.middle_initial),
    last_name: requiredText('a last name', limits.name),
    date_of_birth: calendarDate,
    phone: optionalText(limits.phone).refine(
      (value) => !value || isValidPhone(value),
      'Enter a valid phone number.',
    ),
    email: optionalText(limits.email).refine(
      (value) => !value || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
      'Enter a valid email address.',
    ),
    address_line1: optionalText(limits.address),
    address_line2: optionalText(limits.address),
    city: optionalText(limits.city),
    state: optionalText(limits.state).refine(
      (value) => !value || [...value].length === 2,
      'Use exactly two characters.',
    ),
    postal_code: optionalText(limits.postal_code),
    blood_type: z.enum(['', ...bloodTypes], { error: 'Choose a valid blood type.' }),
    status: z.enum(['active', 'inactive'], { error: 'Choose Active or Inactive.' }),
    last_visit: z.union([z.literal(''), calendarDate]),
    conditions: z
      .array(
        z.object({
          code: optionalText(limits.condition_code),
          label: requiredText('a condition', limits.condition_label),
        }),
      )
      .max(100, 'Use at most 100 conditions.'),
    allergies: z
      .array(requiredText('an allergy', limits.allergy))
      .max(100, 'Use at most 100 allergies.'),
    allergy_status: z.enum(['unknown', 'no_known', 'reported'], {
      error: 'Choose an allergy status.',
    }),
  })
  // Cross-field validation: the allergy status and allergy list must describe the same situation.
  .superRefine((value, context) => {
    if (value.allergy_status === 'reported' && value.allergies.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['allergies'],
        message: 'Add at least one reported allergy.',
      })
    }
    if (value.allergy_status !== 'reported' && value.allergies.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['allergies'],
        message: 'Choose Reported allergies to keep this list.',
      })
    }
  })

export type PatientFormValues = z.input<typeof patientFormSchema>
