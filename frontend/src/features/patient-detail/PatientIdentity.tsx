import type { Ref } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import type { PatientDetail } from '@/api'
import { Button } from '@/components/ui/button'
import { DialogTitle } from '@/components/ui/dialog'
import { StatusPill } from '@/components/ui/status-pill'
import { getInitials, getPatientName, formatRecordNumber } from '@/utils/patient'
import { formatDate } from '@/utils/dates'

interface Props {
  patient?: PatientDetail
  compact: boolean
  headingRef: Ref<HTMLHeadingElement>
  onClose: () => void
}

export function PatientIdentity({ patient, compact, headingRef, onClose }: Props) {
  const name = patient ? getPatientName(patient) : 'Patient record'
  return (
    <header className="pw-identity" data-compact={compact}>
      <Button type="button" variant="ghost" className="pw-back" onClick={onClose}>
        <ArrowLeft aria-hidden="true" />
        <span>Back</span>
      </Button>
      <div className="pw-avatar" aria-hidden="true">
        {getInitials(name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <DialogTitle ref={headingRef} tabIndex={-1} className="pw-name">
            {name}
          </DialogTitle>
          {patient && <StatusPill status={patient.status} className="pw-status" />}
        </div>
        {patient && (
          <>
            <dl className="pw-facts">
              <div>
                <dt>DOB</dt>
                <dd>{formatDate(patient.date_of_birth)}</dd>
              </div>
              <div>
                <dt>Age</dt>
                <dd>{patient.age}</dd>
              </div>
              <div>
                <dt>{compact ? 'Record' : 'MRN'}</dt>
                <dd>{compact ? formatRecordNumber(patient) : patient.mrn || 'Not recorded'}</dd>
              </div>
              {!compact && (
                <div>
                  <dt>Source ID</dt>
                  <dd>{patient.source_patient_id || 'Not recorded'}</dd>
                </div>
              )}
            </dl>
            <dl className="pw-contact">
              <div>
                <dt>Phone</dt>
                <dd>{patient.phone || 'Not recorded'}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{patient.email || 'Not recorded'}</dd>
              </div>
              <div>
                <dt>Last visit</dt>
                <dd>{patient.last_visit ? formatDate(patient.last_visit) : 'No visit recorded'}</dd>
              </div>
            </dl>
          </>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="pw-close"
        aria-label="Close patient workspace"
        onClick={onClose}
      >
        <X aria-hidden="true" />
      </Button>
    </header>
  )
}
