import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { PatientDetail, PatientWrite } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ContactFields } from './ContactFields'
import { fieldMessage } from '@/utils/form-errors'
import { patientFieldLabel } from './form-errors'
import { emptyPatientValues, patientToFormValues } from './mapping'
import { MedicalFields } from './MedicalFields'
import { PersonalFields } from './PersonalFields'
import { usePatientForm } from './use-patient-form'
import './patient-form.css'

export interface PatientFormProps {
  patient?: PatientDetail
  onSave: (values: PatientWrite) => Promise<void>
  onCancel: () => void
}

// Form composition: one section wrapper gives personal, contact and medical fields the same layout.
function FormSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <Card className="patient-form-section">
      <CardHeader>
        <h2>{title}</h2>
        <p className="patient-form-hint">{description}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function PatientForm({ patient, onSave, onCancel }: PatientFormProps) {
  // Draft preservation: initialize once so a background query refetch cannot overwrite unsaved input.
  const [initialValues] = useState(() =>
    patient ? patientToFormValues(patient) : emptyPatientValues(),
  )
  const binding = usePatientForm(initialValues, onSave)
  const { form, error, recoveryAttempt, serverFields } = binding
  const formRef = useRef<HTMLFormElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const summaryId = useId()

  // Error recovery: every failed attempt returns focus to a visible, useful summary.
  useEffect(() => {
    if (!recoveryAttempt) return
    summaryRef.current?.focus({ preventScroll: true })
    summaryRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, [recoveryAttempt])

  function focusField(name: string) {
    const controls = Array.from(
      formRef.current?.querySelectorAll<HTMLElement>('[name], [data-patient-field]') ?? [],
    )
    const target =
      controls.find((control) => control.dataset.patientField === name) ??
      controls.find((control) => control.getAttribute('name') === name) ??
      (name === 'allergies'
        ? controls.find((control) => control.getAttribute('name') === 'allergy_status')
        : undefined)
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }
  // Form composition: create and edit reuse these field groups and the same submission state.
  return (
    <form
      ref={formRef}
      className="patient-form"
      aria-label={patient ? 'Edit patient' : 'Add patient'}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (!form.state.isSubmitting) void form.handleSubmit()
      }}
    >
      <form.Subscribe selector={(state) => [state.isSubmitting, state.fieldMeta] as const}>
        {([submitting, fieldMeta]) => {
          const messages = new Map<string, string>()
          for (const [name, meta] of Object.entries(fieldMeta)) {
            const message = serverFields[name] ?? fieldMessage(meta?.errors ?? [])
            if (message) messages.set(name, message)
          }
          for (const [name, message] of Object.entries(serverFields)) messages.set(name, message)
          return (
            <>
              {error && (error.source === 'server' || messages.size > 0) && (
                <div
                  ref={summaryRef}
                  role="alert"
                  tabIndex={-1}
                  aria-labelledby={summaryId}
                  className="patient-form-error-summary"
                >
                  <p id={summaryId}>{error.message}</p>
                  {messages.size > 0 && (
                    <ul>
                      {[...messages].map(([name, message]) => (
                        <li key={name}>
                          <button type="button" onClick={() => focusField(name)}>
                            {patientFieldLabel(name)}: {message}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <fieldset className="patient-form-body" disabled={submitting} aria-busy={submitting}>
                <legend className="sr-only">Patient profile</legend>
                <FormSection
                  title="Personal information"
                  description="Required fields are marked with an asterisk."
                >
                  <PersonalFields binding={binding} />
                </FormSection>
                <FormSection
                  title="Contact & address"
                  description="Optional contact details for this patient."
                >
                  <ContactFields binding={binding} />
                </FormSection>
                <FormSection
                  title="Medical information"
                  description="Record known information and leave unconfirmed details unknown."
                >
                  <MedicalFields binding={binding} />
                </FormSection>
              </fieldset>
              <div className="patient-form-actions">
                <Button type="button" variant="outline" disabled={submitting} onClick={onCancel}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  // Keep blur validation from moving the submit target before the click lands.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => event.currentTarget.focus()}
                >
                  {submitting ? 'Saving…' : patient ? 'Save changes' : 'Add patient'}
                </Button>
              </div>
            </>
          )
        }}
      </form.Subscribe>
    </form>
  )
}
