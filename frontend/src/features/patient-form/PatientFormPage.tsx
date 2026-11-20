import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, isApiError } from '@/api'
import type { PatientDetail, PatientWrite } from '@/api/types'
import { patientKeys } from '@/app/query-keys'
import { patientDetailOptions } from '@/app/patient-query'
import { InlineError } from '@/components/shared/InlineError'
import { StatusNotice } from '@/components/shared/StatusNotice'
import { Button } from '@/components/ui/button'
import { getFormErrors } from '@/utils/form-errors'
import { PatientForm } from './PatientForm'
import './patient-form.css'

export interface PatientFormPageProps {
  patientId?: string
  actorId: string
  onCancel: () => void
  onSaved: (patient: PatientDetail) => void
}

/** Draft identity: changing patient or actor starts a new form session instead of sharing a draft. */
export default function PatientFormPage(props: PatientFormPageProps) {
  return <PatientFormSession key={`${props.patientId ?? 'new'}:${props.actorId}`} {...props} />
}

function PatientFormSession({ patientId, actorId, onCancel, onSaved }: PatientFormPageProps) {
  const client = useQueryClient()
  const mounted = useRef(false)
  // Async completion guard: a finished save must not navigate after this form has unmounted.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const patient = useQuery({
    ...patientDetailOptions(client, patientId ?? '', actorId),
    enabled: patientId !== undefined,
    retry: false,
  })
  // Patient mutation: create and edit share a write path; retries are disabled to avoid duplicate writes.
  const save = useMutation({
    mutationFn: ({ values, actorSnapshot }: { values: PatientWrite; actorSnapshot: string }) =>
      patientId === undefined
        ? api.createPatient(values, { actorId: actorSnapshot })
        : api.updatePatient(patientId, values, { actorId: actorSnapshot }),
    retry: false,
  })

  // Mutation and cache refresh: save first, then refresh lists, detail and any affected summary.
  async function savePatient(values: PatientWrite) {
    const actorSnapshot = actorId
    const saved = await save.mutateAsync({ values, actorSnapshot })
    // The write response is a snapshot; later refetches must be allowed to win.
    client.setQueryData(patientKeys.detail(saved.id, actorSnapshot), saved)
    await Promise.all([
      client.invalidateQueries({ queryKey: patientKeys.lists() }),
      client.invalidateQueries({ queryKey: patientKeys.detail(saved.id) }),
      ...(patientId === undefined
        ? []
        : [client.invalidateQueries({ queryKey: patientKeys.summary(saved.id) })]),
    ])
    if (mounted.current) {
      toast.success(patientId === undefined ? 'Patient added.' : 'Patient updated.')
      onSaved(saved)
    }
  }

  // A malformed ID is rejected with 422 before lookup and can never succeed, so it is missing too.
  const missing =
    patientId !== undefined &&
    isApiError(patient.error) &&
    (patient.error.status === 404 || patient.error.status === 422)
  return (
    <section className="patient-form-page" aria-labelledby="patient-form-title">
      <header className="patient-form-header">
        <div>
          <h1 id="patient-form-title">
            {patientId === undefined ? 'Add patient' : 'Edit patient'}
          </h1>
          <p className="patient-form-hint">
            {patientId === undefined
              ? 'Create a patient profile.'
              : 'Update this patient’s profile.'}
          </p>
          {!missing && patient.data && (
            <p className="patient-form-hint">
              {[
                patient.data.mrn && `MRN ${patient.data.mrn}`,
                patient.data.source_patient_id && `Source ID ${patient.data.source_patient_id}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
        <Button type="button" variant="ghost" disabled={save.isPending} onClick={onCancel}>
          Cancel
        </Button>
      </header>
      {missing ? (
        <div className="grid gap-4">
          <InlineError message="Patient not found. This record may have been removed." />
          <Button type="button" variant="outline" onClick={onCancel}>
            Back
          </Button>
        </div>
      ) : patientId !== undefined && !patient.data ? (
        patient.isPending ? (
          <p role="status">Loading patient…</p>
        ) : (
          <div className="grid gap-4">
            <InlineError
              message={getFormErrors(patient.error).message}
              retry={() => {
                void patient.refetch()
              }}
            />
            <Button type="button" variant="outline" onClick={onCancel}>
              Back
            </Button>
          </div>
        )
      ) : (
        <>
          {/* A failed background refresh is announced politely; the draft stays in place. */}
          <StatusNotice
            message={
              patient.isError
                ? 'The latest profile could not be loaded. Your draft is still here.'
                : null
            }
            retry={() => {
              void patient.refetch()
            }}
          />
          <PatientForm
            patient={patientId === undefined ? undefined : patient.data}
            onSave={savePatient}
            onCancel={onCancel}
          />
        </>
      )}
    </section>
  )
}
