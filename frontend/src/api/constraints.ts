export const MAX_COMMENT_NOTE_IDS = 100
export const NOTE_CONTENT_MAX = 20_000
export const COMMENT_BODY_MAX = 10_000

export const PATIENT_FIELD_LIMITS = {
  name: 100,
  middle_initial: 1,
  phone: 40,
  email: 254,
  address: 255,
  city: 100,
  state: 2,
  postal_code: 10,
  condition_code: 16,
  condition_label: 500,
  allergy: 500,
  list: 100,
} as const

export function isValidPhone(value: string): boolean {
  const digits = value.match(/\p{Nd}/gu)?.length ?? 0
  return (
    value.length >= 7 &&
    value.length <= PATIENT_FIELD_LIMITS.phone &&
    digits >= 7 &&
    digits <= 20 &&
    /^\+?[\p{Nd}\s().-]+(?:\s*(?:x|ext\.?|#)\s*\p{Nd}{1,6})?$/iu.test(value)
  )
}
