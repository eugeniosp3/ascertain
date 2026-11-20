import { timestampMicros } from '../utils/dates'
import { ApiError } from './client'
import { validateId } from './validation'

interface DiscussionCursor {
  patient_id: string
  snapshot_at: string
  after_created_at: string
  after_id: string
  page: number
}

export function encodeDiscussionCursor(value: DiscussionCursor): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeDiscussionCursor(
  token: string,
  patientId: string,
  now: bigint,
): DiscussionCursor {
  try {
    if (typeof token !== 'string' || token.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(token))
      throw new Error()
    const value = JSON.parse(atob(token.replace(/-/g, '+').replace(/_/g, '/'))) as DiscussionCursor
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    const keys = ['patient_id', 'snapshot_at', 'after_created_at', 'after_id', 'page']
    if (
      Object.keys(value).length !== keys.length ||
      Object.keys(value).some((key) => !keys.includes(key))
    )
      throw new Error()
    validateId(value.patient_id)
    validateId(value.after_id)
    if (typeof value.snapshot_at !== 'string' || typeof value.after_created_at !== 'string')
      throw new Error()
    if (value.patient_id !== patientId || !Number.isSafeInteger(value.page) || value.page < 2)
      throw new Error()
    const cutoff = timestampMicros(value.snapshot_at)
    if (cutoff > now || timestampMicros(value.after_created_at) > cutoff) throw new Error()
    return value
  } catch {
    throw new ApiError(422, 'invalid_discussion_cursor', 'Invalid discussion cursor.')
  }
}
