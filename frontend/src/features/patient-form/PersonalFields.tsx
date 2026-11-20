import { PatientInput, PatientSelect } from './PatientInput'
import type { PatientFormBinding } from './use-patient-form'

export function PersonalFields({ binding }: { binding: PatientFormBinding }) {
  return (
    <div className="patient-form-grid">
      <PatientInput
        binding={binding}
        name="first_name"
        label="First name"
        autoComplete="given-name"
        maxLength={60}
        required
      />
      <PatientInput
        binding={binding}
        name="last_name"
        label="Last name"
        autoComplete="family-name"
        maxLength={60}
        required
      />
      <PatientInput
        binding={binding}
        name="middle_initial"
        label="Middle initial"
        autoComplete="additional-name"
        maxLength={1}
      />
      <PatientInput
        binding={binding}
        name="date_of_birth"
        label="Date of birth"
        type="date"
        autoComplete="bday"
        min="0001-01-01"
        max={new Date().toISOString().slice(0, 10)}
        required
      />
      <PatientSelect
        binding={binding}
        name="status"
        label="Patient status"
        options={[
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ]}
      />
      <PatientInput
        binding={binding}
        name="last_visit"
        label="Last visit"
        type="date"
        min="0001-01-01"
        max={new Date().toISOString().slice(0, 10)}
      />
    </div>
  )
}
