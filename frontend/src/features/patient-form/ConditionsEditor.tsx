import { useId } from 'react'
import { FormField } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { fieldDescription, fieldMessage } from './form-errors'
import { PatientInput } from './PatientInput'
import type { PatientFormBinding } from './use-patient-form'

export function ConditionsEditor({ binding }: { binding: PatientFormBinding }) {
  const id = useId()
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
            description="Add each condition separately. Keep an existing code when editing its label; codes are optional."
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
                      maxLength={200}
                      required
                    />
                    <PatientInput
                      binding={binding}
                      name={`conditions[${index}].code`}
                      label={`Condition ${index + 1} code`}
                      maxLength={40}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Remove condition ${index + 1}`}
                    onClick={() => {
                      clearServerField('conditions')
                      void field.removeValue(index)
                    }}
                  >
                    Remove condition
                  </Button>
                </fieldset>
              ))}
              <Button
                id={id}
                aria-label="Add condition"
                type="button"
                variant="outline"
                disabled={field.state.value.length >= 100}
                aria-invalid={!!error}
                aria-describedby={fieldDescription(id, 'description', error)}
                onClick={() => {
                  clearServerField('conditions')
                  field.pushValue({ code: '', label: '' })
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
