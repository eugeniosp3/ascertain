import { AllergiesEditor } from './AllergiesEditor'
import { ConditionsEditor } from './ConditionsEditor'
import { PatientSelect } from './PatientInput'
import { bloodTypes } from './schema'
import type { PatientFormBinding } from './use-patient-form'

export function MedicalFields({ binding }: { binding: PatientFormBinding }) {
  return (
    <div className="patient-form-medical">
      <div className="patient-form-grid">
        <PatientSelect
          binding={binding}
          name="blood_type"
          label="Blood type"
          options={[
            { value: '', label: 'Unknown' },
            ...bloodTypes.map((value) => ({ value, label: value })),
          ]}
        />
      </div>
      <ConditionsEditor binding={binding} />
      <AllergiesEditor binding={binding} />
    </div>
  )
}
