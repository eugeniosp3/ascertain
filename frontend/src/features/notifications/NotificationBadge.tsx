export function NotificationBadge({ count }: { count: number | undefined }) {
  if (count === undefined || count <= 0) return null
  return (
    <span className="ac-nav-count" aria-hidden="true">
      {count > 99 ? '99+' : count}
    </span>
  )
}
