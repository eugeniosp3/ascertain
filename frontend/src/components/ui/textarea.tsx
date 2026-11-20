// Adapted from shadcn/ui new-york, generated with CLI 4.23.0 (Radix).
import * as React from 'react'
import { cn } from '@/utils/cn'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-28 w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-base text-foreground transition-colors duration-150 placeholder:text-muted-foreground hover:border-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-disabled read-only:bg-muted aria-invalid:border-destructive md:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
