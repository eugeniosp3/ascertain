import { useState } from 'react'
import { useForm, type DeepKeys, type ValidationLogicFn } from '@tanstack/react-form'
import type { PatientWrite } from '@/api/types'
import { getFormErrors } from '@/utils/form-errors'
import { isPatientField } from './form-errors'
import { toPatientWrite } from './mapping'
import { patientFormSchema, type PatientFormValues } from './schema'

// One validation slot refreshes on edits and blur, so cross-field errors cannot become stale.
const patientValidationLogic: ValidationLogicFn = ({ form, validators, event, runValidation }) =>
  runValidation({
    form,
    validators:
      event.type === 'mount'
        ? []
        : [
            {
              fn: event.async ? validators?.onDynamicAsync : validators?.onDynamic,
              cause: 'dynamic',
            },
          ],
  })

export function usePatientForm(
  initialValues: PatientFormValues,
  onSave: (values: PatientWrite) => Promise<void>,
) {
  const [error, setError] = useState<{ message: string; source: 'validation' | 'server' }>()
  const [recoveryAttempt, setRecoveryAttempt] = useState(0)
  const [serverFields, setServerFields] = useState<Record<string, string>>({})
  // Form validation: reveal only blurred fields until submission, then validate the whole draft.
  const form = useForm({
    defaultValues: initialValues,
    // A prior blur error must not short-circuit the full validation of a submit attempt.
    canSubmitWhenInvalid: true,
    validationLogic: patientValidationLogic,
    validators: {
      onDynamic: ({ value, formApi }) => {
        const result = patientFormSchema.safeParse(value)
        if (result.success) return undefined
        const fields: Record<string, string> = {}
        for (const issue of result.error.issues) {
          const path = issue.path.reduce<string>(
            (name, part) =>
              typeof part === 'number'
                ? `${name}[${part}]`
                : name
                  ? `${name}.${String(part)}`
                  : String(part),
            '',
          )
          if (
            formApi.state.submissionAttempts > 0 ||
            formApi.getFieldMeta(path as DeepKeys<PatientFormValues>)?.isBlurred ||
            (path === 'allergies' &&
              (formApi.getFieldMeta('allergy_status')?.isBlurred ||
                formApi.getFieldMeta('allergies')?.isTouched))
          ) {
            fields[path] ??= issue.message
          }
        }
        return Object.keys(fields).length ? { fields } : undefined
      },
    },
    onSubmitInvalid: () => {
      setError({ message: 'Check these fields before saving.', source: 'validation' })
      setRecoveryAttempt((attempt) => attempt + 1)
    },
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
        setError({ message: [...new Set(messages)].join(' '), source: 'server' })
        setRecoveryAttempt((attempt) => attempt + 1)
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

  return { form, error, recoveryAttempt, serverFields, clearServerField }
}

export type PatientFormBinding = ReturnType<typeof usePatientForm>
