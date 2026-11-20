import type { ComponentPropsWithRef, ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import type { PatientListItem } from '@/api/types'
import { rememberPatient } from '@/app/view-state'
import type { ListSearch, ListView, PatientTab } from './search-params'
import type { PatientListGeometry } from './scroll-restoration'

export interface PatientLinkContext {
  actorId: string | null
  view: ListView
  search: ListSearch
  captureOrigin?: (action: HTMLAnchorElement) => PatientListGeometry | null
}

export function PatientOpenLink({
  patient,
  index,
  tab = 'overview',
  context,
  children,
  className,
  label,
  onClick,
  ...props
}: {
  patient: PatientListItem
  index: number
  tab?: PatientTab
  context: PatientLinkContext
  children: ReactNode
  label?: string
} & Omit<ComponentPropsWithRef<'a'>, 'href' | 'children'>) {
  return (
    <Link
      {...props}
      to="/patients/$patientId"
      params={{ patientId: patient.id }}
      search={{ ...context.search, tab, returnTo: context.view }}
      state={{ workspaceOrigin: context.view }}
      className={className}
      aria-label={label ?? props['aria-label']}
      data-open-tab={tab}
      onClick={(event) => {
        onClick?.(event)
        if (
          !event.defaultPrevented &&
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          rememberPatient(
            context.view,
            context.actorId,
            patient.id,
            index,
            tab,
            context.captureOrigin?.(event.currentTarget) ?? null,
          )
        }
      }}
    >
      {children}
    </Link>
  )
}
