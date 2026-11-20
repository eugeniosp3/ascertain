import type { PatientFormValues } from './schema'

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

export function fieldDescription(id: string, description?: string, error?: string) {
  return (
    [description && `${id}-description`, error && `${id}-error`].filter(Boolean).join(' ') ||
    undefined
  )
}

export function isPatientField(path: string, values: PatientFormValues): boolean {
  if (Object.hasOwn(values, path)) return true
  const condition = /^conditions\[(\d+)\]\.(code|label)$/.exec(path)
  if (condition) return Number(condition[1]) < values.conditions.length
  const allergy = /^allergies\[(\d+)\]$/.exec(path)
  return !!allergy && Number(allergy[1]) < values.allergies.length
}
