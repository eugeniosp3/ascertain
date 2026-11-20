import { z } from 'zod'
import { formatDate } from '@/utils/dates'

export const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const

const optionalText = (max: number) => z.string().trim().max(max, `Use at most ${max} characters.`)
const requiredText = (label: string, max: number) => optionalText(max).min(1, `Enter ${label}.`)

function validDate(value: string) {
  try {
    formatDate(value)
    return true
  } catch {
    return false
  }
}

// Date validation: preserve calendar dates and reject invalid or future values before a write.
const calendarDate = z
  .string()
  .refine(validDate, 'Enter a valid date.')
  .refine(
    (value) => !validDate(value) || value <= new Date().toISOString().slice(0, 10),
    'Date cannot be in the future.',
  )

/** Form schema: validate input strings here; the write mapper converts blank optional values to null. */
export const patientFormSchema = z
  .object({
    first_name: requiredText('a first name', 60),
    middle_initial: optionalText(1).refine(
      (value) => !value || /^\p{L}$/u.test(value),
      'Use one letter.',
    ),
    last_name: requiredText('a last name', 60),
    date_of_birth: calendarDate,
    phone: optionalText(40).refine(
      (value) => !value || /^(?=.*\d)[+\d\s().#xext-]{3,40}$/i.test(value),
      'Enter a valid phone number.',
    ),
    email: optionalText(254).refine(
      (value) => !value || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
      'Enter a valid email address.',
    ),
    address_line1: optionalText(200),
    address_line2: optionalText(200),
    city: optionalText(100),
    state: optionalText(100),
    postal_code: optionalText(20),
    blood_type: z.enum(['', ...bloodTypes], { error: 'Choose a valid blood type.' }),
    status: z.enum(['active', 'inactive'], { error: 'Choose Active or Inactive.' }),
    last_visit: z.union([z.literal(''), calendarDate]),
    conditions: z
      .array(z.object({ code: optionalText(40), label: requiredText('a condition', 200) }))
      .max(100, 'Use at most 100 conditions.'),
    allergies: z.array(requiredText('an allergy', 200)).max(100, 'Use at most 100 allergies.'),
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
