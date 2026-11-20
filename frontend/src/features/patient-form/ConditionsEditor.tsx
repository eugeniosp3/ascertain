import { PATIENT_FIELD_LIMITS as limits } from '@/api/constraints'
import { useId, useRef } from 'react'
import { FormField } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { fieldMessage } from '@/utils/form-errors'
import { fieldDescription } from './form-errors'
import { PatientInput } from './PatientInput'
import type { PatientFormBinding } from './use-patient-form'

export function ConditionsEditor({ binding }: { binding: PatientFormBinding }) {
  const id = useId()
  const addButton = useRef<HTMLButtonElement>(null)
  const { form, serverFields, clearServerField } = binding
  return (
    <form.Field name="conditions" mode="array">
      {(field) => {
        const error = serverFields.conditions ?? fieldMessage(field.state.meta.errors)
        return (
          <FormField
            label="Conditions"
            htmlFor={id}
            error={error}
            description="Add each condition separately. Codes are optional."
          >
            <div className="patient-form-repeat">
              {field.state.value.length === 0 && (
                <p className="patient-form-hint">No conditions listed.</p>
              )}
              {field.state.value.map((_, index) => (
                <fieldset className="patient-form-row" key={index}>
                  <legend>Condition {index + 1}</legend>
                  <div className="patient-form-grid">
                    <PatientInput
                      binding={binding}
                      name={`conditions[${index}].label`}
                      label={`Condition ${index + 1} label`}
                      maxLength={limits.condition_label}
                      required
                    />
                    <PatientInput
                      binding={binding}
                      name={`conditions[${index}].code`}
                      label={`Condition ${index + 1} code`}
                      maxLength={limits.condition_code}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Remove condition ${index + 1}`}
                    // Keep the target in place until click; focus then still runs blur validation.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      const remove = event.currentTarget
                      remove.focus()
                      clearServerField('conditions')
                      void field.removeValue(index)
                      // Removing the final row unmounts this button; keep focus in the editor.
                      requestAnimationFrame(() => {
                        if (!remove.isConnected) addButton.current?.focus()
                      })
                    }}
                  >
                    Remove condition
                  </Button>
                </fieldset>
              ))}
              <Button
                ref={addButton}
                id={id}
                data-patient-field="conditions"
                aria-label="Add condition"
                type="button"
                variant="outline"
                disabled={field.state.value.length >= 100}
                aria-invalid={!!error}
                aria-describedby={fieldDescription(id, 'description', error)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  clearServerField('conditions')
                  field.pushValue({ code: '', label: '' })
                  event.currentTarget.focus()
                }}
              >
                Add condition
              </Button>
            </div>
          </FormField>
        )
      }}
    </form.Field>
  )
}
