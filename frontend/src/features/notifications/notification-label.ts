import { formatCount } from '@/utils/count'

export function notificationLabel(count: number | undefined): string {
  if (count === undefined) return 'Notifications, unread count unavailable'
  return count === 0
    ? 'Notifications, no unread comments'
    : `Notifications, ${formatCount(count, 'unread comment')}`
}
