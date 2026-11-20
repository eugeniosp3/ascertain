import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import type { PatientWrite } from '@/api/types'
import { getFormErrors } from '@/utils/form-errors'
import { isPatientField } from './form-errors'
import { toPatientWrite } from './mapping'
import { patientFormSchema, type PatientFormValues } from './schema'

export function usePatientForm(
  initialValues: PatientFormValues,
  onSave: (values: PatientWrite) => Promise<void>,
) {
  const [error, setError] = useState<string>()
  const [serverFields, setServerFields] = useState<Record<string, string>>({})
  // Form validation: TanStack Form owns the draft; Zod checks it on blur and before submission.
  const form = useForm({
    defaultValues: initialValues,
    validators: { onBlur: patientFormSchema, onSubmit: patientFormSchema },
    onSubmitInvalid: () => setError('Check the highlighted fields before saving.'),
    onSubmit: async ({ value }) => {
      setError(undefined)
      setServerFields({})
      try {
        await onSave(toPatientWrite(value))
      } catch (cause) {
        if (cause && typeof cause === 'object' && 'name' in cause && cause.name === 'AbortError')
          return
        // Server validation: known field paths attach to controls; other errors stay visible at form level.
        const failure = getFormErrors(cause)
        const fields: Record<string, string> = {}
        const messages = [failure.message]
        for (const [path, message] of Object.entries(failure.fields)) {
          if (isPatientField(path, value)) fields[path] = message
          else messages.push(message)
        }
        setServerFields(fields)
        setError([...new Set(messages)].join(' '))
      }
    },
  })

  // Error recovery: editing a field removes server messages that no longer describe its current value.
  function clearServerField(name: string) {
    setServerFields((fields) => {
      const next = { ...fields }
      // List edits may shift indices, so their old server errors no longer identify the same row.
      const root = name.split('[')[0]!
      for (const key of Object.keys(next)) {
        if (
          key === name ||
          ((root === 'conditions' || root === 'allergies') &&
            (key === root || key.startsWith(`${root}[`)))
        ) {
          delete next[key]
        }
      }
      return next
    })
  }

  return { form, error, serverFields, clearServerField }
}

export type PatientFormBinding = ReturnType<typeof usePatientForm>
