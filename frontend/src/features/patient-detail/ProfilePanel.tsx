import type { ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type PatientDetail, type ProfileDetails } from '@/api'
import { patientKeys } from '@/app/query-keys'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status-pill'
import { formatDate, formatDateTime } from '@/utils/dates'
import { getPatientName } from '@/utils/patient'
import { ConfirmDelete } from './ConfirmDelete'

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pw-section">
      <h4 className="mb-3 font-semibold">{title}</h4>
      <dl className="pw-values">{children}</dl>
    </section>
  )
}

function Value({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {children === null || children === undefined || children === '' ? 'Not recorded' : children}
      </dd>
    </div>
  )
}

function yesNo(value: boolean) {
  return value ? 'Yes' : 'No'
}

/** Named, read-only source sections stay separate from the current patient fields. */
export function SourceDetails({ details }: { details: ProfileDetails }) {
  const {
    identity: i,
    contact: c,
    care_team: t,
    coverage: v,
    clinical: m,
    labs: l,
    social: s,
  } = details
  return (
    <section className="grid gap-3" aria-label="Imported source context">
      <div>
        <h3 className="text-lg font-semibold">Imported source context</h3>
        <p className="text-sm text-muted-foreground">
          Read-only information from the source snapshot.
        </p>
      </div>
      <div className="pw-profile-grid">
        {i && (
          <DetailSection title="Source demographics">
            <Value label="Age at source snapshot">{i.age_years} years</Value>
            <Value label="Sex at birth">{i.sex_at_birth}</Value>
            <Value label="Gender identity">{i.gender_identity}</Value>
            <Value label="Race">{i.race}</Value>
            <Value label="Ethnicity">{i.ethnicity}</Value>
            <Value label="Preferred language">{i.preferred_language}</Value>
            <Value label="Interpreter needed">{yesNo(i.interpreter_needed)}</Value>
            <Value label="Marital status">{i.marital_status}</Value>
            <Value label="Employment status">{i.employment_status}</Value>
          </DetailSection>
        )}
        {c && (
          <DetailSection title="Source contacts">
            <Value label="Home phone">{c.home_phone}</Value>
            <Value label="Mobile phone">{c.mobile_phone}</Value>
            <Value label="Emergency contact">{c.emergency_contact_name}</Value>
            <Value label="Relationship">{c.emergency_contact_relationship}</Value>
            <Value label="Emergency phone">{c.emergency_contact_phone}</Value>
          </DetailSection>
        )}
        {t && (
          <DetailSection title="Care team">
            <Value label="Primary care provider">{t.pcp_name}</Value>
            <Value label="Provider NPI">{t.pcp_npi}</Value>
            <Value label="Home facility">{t.home_facility_key}</Value>
            <Value label="First registered">{formatDate(t.first_registered_date)}</Value>
          </DetailSection>
        )}
        {v && (
          <DetailSection title="Coverage">
            <Value label="Primary payer">{v.primary_payer_name}</Value>
            <Value label="Line of business">{v.primary_line_of_business}</Value>
            <Value label="Plan">{v.primary_plan_name}</Value>
            <Value label="Plan type">{v.primary_plan_type}</Value>
            <Value label="Member ID">{v.primary_member_id}</Value>
            <Value label="Group number">{v.primary_group_number}</Value>
            <Value label="Effective date">{formatDate(v.primary_coverage_effective_date)}</Value>
            <Value label="Secondary payer">{v.secondary_payer_name}</Value>
            <Value label="Secondary member ID">{v.secondary_member_id}</Value>
          </DetailSection>
        )}
        {m && (
          <DetailSection title="Clinical context">
            <Value label="Clinical story">{m.primary_clinical_story}</Value>
            <Value label="Height">{m.height_cm} cm</Value>
            <Value label="Weight">{m.weight_kg} kg</Value>
            <Value label="BMI">{m.bmi}</Value>
            <Value label="Smoking">{m.smoking_status}</Value>
            <Value label="Alcohol use">{m.alcohol_use}</Value>
            <Value label="Hypertension">{yesNo(m.has_hypertension)}</Value>
            <Value label="Diabetes">{m.has_diabetes}</Value>
            <Value label="Chronic kidney disease">{yesNo(m.has_ckd)}</Value>
            <Value label="COPD">{yesNo(m.has_copd)}</Value>
            <Value label="Heart failure">{yesNo(m.has_heart_failure)}</Value>
            <Value label="Coronary artery disease">{yesNo(m.has_cad)}</Value>
            <Value label="Atrial fibrillation">{yesNo(m.has_afib)}</Value>
            <Value label="Obstructive sleep apnea">{yesNo(m.has_osa)}</Value>
            <Value label="Depression">{yesNo(m.has_depression)}</Value>
            <Value label="Obesity">{yesNo(m.has_obesity)}</Value>
            <Value label="Cancer history">{yesNo(m.has_cancer_history)}</Value>
            <Value label="Charlson comorbidity index">{m.charlson_comorbidity_index}</Value>
            <Value label="Active medications">{m.active_medications}</Value>
          </DetailSection>
        )}
        {l && (
          <DetailSection title="Labs and utilization">
            <Value label="Last labs">{formatDate(l.last_labs_date)}</Value>
            <Value label="HbA1c">{l.last_hba1c_pct}%</Value>
            <Value label="eGFR">{l.last_egfr} mL/min/1.73 m²</Value>
            <Value label="Creatinine">{l.last_creatinine_mg_dl} mg/dL</Value>
            <Value label="LDL">{l.last_ldl_mg_dl} mg/dL</Value>
            <Value label="Hemoglobin">{l.last_hemoglobin_g_dl} g/dL</Value>
            <Value label="Hospitalizations, 12 months">{l.hospitalizations_12mo}</Value>
            <Value label="ED visits, 12 months">{l.ed_visits_12mo}</Value>
          </DetailSection>
        )}
        {s && (
          <DetailSection title="Social and care preferences">
            <Value label="Housing">{s.housing_status}</Value>
            <Value label="Transportation barrier">{yesNo(s.transportation_barrier)}</Value>
            <Value label="Advance directive on file">{yesNo(s.advance_directive_on_file)}</Value>
            <Value label="Code status">{s.code_status}</Value>
            <Value label="Source prior authorization requests">{s.pa_request_count}</Value>
          </DetailSection>
        )}
      </div>
    </section>
  )
}

export function ProfilePanel({
  patient,
  actorId,
  onEdit,
  onDeleted,
}: {
  patient: PatientDetail
  actorId: string
  onEdit: () => void
  onDeleted: () => void
}) {
  const client = useQueryClient()
  const deletion = useMutation({
    mutationFn: () => api.deletePatient(patient.id, { actorId }),
    onSuccess: async () => {
      onDeleted()
      await client.cancelQueries({
        predicate: ({ queryKey: k }) =>
          k[0] === 'patients' &&
          (k[1] === patient.id || (k[1] === 'detail' && k[2] === patient.id)),
      })
      client.removeQueries({ queryKey: patientKeys.detail(patient.id) })
      client.removeQueries({ queryKey: ['patients', patient.id] })
      await Promise.all([
        client.invalidateQueries({ queryKey: patientKeys.lists() }),
        client.invalidateQueries({ queryKey: ['notifications'] }),
      ])
    },
  })
  const address = [
    patient.address_line1,
    patient.address_line2,
    [patient.city, patient.state, patient.postal_code].filter(Boolean).join(', '),
  ]
    .filter(Boolean)
    .join('\n')
  return (
    <div className="pw-panel">
      <div className="pw-panel-head">
        <div>
          <h3 className="text-lg font-semibold">Profile</h3>
          <p className="text-sm text-muted-foreground">Personal, contact and medical details.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onEdit}>
            Edit patient
          </Button>
          <ConfirmDelete
            label="Delete patient"
            description="This removes the patient record and its notes and discussion. This action cannot be undone."
            pending={deletion.isPending}
            error={deletion.error}
            onConfirm={() => deletion.mutateAsync()}
          />
        </div>
      </div>
      <div className="pw-profile-grid">
        <DetailSection title="Personal">
          <Value label="Full name">{getPatientName(patient)}</Value>
          <Value label="Date of birth">{formatDate(patient.date_of_birth)}</Value>
          <Value label="Age">{patient.age} years</Value>
          <Value label="Patient ID">{patient.id}</Value>
          <Value label="Source patient ID">{patient.source_patient_id}</Value>
          <Value label="MRN">{patient.mrn}</Value>
          <Value label="Status">
            <StatusPill status={patient.status} />
          </Value>
        </DetailSection>
        <DetailSection title="Contact">
          <Value label="Phone">{patient.phone}</Value>
          <Value label="Email">{patient.email}</Value>
          <Value label="Address">{address}</Value>
        </DetailSection>
        <DetailSection title="Medical">
          <Value label="Blood type">{patient.blood_type || 'Unknown'}</Value>
          <Value label="Allergies">
            {patient.allergy_status === 'unknown'
              ? 'Unknown (not yet recorded)'
              : patient.allergy_status === 'no_known'
                ? 'No known allergies'
                : patient.allergies.join(', ')}
          </Value>
          <Value label="Conditions">
            {patient.conditions.length ? (
              <ul className="grid gap-1">
                {patient.conditions.map((condition, index) => (
                  <li key={`${condition.code}-${index}`}>
                    {condition.label}
                    {condition.code && (
                      <span className="ml-2 font-mono text-sm text-muted-foreground">
                        {condition.code}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              'None listed'
            )}
          </Value>
          <Value label="Last visit">
            {patient.last_visit ? formatDate(patient.last_visit) : 'No visit recorded'}
          </Value>
        </DetailSection>
        <DetailSection title="Record history">
          <Value label="Created">{formatDateTime(patient.created_at)}</Value>
          <Value label="Updated">{formatDateTime(patient.updated_at)}</Value>
          {patient.source_created_at && (
            <Value label="Source created">{formatDateTime(patient.source_created_at)}</Value>
          )}
          {patient.source_updated_at && (
            <Value label="Source updated">{formatDateTime(patient.source_updated_at)}</Value>
          )}
        </DetailSection>
      </div>
      {patient.profile_details && <SourceDetails details={patient.profile_details} />}
    </div>
  )
}
