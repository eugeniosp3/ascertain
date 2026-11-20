import type { PatientListItem } from '@/api/types'
import { formatDate } from '@/utils/dates'
import { formatRecordNumber, getInitials, getPatientName } from '@/utils/patient'
import { PatientOpenLink, type PatientLinkContext } from './PatientOpenLink'

export function PatientAvatar({ name }: { name: string }) {
  const tone = name.charCodeAt(0) % 4
  return (
    <span className={`ac-patient-avatar ac-avatar-${tone}`} aria-hidden="true">
      {getInitials(name)}
    </span>
  )
}

export function PatientIdentity({
  patient,
  index,
  context,
}: {
  patient: PatientListItem
  index: number
  context: PatientLinkContext
}) {
  const name = getPatientName(patient)
  return (
    <div className="ac-patient-identity">
      <PatientAvatar name={name} />
      <div className="ac-patient-text">
        <PatientOpenLink
          patient={patient}
          index={index}
          context={context}
          className="ac-patient-name"
        >
          {name}
        </PatientOpenLink>
        <div className="ac-patient-meta">
          <span>{formatDate(patient.date_of_birth)}</span>
          <span aria-hidden="true">·</span>
          <span>{formatRecordNumber(patient)}</span>
        </div>
      </div>
    </div>
  )
}
