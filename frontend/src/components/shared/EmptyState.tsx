import type { ReactNode } from 'react'

export interface EmptyStateProps {
  title: string
  description?: string
  children?: ReactNode
}

export function EmptyState({ title, description, children }: EmptyStateProps) {
  return (
    <div className="grid justify-items-start gap-2 rounded-xl border border-dashed bg-muted p-6">
      <h3 className="font-semibold">{title}</h3>
      {description && <p className="max-w-prose text-muted-foreground">{description}</p>}
      {children}
    </div>
  )
}
