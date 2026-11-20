import { PATIENT_FIELD_LIMITS as limits } from '@/api/constraints'
import { PatientInput } from './PatientInput'
import type { PatientFormBinding } from './use-patient-form'

// Patient contact details, not the clinician's: autofill is off; type and inputMode still pick
// the right phone keyboard.
export function ContactFields({ binding }: { binding: PatientFormBinding }) {
  return (
    <div className="patient-form-grid">
      <PatientInput
        binding={binding}
        name="phone"
        label="Phone"
        type="tel"
        autoComplete="off"
        maxLength={limits.phone}
      />
      <PatientInput
        binding={binding}
        name="email"
        label="Email"
        type="email"
        autoComplete="off"
        maxLength={limits.email}
      />
      <PatientInput
        binding={binding}
        name="address_line1"
        label="Address line 1"
        autoComplete="off"
        maxLength={limits.address}
      />
      <PatientInput
        binding={binding}
        name="address_line2"
        label="Address line 2"
        autoComplete="off"
        maxLength={limits.address}
      />
      <PatientInput
        binding={binding}
        name="city"
        label="City"
        autoComplete="off"
        maxLength={limits.city}
      />
      <PatientInput
        binding={binding}
        name="state"
        label="State / region"
        autoComplete="off"
        maxLength={limits.state}
      />
      <PatientInput
        binding={binding}
        name="postal_code"
        label="Postal code"
        autoComplete="off"
        maxLength={limits.postal_code}
      />
    </div>
  )
}
