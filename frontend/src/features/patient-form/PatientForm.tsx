import { useState, type ReactNode } from 'react'
import type { PatientDetail, PatientWrite } from '@/api/types'
import { InlineError } from '@/components/shared/InlineError'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ContactFields } from './ContactFields'
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
  const { form, error } = binding
  // Form composition: create and edit reuse these field groups and the same submission state.
  return (
    <form
      className="patient-form"
      aria-label={patient ? 'Edit patient' : 'Add patient'}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (!form.state.isSubmitting) void form.handleSubmit()
      }}
    >
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(submitting) => (
          <>
            {error && <InlineError message={error} />}
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
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : patient ? 'Save changes' : 'Add patient'}
              </Button>
            </div>
          </>
        )}
      </form.Subscribe>
    </form>
  )
}
