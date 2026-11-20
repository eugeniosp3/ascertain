// Adapted from shadcn/ui new-york, generated with CLI 4.23.0 (Radix).
import { cn } from '@/utils/cn'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-accent', className)}
      {...props}
    />
  )
}

export { Skeleton }
