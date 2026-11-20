import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NotificationBadge } from './NotificationBadge'
import { notificationLabel } from './notification-label'

describe('global unread badge', () => {
  it('hides zero and unavailable counts and retains a full accessible count above 99', () => {
    const { rerender, container } = render(<NotificationBadge count={0} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<NotificationBadge count={undefined} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<NotificationBadge count={123} />)
    expect(screen.getByText('99+')).toHaveAttribute('aria-hidden', 'true')
    expect(notificationLabel(123)).toBe('Notifications, 123 unread comments')
    expect(notificationLabel(0)).toBe('Notifications, no unread comments')
    expect(notificationLabel(undefined)).toContain('unavailable')
  })
})
