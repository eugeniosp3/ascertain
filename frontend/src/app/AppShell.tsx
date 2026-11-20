import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation } from '@tanstack/react-router'
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
} from 'lucide-react'
import { dataMode } from '@/api'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useMediaQuery } from '@/hooks/use-media-query'
import { NotificationBadge } from '@/features/notifications/NotificationBadge'
import { notificationLabel } from '@/features/notifications/notification-label'
import { useNotificationSummary } from '@/features/notifications/queries'
import { defaultListSearch } from '@/features/patient-list/search-params'
import { useActor } from './actor-context'
import { ActorSelector } from './ActorSelector'
import { resetListView, useSavedListSearch } from './view-state'
import { useUIStore } from './ui-store'

function Brand() {
  return (
    <span className="ac-brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  )
}

function RailTooltip({
  label,
  enabled,
  children,
}: {
  label: string
  enabled: boolean
  children: ReactNode
}) {
  return enabled ? (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  ) : (
    children
  )
}

export default function AppShell() {
  const { actorId } = useActor()
  const savedPatientSearch = useSavedListSearch('patients', actorId)
  const summary = useNotificationSummary(actorId)
  const count = summary.data?.unread_comments_count
  const path = useLocation({ select: (location) => location.pathname })
  const search = useLocation({ select: (location) => location.search })
  const isMobile = useMediaQuery('(max-width: 767px)')
  const expanded = useUIStore((state) => state.sidebarExpanded)
  const setExpanded = useUIStore((state) => state.setSidebarExpanded)
  const [menuOpen, setMenuOpen] = useState(false)
  const section =
    path === '/'
      ? 'Overview'
      : path.startsWith('/notifications') ||
          ('returnTo' in search && search.returnTo === 'notifications')
        ? 'Notifications'
        : 'Patients'
  const title =
    path === '/patients/new' ? 'Add patient' : path.endsWith('/edit') ? 'Edit patient' : section

  useLayoutEffect(() => {
    document.documentElement.style.setProperty(
      '--sidebar-width',
      isMobile ? '0px' : expanded ? '232px' : '64px',
    )
  }, [isMobile, expanded])
  useEffect(() => {
    document.title = `${title} · Ascertain`
  }, [title])

  const navigation = (mobile: boolean) => (
    <nav aria-label="Primary navigation" className="ac-primary-nav">
      <RailTooltip enabled={!mobile && !expanded} label="Overview">
        <Link
          to="/"
          className="ac-nav-item"
          aria-label="Overview"
          aria-current={section === 'Overview' ? 'page' : undefined}
          onClick={() => setMenuOpen(false)}
        >
          <LayoutDashboard aria-hidden="true" />
          <span className="ac-nav-label">Overview</span>
        </Link>
      </RailTooltip>
      <RailTooltip enabled={!mobile && !expanded} label="Patients">
        <Link
          to="/patients"
          search={savedPatientSearch}
          className="ac-nav-item"
          aria-label="Patients"
          aria-current={section === 'Patients' ? 'page' : undefined}
          onClick={() => setMenuOpen(false)}
        >
          <Users aria-hidden="true" />
          <span className="ac-nav-label">Patients</span>
        </Link>
      </RailTooltip>
      <RailTooltip enabled={!mobile && !expanded} label={notificationLabel(count)}>
        <Link
          to="/notifications"
          search={defaultListSearch}
          className="ac-nav-item"
          aria-label={notificationLabel(count)}
          aria-current={section === 'Notifications' ? 'page' : undefined}
          onClick={() => {
            resetListView('notifications', actorId)
            setMenuOpen(false)
          }}
        >
          <Bell aria-hidden="true" />
          <span className="ac-nav-label">Notifications</span>
          <NotificationBadge count={count} />
        </Link>
      </RailTooltip>
    </nav>
  )

  return (
    <div className="ac-app" data-sidebar={expanded ? 'expanded' : 'collapsed'}>
      <a className="ac-skip-link" href="#main-content">
        Skip to main content
      </a>
      {!isMobile && (
        <aside className="ac-sidebar" aria-label="Workspace sidebar">
          <Link to="/" className="ac-brand" aria-label="Ascertain home">
            <Brand />
            <span className="ac-nav-label">Ascertain</span>
          </Link>
          {navigation(false)}
          <div className="ac-sidebar-foot">
            <RailTooltip enabled={!expanded} label="Expand sidebar">
              <Button
                variant="ghost"
                className="ac-sidebar-toggle"
                aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <PanelLeftClose aria-hidden="true" />
                ) : (
                  <PanelLeftOpen aria-hidden="true" />
                )}
                <span className="ac-nav-label">Collapse sidebar</span>
              </Button>
            </RailTooltip>
          </div>
        </aside>
      )}
      <div className="ac-main-column">
        <header className="ac-topbar">
          {isMobile ? (
            <>
              <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Open navigation">
                    <Menu aria-hidden="true" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="ac-mobile-menu">
                  <SheetHeader>
                    <SheetTitle>Ascertain</SheetTitle>
                    <SheetDescription>Patient workspace</SheetDescription>
                  </SheetHeader>
                  {navigation(true)}
                </SheetContent>
              </Sheet>
              <span className="ac-mobile-brand">
                <Brand />
                Ascertain
              </span>
              <Link
                to="/notifications"
                search={defaultListSearch}
                className="ac-mobile-bell"
                aria-label={notificationLabel(count)}
                onClick={() => resetListView('notifications', actorId)}
              >
                <Bell aria-hidden="true" />
                <NotificationBadge count={count} />
              </Link>
            </>
          ) : (
            <nav className="ac-breadcrumbs" aria-label="Breadcrumb">
              <ol>
                <li>Workspace</li>
                <li>
                  <ChevronRight aria-hidden="true" />
                  <span aria-current="page">{title}</span>
                </li>
              </ol>
            </nav>
          )}
          <div className="ac-header-actions">
            <ActorSelector />
          </div>
        </header>
        {dataMode === 'demo' && (
          <div className="ac-demo-banner">
            <span className="ac-demo-dot" aria-hidden="true" />
            Demo workspace <span>· Synthetic patient records. Changes reset on reload.</span>
          </div>
        )}
        <main id="main-content" tabIndex={-1} className="ac-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export function BackToPatients() {
  const { actorId } = useActor()
  const search = useSavedListSearch('patients', actorId)
  return (
    <Button asChild variant="outline">
      <Link to="/patients" search={search}>
        <ChevronLeft aria-hidden="true" />
        All patients
      </Link>
    </Button>
  )
}
