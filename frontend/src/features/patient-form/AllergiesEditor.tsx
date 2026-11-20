import { PATIENT_FIELD_LIMITS as limits } from '@/api/constraints'
import { useId, useRef } from 'react'
import { FieldError, FormField } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { fieldMessage } from '@/utils/form-errors'
import { fieldDescription } from './form-errors'
import { PatientInput } from './PatientInput'
import type { PatientFormBinding } from './use-patient-form'

const statuses = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'no_known', label: 'No known allergies' },
  { value: 'reported', label: 'Reported allergies' },
] as const

export function AllergiesEditor({ binding }: { binding: PatientFormBinding }) {
  const id = useId()
  const addButton = useRef<HTMLButtonElement>(null)
  const { form, serverFields, clearServerField } = binding
  return (
    <div className="patient-form-repeat">
      <form.Field name="allergy_status">
        {(field) => {
          const error = serverFields.allergy_status ?? fieldMessage(field.state.meta.errors)
          // With the list editor closed, a server allergy error belongs to these radios: the
          // summary sends focus here, so they describe it alongside their own error.
          const listError = field.state.value === 'reported' ? undefined : serverFields.allergies
          const describedBy = [
            fieldDescription(id, 'description', error),
            listError && `${id}-list-error`,
          ]
            .filter(Boolean)
            .join(' ')
          const invalid = !!(error || listError)
          return (
            <fieldset
              className="patient-form-choices"
              aria-describedby={describedBy}
              aria-invalid={invalid}
            >
              <legend>Allergy status</legend>
              <p id={`${id}-description`} className="patient-form-hint">
                Unknown or No known allergies clears the reported list.
              </p>
              <div className="patient-form-choice-options">
                {statuses.map(({ value, label }) => (
                  <Label className="patient-form-choice" key={value} htmlFor={`${id}-${value}`}>
                    <input
                      id={`${id}-${value}`}
                      type="radio"
                      name="allergy_status"
                      value={value}
                      checked={field.state.value === value}
                      onBlur={field.handleBlur}
                      aria-invalid={invalid}
                      aria-describedby={describedBy}
                      onChange={() => {
                        clearServerField('allergy_status')
                        clearServerField('allergies')
                        field.handleChange(value)
                        if (value !== 'reported') form.setFieldValue('allergies', [])
                      }}
                    />
                    {label}
                  </Label>
                ))}
              </div>
              {error && <FieldError id={`${id}-error`} message={error} />}
            </fieldset>
          )
        }}
      </form.Field>
      <form.Subscribe selector={(state) => state.values.allergy_status}>
        {(status) =>
          status === 'reported' ? (
            <form.Field name="allergies" mode="array">
              {(field) => {
                const error = serverFields.allergies ?? fieldMessage(field.state.meta.errors)
                return (
                  <FormField
                    label="Reported allergy list"
                    htmlFor={`${id}-add`}
                    required
                    error={error}
                  >
                    <div className="patient-form-repeat">
                      {field.state.value.map((_, index) => (
                        <div className="patient-form-allergy-row" key={index}>
                          <PatientInput
                            binding={binding}
                            name={`allergies[${index}]`}
                            label={`Allergy ${index + 1}`}
                            maxLength={limits.allergy}
                            required
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            aria-label={`Remove allergy ${index + 1}`}
                            // Blurring before click can change validation height and move the target.
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={(event) => {
                              const remove = event.currentTarget
                              remove.focus()
                              clearServerField('allergies')
                              void field.removeValue(index)
                              // Removing the final row unmounts this button; keep focus in the editor.
                              requestAnimationFrame(() => {
                                if (!remove.isConnected) addButton.current?.focus()
                              })
                            }}
                          >
                            Remove allergy
                          </Button>
                        </div>
                      ))}
                      <Button
                        ref={addButton}
                        id={`${id}-add`}
                        data-patient-field="allergies"
                        aria-label="Add allergy"
                        type="button"
                        variant="outline"
                        disabled={field.state.value.length >= 100}
                        aria-invalid={!!error}
                        aria-describedby={fieldDescription(`${id}-add`, undefined, error)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={(event) => {
                          clearServerField('allergies')
                          field.pushValue('')
                          event.currentTarget.focus()
                        }}
                      >
                        Add allergy
                      </Button>
                    </div>
                  </FormField>
                )
              }}
            </form.Field>
          ) : serverFields.allergies ? (
            <FieldError id={`${id}-list-error`} message={serverFields.allergies} />
          ) : null
        }
      </form.Subscribe>
    </div>
  )
}
