// Adapted from shadcn/ui new-york (Radix). Unlike a tooltip, a popover opens on click, tap and
// Enter, sets aria-expanded on its trigger, and closes on Escape or an outside click.
import * as React from 'react'
import { cn } from '@/utils/cn'
import { Popover as PopoverPrimitive } from 'radix-ui'

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  sideOffset = 6,
  // Keep the popover at least 8px inside the viewport; Radix shifts or flips it on collision.
  collisionPadding = 8,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        // Same bubble as the tooltip: long text wraps on phones instead of running off-screen.
        className={cn(
          'z-50 w-fit max-w-[min(20rem,calc(100vw-2rem))] origin-(--radix-popover-content-transform-origin) animate-in duration-150 rounded-md bg-foreground px-3 py-1.5 text-[13px]/[18px] break-words text-balance text-primary-foreground fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverContent }
