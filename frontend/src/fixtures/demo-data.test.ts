// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createDemoData, demoUsers } from './demo-data'

/** The backend demo-assignments-v1 rule: SHA-256(UTF-8 source ID), first 8 bytes big-endian mod 2. */
async function rosterIndex(sourcePatientId: string): Promise<number> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sourcePatientId)),
  )
  return digest[7]! & 1
}

describe('demo workload assignments', () => {
  it('reproduce the backend hash rule and roster order for every demo patient', async () => {
    const { patients } = createDemoData()
    const counts = [0, 0]
    for (const patient of patients) {
      const index = await rosterIndex(patient.source_patient_id!)
      expect(patient.assigned_user_id, patient.source_patient_id!).toBe(demoUsers[index]!.id)
      counts[index]! += 1
    }
    expect(counts).toEqual([52, 48])
  })
})
