// Adapted from shadcn/ui new-york, generated with CLI 4.23.0 (Radix).
import * as React from 'react'
import { cn } from '@/utils/cn'
import { Tooltip as TooltipPrimitive } from 'radix-ui'

function TooltipProvider({
  delayDuration = 250,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 6,
  // Keep the tooltip at least 8px inside the viewport; Radix shifts or flips it on collision.
  collisionPadding = 8,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        // A max width lets long hints wrap on phones instead of running off-screen as one line.
        className={cn(
          'z-50 w-fit max-w-[min(20rem,calc(100vw-2rem))] origin-(--radix-tooltip-content-transform-origin) animate-in duration-150 rounded-md bg-foreground px-3 py-1.5 text-[13px]/[18px] break-words text-balance text-primary-foreground fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
