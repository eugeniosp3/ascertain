import { useEffect, useRef, useState } from 'react'
import { dataMode, isApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CountPill } from '@/components/ui/count-pill'
import { Skeleton } from '@/components/ui/skeleton'
import { InlineError } from '@/components/shared/InlineError'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCount } from '@/utils/count'
import { getFormErrors } from '@/utils/form-errors'
import { PatientIdentity } from './PatientIdentity'
import { ProfilePanel } from './ProfilePanel'
import { NotesPanel } from './NotesPanel'
import { SummaryPanel } from './SummaryPanel'
import { DiscussionPanel } from './DiscussionPanel'
import { usePatientDetail } from './queries'
import './workspace.css'

export type PatientWorkspaceTab = 'overview' | 'notes' | 'summary' | 'discussion'

export interface PatientWorkspaceProps {
  patientId: string
  actorId: string
  tab: PatientWorkspaceTab
  noteId?: string
  onClose: () => void
  onTabChange: (tab: PatientWorkspaceTab) => void
  onNoteOpen: (noteId: string) => void
  onEdit: () => void
  onDeleted: () => void
}

// Workspace identity: reset visit-local drafts and read state when the patient or viewer changes.
export default function PatientWorkspace(props: PatientWorkspaceProps) {
  return <WorkspaceVisit key={`${props.patientId}:${props.actorId}`} {...props} />
}

function WorkspaceVisit({
  patientId,
  actorId,
  tab,
  noteId,
  onClose,
  onTabChange,
  onNoteOpen,
  onEdit,
  onDeleted,
}: PatientWorkspaceProps) {
  const patient = usePatientDetail(patientId, actorId)
  // Workspace focus: the dialog initially focuses the patient heading without scrolling the page.
  const heading = useRef<HTMLHeadingElement>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const live = useRef(true)
  const [compact, setCompact] = useState(false)
  const [scrollRoute, setScrollRoute] = useState(`${tab}:${noteId ?? ''}`)
  const route = `${tab}:${noteId ?? ''}`
  if (scrollRoute !== route) {
    setScrollRoute(route)
    setCompact(false)
  }
  // Async completion guard: ignore late note-navigation callbacks after leaving this workspace.
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])
  // Panel navigation: opening another tab or note starts its content at the top.
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0
  }, [tab, noteId])
  const openNote = (id: string) => {
    if (live.current) onNoteOpen(id)
  }
  const backToNotes = () => {
    if (live.current) onTabChange('notes')
  }
  // A malformed ID is rejected with 422 before lookup; like 404, retrying can never succeed.
  const missing = isApiError(patient.error) && [404, 422].includes(patient.error.status)
  const unavailable =
    isApiError(patient.error) && [401, 403, 404, 410, 422].includes(patient.error.status)
  // Workspace composition: clinical notes, summary and discussion remain separate feature panels.
  return (
    <>
      <div className="pw-decor" aria-hidden="true" inert>
        <div className="h-12 w-1/2 rounded-lg bg-selected" />
        <div className="mt-6 grid gap-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="flex items-center gap-6 border-b py-4">
              <div className="size-9 rounded-full bg-selected" />
              <div className="h-3 w-1/4 rounded bg-selected" />
              <div className="h-3 w-1/5 rounded bg-selected" />
              <div className="h-5 w-16 rounded bg-selected" />
            </div>
          ))}
        </div>
      </div>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
      >
        <DialogContent
          showCloseButton={false}
          // Override shadcn's centering utilities as well as CSS positioning in production builds.
          className="pw-dialog translate-x-0 translate-y-0"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            heading.current?.focus({ preventScroll: true })
          }}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DialogDescription className="sr-only">
            Patient workspace.{' '}
            {dataMode === 'demo' ? 'Explicit demo mode with fictional patient data.' : 'API mode.'}{' '}
            Use the tabs to view profile, clinical notes, summary and team discussion.
          </DialogDescription>
          <PatientIdentity
            patient={unavailable ? undefined : patient.data}
            compact={compact}
            headingRef={heading}
            onClose={onClose}
          />
          <div className="pw-body">
            {patient.isPending && (
              <div className="pw-scroll grid gap-4" role="status" aria-label="Loading patient">
                <span className="sr-only">Loading patient…</span>
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-44 w-full" />
                <Skeleton className="h-44 w-full" />
              </div>
            )}
            {missing && (
              <div className="pw-scroll">
                <EmptyState
                  title="Patient not found"
                  description="This patient may have been deleted, or the link is not a valid patient record."
                >
                  <Button variant="outline" onClick={onClose}>
                    Back to list
                  </Button>
                </EmptyState>
              </div>
            )}
            {patient.isError && !missing && (!patient.data || unavailable) && (
              <div className="pw-scroll">
                <InlineError
                  message={getFormErrors(patient.error).message}
                  retry={() => {
                    void patient.refetch()
                  }}
                />
              </div>
            )}
            {patient.data && !unavailable && (
              <Tabs
                value={tab}
                onValueChange={(value) => onTabChange(value as PatientWorkspaceTab)}
                // Opening Discussion marks comments read, so arrow keys only move focus;
                // Enter or Space chooses the tab (manual activation).
                activationMode="manual"
                className="pw-tabs"
              >
                {patient.isError && (
                  <InlineError
                    message="The latest patient details could not be refreshed. Your draft is still here."
                    retry={() => {
                      void patient.refetch()
                    }}
                  />
                )}
                <TabsList className="pw-tab-list" aria-label="Patient record sections">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="notes">
                    Notes{' '}
                    <CountPill
                      count={patient.data.notes_count}
                      singularLabel="clinical note"
                      label="clinical notes"
                    />
                  </TabsTrigger>
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="discussion">
                    Discussion{' '}
                    <CountPill
                      count={patient.data.comments_count}
                      singularLabel="comment"
                      label="comments"
                    />
                    {patient.data.unread_comments_count > 0 && (
                      <>
                        <span className="pw-new" aria-hidden="true">
                          New
                        </span>
                        <span className="sr-only">
                          {formatCount(patient.data.unread_comments_count, 'unread comment')}
                        </span>
                      </>
                    )}
                  </TabsTrigger>
                </TabsList>
                <div
                  ref={scroll}
                  className="pw-scroll"
                  onScroll={(event) => {
                    const element = event.currentTarget
                    if (
                      !compact &&
                      element.scrollTop > 56 &&
                      element.scrollHeight - element.clientHeight > 160
                    )
                      setCompact(true)
                    else if (compact && element.scrollTop < 8) setCompact(false)
                  }}
                >
                  <TabsContent value="overview">
                    <ProfilePanel
                      patient={patient.data}
                      actorId={actorId}
                      onEdit={onEdit}
                      onDeleted={() => {
                        if (live.current) onDeleted()
                      }}
                    />
                  </TabsContent>
                  <TabsContent value="notes" forceMount hidden={tab !== 'notes'}>
                    <NotesPanel
                      patientId={patientId}
                      actorId={actorId}
                      active={tab === 'notes'}
                      noteId={noteId}
                      onNoteOpen={openNote}
                      onBack={backToNotes}
                    />
                  </TabsContent>
                  <TabsContent value="summary">
                    {tab === 'summary' && <SummaryPanel patientId={patientId} actorId={actorId} />}
                  </TabsContent>
                  <TabsContent value="discussion" forceMount hidden={tab !== 'discussion'}>
                    <DiscussionPanel
                      patientId={patientId}
                      actorId={actorId}
                      active={tab === 'discussion'}
                      onNoteOpen={openNote}
                    />
                  </TabsContent>
                </div>
              </Tabs>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
