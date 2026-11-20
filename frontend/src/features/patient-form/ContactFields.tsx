import { PATIENT_FIELD_LIMITS as limits } from '@/api/constraints'
import { PatientInput } from './PatientInput'
import type { PatientFormBinding } from './use-patient-form'

export function ContactFields({ binding }: { binding: PatientFormBinding }) {
  return (
    <div className="patient-form-grid">
      <PatientInput
        binding={binding}
        name="phone"
        label="Phone"
        type="tel"
        autoComplete="tel"
        maxLength={limits.phone}
      />
      <PatientInput
        binding={binding}
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        maxLength={limits.email}
      />
      <PatientInput
        binding={binding}
        name="address_line1"
        label="Address line 1"
        autoComplete="address-line1"
        maxLength={limits.address}
      />
      <PatientInput
        binding={binding}
        name="address_line2"
        label="Address line 2"
        autoComplete="address-line2"
        maxLength={limits.address}
      />
      <PatientInput
        binding={binding}
        name="city"
        label="City"
        autoComplete="address-level2"
        maxLength={limits.city}
      />
      <PatientInput
        binding={binding}
        name="state"
        label="State / region"
        autoComplete="address-level1"
        maxLength={limits.state}
      />
      <PatientInput
        binding={binding}
        name="postal_code"
        label="Postal code"
        autoComplete="postal-code"
        maxLength={limits.postal_code}
      />
    </div>
  )
}
