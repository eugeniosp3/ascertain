// Adapted from shadcn/ui new-york, generated with CLI 4.23.0 (Radix).
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { cn } from '@/utils/cn'

const Toaster = ({ className, style, ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className={cn('toaster group', className)}
      position="bottom-right"
      closeButton
      duration={6000}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--ac-ink)',
          '--normal-text': 'var(--ac-surface)',
          '--normal-border': 'var(--ac-ink)',
          '--border-radius': 'var(--ac-radius-surface)',
          ...style,
        } as CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
