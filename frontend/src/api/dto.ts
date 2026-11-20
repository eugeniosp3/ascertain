import { ApiError } from './client'
import type { NotificationSummary, PatientDetail, PatientListItem } from './types'

export type PatientListItemDto = Omit<PatientListItem, 'middle_initial'> & {
  middle_initial?: string | null
}

export type PatientDetailDto = Omit<PatientDetail, 'profile_details'> & {
  profile_details: NonNullable<PatientDetail['profile_details']> | null
}

export interface NotificationSummaryDto {
  unread_comments: number
  patients_with_unread: number
}

export function patientListItemFromDto(value: PatientListItemDto): PatientListItem {
  return { ...value, middle_initial: value.middle_initial ?? null }
}

export function patientDetailFromDto(value: PatientDetailDto): PatientDetail {
  const { profile_details, ...detail } = value
  return { ...detail, ...(profile_details == null ? {} : { profile_details }) }
}

// The backend uses shorter names; only this boundary translates the wire summary.
export function notificationSummaryFromDto(value: unknown): NotificationSummary {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalidSummary()
  const dto = value as Record<string, unknown>
  const count = (key: string): number => {
    const result = dto[key]
    if (typeof result !== 'number' || !Number.isSafeInteger(result) || result < 0) invalidSummary()
    return result
  }
  return {
    unread_comments_count: count('unread_comments'),
    patients_with_unread_comments: count('patients_with_unread'),
  }
}

function invalidSummary(): never {
  throw new ApiError(200, 'invalid_response', 'The service returned an invalid response.')
}
