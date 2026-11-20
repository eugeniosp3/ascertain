import { useId, type ComponentProps } from 'react'
import { FormField } from '@/components/shared/FormField'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fieldDescription, fieldMessage } from './form-errors'
import type { PatientFormValues } from './schema'
import type { PatientFormBinding } from './use-patient-form'

type TextName =
  | Exclude<
      keyof PatientFormValues,
      'conditions' | 'allergies' | 'status' | 'blood_type' | 'allergy_status'
    >
  | `conditions[${number}].code`
  | `conditions[${number}].label`
  | `allergies[${number}]`

interface PatientInputProps extends Omit<
  ComponentProps<typeof Input>,
  'name' | 'value' | 'onChange' | 'onBlur' | 'form'
> {
  binding: PatientFormBinding
  name: TextName
  label: string
  description?: string
}

export function PatientInput({
  binding,
  name,
  label,
  description,
  required,
  ...props
}: PatientInputProps) {
  const id = useId()
  const { form, serverFields, clearServerField } = binding
  return (
    <form.Field name={name}>
      {(field) => {
        const error = serverFields[name] ?? fieldMessage(field.state.meta.errors)
        return (
          <FormField
            label={label}
            htmlFor={id}
            error={error}
            description={description}
            required={required}
          >
            <Input
              {...props}
              id={id}
              name={name}
              value={field.state.value}
              required={required}
              onBlur={field.handleBlur}
              onChange={(event) => {
                clearServerField(name)
                field.handleChange(event.target.value)
              }}
              aria-invalid={!!error}
              aria-describedby={fieldDescription(id, description, error)}
            />
          </FormField>
        )
      }}
    </form.Field>
  )
}

type SelectName = 'status' | 'blood_type'

export function PatientSelect({
  binding,
  name,
  label,
  options,
}: {
  binding: PatientFormBinding
  name: SelectName
  label: string
  options: ReadonlyArray<{ value: string; label: string }>
}) {
  const id = useId()
  const { form, serverFields, clearServerField } = binding
  return (
    <form.Field name={name}>
      {(field) => {
        const error = serverFields[name] ?? fieldMessage(field.state.meta.errors)
        return (
          <FormField label={label} htmlFor={id} error={error}>
            <Select
              name={name}
              value={field.state.value || 'unknown'}
              onValueChange={(value) => {
                clearServerField(name)
                field.handleChange(
                  (value === 'unknown' ? '' : value) as PatientFormValues[SelectName],
                )
              }}
            >
              <SelectTrigger
                id={id}
                onBlur={field.handleBlur}
                aria-invalid={!!error}
                aria-describedby={fieldDescription(id, undefined, error)}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value || 'unknown'}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )
      }}
    </form.Field>
  )
}
