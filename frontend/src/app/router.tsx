import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  type RouterHistory,
} from '@tanstack/react-router'
import AppShell from './AppShell'
import NotFoundPage from '@/routes/not-found'
import RouteError from '@/routes/route-error'
import { validateListSearch, validateWorkspaceSearch } from '@/features/patient-list/search-params'

// Lazy loading: load page modules when their routes need them, reducing the initial bundle.
const HomePage = lazyRouteComponent(() => import('@/routes/home'))
const PatientsListPage = lazyRouteComponent(() => import('@/routes/patients-list'))
const NotificationsPage = lazyRouteComponent(() => import('@/routes/notifications'))
const PatientDetailPage = lazyRouteComponent(
  () => import('@/routes/patient-workspace'),
  'PatientDetailPage',
)
const PatientNewPage = lazyRouteComponent(
  () => import('@/routes/patient-workspace'),
  'PatientNewPage',
)
const PatientEditPage = lazyRouteComponent(
  () => import('@/routes/patient-workspace'),
  'PatientEditPage',
)

// Shared route shell: every page inherits navigation, loading, error and not-found handling.
const rootRoute = createRootRoute({
  component: AppShell,
  notFoundComponent: NotFoundPage,
  errorComponent: RouteError,
  pendingComponent: () => (
    <p role="status" className="ac-overview-note">
      Loading workspace…
    </p>
  ),
})
const home = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage })
// URL validation: normalize list filters and pagination before the screen consumes them.
const patients = createRoute({
  getParentRoute: () => rootRoute,
  path: '/patients',
  validateSearch: validateListSearch,
  component: PatientsListPage,
})
const notifications = createRoute({
  getParentRoute: () => rootRoute,
  path: '/notifications',
  validateSearch: validateListSearch,
  component: NotificationsPage,
})
const patientNew = createRoute({
  getParentRoute: () => rootRoute,
  path: '/patients/new',
  validateSearch: validateWorkspaceSearch,
  component: PatientNewPage,
})
const patientDetail = createRoute({
  getParentRoute: () => rootRoute,
  path: '/patients/$patientId',
  validateSearch: validateWorkspaceSearch,
  component: PatientDetailPage,
})
const patientEdit = createRoute({
  getParentRoute: () => rootRoute,
  path: '/patients/$patientId/edit',
  validateSearch: validateWorkspaceSearch,
  component: PatientEditPage,
})
const noteDetail = createRoute({
  getParentRoute: () => patientDetail,
  path: 'notes/$noteId',
  validateSearch: validateWorkspaceSearch,
  component: () => null,
})
const notFound = createRoute({
  getParentRoute: () => rootRoute,
  path: '$',
  component: NotFoundPage,
})
const routeTree = rootRoute.addChildren([
  home,
  patients,
  notifications,
  patientNew,
  patientDetail.addChildren([noteDetail]),
  patientEdit,
  notFound,
])

export function createAppRouter(history?: RouterHistory) {
  // Route preloading: link intent can start loading early; feature code restores list scroll.
  return createRouter({
    routeTree,
    history,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 30_000,
    scrollRestoration: false,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}

declare module '@tanstack/history' {
  interface HistoryState {
    workspaceOrigin?: 'patients' | 'notifications'
    workspaceEditFrom?: boolean
  }
}
