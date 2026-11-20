import type { ComponentProps } from 'react'
import { cn } from '@/utils/cn'

const statusStyles = {
  active: { label: 'Active', className: 'bg-status-active text-status-active-foreground' },
  inactive: { label: 'Inactive', className: 'bg-status-inactive text-status-inactive-foreground' },
} as const

type StatusPillProps = Omit<ComponentProps<'span'>, 'children'> & {
  status?: string | null
}

/** Patient status only; unknown API values stay visible in a neutral treatment. */
function StatusPill({ status, className, ...props }: StatusPillProps) {
  const known = status === 'active' || status === 'inactive' ? statusStyles[status] : undefined

  return (
    <span
      data-slot="status-pill"
      className={cn(
        'inline-flex h-[22px] w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap',
        known?.className ?? 'border bg-card text-muted-foreground',
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      {known?.label ?? (status?.trim() || 'Unknown')}
    </span>
  )
}

export { StatusPill, type StatusPillProps }
