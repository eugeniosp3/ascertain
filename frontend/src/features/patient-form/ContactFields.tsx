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
        maxLength={40}
      />
      <PatientInput
        binding={binding}
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        maxLength={254}
      />
      <PatientInput
        binding={binding}
        name="address_line1"
        label="Address line 1"
        autoComplete="address-line1"
        maxLength={200}
      />
      <PatientInput
        binding={binding}
        name="address_line2"
        label="Address line 2"
        autoComplete="address-line2"
        maxLength={200}
      />
      <PatientInput
        binding={binding}
        name="city"
        label="City"
        autoComplete="address-level2"
        maxLength={100}
      />
      <PatientInput
        binding={binding}
        name="state"
        label="State / region"
        autoComplete="address-level1"
        maxLength={100}
      />
      <PatientInput
        binding={binding}
        name="postal_code"
        label="Postal code"
        autoComplete="postal-code"
        maxLength={20}
      />
    </div>
  )
}
