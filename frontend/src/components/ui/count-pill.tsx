import type { ComponentProps } from 'react'
import { cn } from '@/utils/cn'

type CountPillProps = Omit<ComponentProps<'span'>, 'children'> & {
  count: number
  variant?: 'default' | 'unread'
  max?: number
  label?: string
}

/** A visual cap never truncates the count exposed to assistive technology. */
function CountPill({
  count,
  variant = 'default',
  max = 99,
  label,
  className,
  ...props
}: CountPillProps) {
  return (
    <span
      data-slot="count-pill"
      data-variant={variant}
      className={cn(
        'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs leading-none font-semibold whitespace-nowrap tabular-nums',
        variant === 'unread' ? 'bg-lilac-ink text-white' : 'bg-selected text-muted-foreground',
        className,
      )}
      {...props}
    >
      <span aria-hidden="true">{count > max ? `${max}+` : count}</span>
      <span className="sr-only">
        {count}
        {label ? ` ${label}` : variant === 'unread' ? ' unread comments' : ''}
      </span>
    </span>
  )
}

export { CountPill, type CountPillProps }
