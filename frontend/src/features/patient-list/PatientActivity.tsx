import { FileText, MessageSquare } from 'lucide-react'
import type { PatientListItem } from '@/api/types'
import { Button } from '@/components/ui/button'
import { getPatientName } from '@/utils/patient'
import { PatientOpenLink, type PatientLinkContext } from './PatientOpenLink'
import { displayCount } from './count'

export function PatientActivity({
  patient,
  index,
  context,
  kind,
}: {
  patient: PatientListItem
  index: number
  context: PatientLinkContext
  kind: 'notes' | 'discussion'
}) {
  const notes = kind === 'notes'
  const count = notes ? patient.notes_count : patient.comments_count
  const unread = patient.unread_comments_count
  const known = typeof count === 'number' && Number.isFinite(count)
  const label = `${getPatientName(patient)}, ${known ? `${count} ${notes ? 'clinical notes' : 'comments'}` : `${notes ? 'note' : 'comment'} count unavailable`}${!notes ? `, ${typeof unread === 'number' ? `${unread} unread comments` : 'unread count unavailable'}` : ''}, open ${notes ? 'Notes' : 'Discussion'}`
  return (
    <Button
      variant="outline"
      size="sm"
      className={`ac-activity-button${!notes && unread > 0 ? ' ac-has-unread' : ''}`}
      asChild
    >
      <PatientOpenLink patient={patient} index={index} context={context} tab={kind} label={label}>
        {notes ? <FileText aria-hidden="true" /> : <MessageSquare aria-hidden="true" />}
        <span>{displayCount(count)}</span>
        {!notes && unread > 0 && (
          <span className="ac-new-pill" aria-hidden="true">
            New
          </span>
        )}
      </PatientOpenLink>
    </Button>
  )
}
