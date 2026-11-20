import { isApiError } from '@/api'

export interface FormErrors {
  message: string
  fields: Record<string, string>
}

export function getFormErrors(error: unknown): FormErrors {
  if (isApiError(error)) return { message: error.message, fields: { ...error.fieldErrors } }
  return { message: 'The request could not be completed. Try again.', fields: {} }
}
