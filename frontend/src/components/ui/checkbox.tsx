// Adapted from shadcn/ui new-york, generated with CLI 4.23.0 (Radix).
import * as React from 'react'
import { cn } from '@/utils/cn'
import { CheckIcon, MinusIcon } from 'lucide-react'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'group/checkbox peer inline-flex size-4 shrink-0 items-center justify-center rounded-sm disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <span
        data-slot="checkbox-control"
        aria-hidden="true"
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input bg-card text-primary-foreground transition-colors duration-150 group-aria-invalid/checkbox:border-destructive group-data-[state=checked]/checkbox:border-primary group-data-[state=checked]/checkbox:bg-primary group-data-[state=indeterminate]/checkbox:border-primary group-data-[state=indeterminate]/checkbox:bg-primary"
      >
        <CheckboxPrimitive.Indicator
          data-slot="checkbox-indicator"
          className="grid place-content-center text-current"
        >
          <CheckIcon className="size-3.5 group-data-[state=indeterminate]/checkbox:hidden" />
          <MinusIcon className="hidden size-3.5 group-data-[state=indeterminate]/checkbox:block" />
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
