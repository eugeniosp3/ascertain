import { isApiError } from '@/api'

export interface FormErrors {
  message: string
  fields: Record<string, string>
}

export function getFormErrors(error: unknown): FormErrors {
  if (isApiError(error)) return { message: error.message, fields: { ...error.fieldErrors } }
  return { message: 'The request could not be completed. Try again.', fields: {} }
}

/** First client-side field error: a plain string or a Zod/Standard Schema issue with a message. */
export function fieldMessage(errors: readonly unknown[]): string | undefined {
  for (const error of errors) {
    if (typeof error === 'string') return error
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      return error.message
    }
  }
}
