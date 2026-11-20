import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'

export interface StatusNoticeProps {
  /** The notice text, or null when there is nothing to report. */
  message: string | null
  retry?: () => void
}

/**
 * Polite notice for failures of automatic work (background refresh, mark-as-read). Render it
 * unconditionally: the live region stays mounted and only its text changes, so screen readers
 * announce it. Retry sits beside the region, not inside it, and nothing interrupts the user.
 * It is a plain aria-live region rather than role="status", so each page keeps one unambiguous
 * status element (the list's result count). Find it in tests by its text.
 */
export function StatusNotice({ message, retry }: StatusNoticeProps) {
  return (
    <div
      className={cn(
        message
          ? 'flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted px-3 py-2 text-sm'
          : 'contents',
      )}
    >
      <p
        aria-live="polite"
        aria-atomic="true"
        className={message ? 'min-w-0 break-words' : 'sr-only'}
      >
        {message}
      </p>
      {message && retry && (
        <Button type="button" variant="outline" size="sm" onClick={retry}>
          Retry
        </Button>
      )}
    </div>
  )
}
