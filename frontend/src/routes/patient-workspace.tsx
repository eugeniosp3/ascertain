import { useLayoutEffect } from 'react'
import {
  useLocation,
  useNavigate,
  useParams,
  useRouter,
  useRouterState,
  useSearch,
} from '@tanstack/react-router'
import type { PatientDetail } from '@/api/types'
import { useActor } from '@/app/actor-context'
import { ActorRequired } from '@/app/ActorSelector'
import { resumePatientVisit } from '@/app/view-state'
import {
  validateListSearch,
  validateWorkspaceSearch,
  type PatientTab,
} from '@/features/patient-list/search-params'
import PatientWorkspace from '@/features/patient-detail/PatientWorkspace'
import PatientFormPage from '@/features/patient-form/PatientFormPage'

function DecorativeBackdrop() {
  return (
    <div className="ac-workspace-backdrop" aria-hidden="true">
      <div className="ac-backdrop-toolbar">
        <span />
        <span />
        <span />
      </div>
      <div className="ac-backdrop-table">
        {Array.from({ length: 12 }, (_, index) => (
          <div key={index}>
            <i />
            <span />
            <span />
            <span />
            <span />
          </div>
        ))}
      </div>
    </div>
  )
}

function useWorkspaceNavigation() {
  const router = useRouter()
  const navigate = useNavigate()
  const state = useLocation({ select: (location) => location.state })
  const search = validateWorkspaceSearch(useSearch({ strict: false }))
  const returnToList = () => {
    void navigate({
      to: search.returnTo === 'notifications' ? '/notifications' : '/patients',
      search: validateListSearch(search),
      replace: true,
    })
  }
  return {
    search,
    state,
    navigate,
    router,
    returnToList,
    close: () => {
      if (state.workspaceOrigin === search.returnTo && state.__TSR_index > 0) router.history.back()
      else returnToList()
    },
  }
}

function WorkspaceRoute() {
  const { actorId } = useActor()
  const params = useParams({ strict: false })
  const { search, navigate, close, returnToList, state } = useWorkspaceNavigation()
  const patientId = params.patientId ?? ''
  // A committed history visit re-arms return focus without remounting visit-local drafts.
  useLayoutEffect(() => {
    if (actorId && state.workspaceOrigin === search.returnTo) {
      resumePatientVisit(search.returnTo, actorId, patientId)
    }
  }, [actorId, patientId, search.returnTo, state.workspaceOrigin])
  // The patient parent stays mounted while its note child changes.
  const noteId = useRouterState({
    select: (routerState) => {
      const childParams = routerState.matches.at(-1)?.params
      return childParams && 'noteId' in childParams && typeof childParams.noteId === 'string'
        ? childParams.noteId
        : undefined
    },
  })
  const changeTab = (tab: PatientTab) => {
    void navigate({
      to: '/patients/$patientId',
      params: { patientId },
      search: { ...search, tab },
      state: true,
      replace: true,
    })
  }
  return (
    <>
      <DecorativeBackdrop />
      {actorId ? (
        <PatientWorkspace
          key={`${patientId}:${actorId}`}
          patientId={patientId}
          actorId={actorId}
          tab={noteId ? 'notes' : search.tab}
          noteId={noteId}
          onClose={close}
          onTabChange={changeTab}
          onNoteOpen={(noteId: string) => {
            void navigate({
              to: '/patients/$patientId/notes/$noteId',
              params: { patientId, noteId },
              search: { ...search, tab: 'notes' },
              state: true,
              replace: true,
            })
          }}
          onEdit={() => {
            void navigate({
              to: '/patients/$patientId/edit',
              params: { patientId },
              search,
              state: { workspaceOrigin: state.workspaceOrigin, workspaceEditFrom: true },
            })
          }}
          onDeleted={returnToList}
        />
      ) : (
        <ActorRequired />
      )}
    </>
  )
}

export function PatientDetailPage() {
  return <WorkspaceRoute />
}
function FormRoute({ edit = false }: { edit?: boolean }) {
  const { actorId } = useActor()
  const { patientId } = useParams({ strict: false })
  const { search, navigate, close, state, router } = useWorkspaceNavigation()
  const cancel = () => {
    if (edit && state.workspaceEditFrom && state.__TSR_index > 0) router.history.back()
    else if (edit && patientId) {
      void navigate({ to: '/patients/$patientId', params: { patientId }, search, replace: true })
    } else close()
  }
  return actorId ? (
    <PatientFormPage
      key={`${edit ? patientId : 'new'}:${actorId}`}
      patientId={edit ? patientId : undefined}
      actorId={actorId}
      onCancel={cancel}
      onSaved={(patient: PatientDetail) => {
        if (edit && state.workspaceEditFrom && state.__TSR_index > 0) router.history.back()
        else
          void navigate({
            to: '/patients/$patientId',
            params: { patientId: patient.id },
            search: { ...search, tab: 'overview' },
            state: { workspaceOrigin: state.workspaceOrigin },
            replace: true,
          })
      }}
    />
  ) : (
    <ActorRequired />
  )
}

export function PatientNewPage() {
  return <FormRoute />
}
export function PatientEditPage() {
  return <FormRoute edit />
}
