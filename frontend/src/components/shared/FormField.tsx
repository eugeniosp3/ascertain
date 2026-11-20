import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'

export interface FormFieldProps {
  label: string
  htmlFor: string
  error?: string
  description?: string
  required?: boolean
  children: ReactNode
}

/** Associate inputs with `${htmlFor}-description` and `${htmlFor}-error` as needed. */
export function FormField({
  label,
  htmlFor,
  error,
  description,
  required,
  children,
}: FormFieldProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </Label>
      {description && (
        <p id={`${htmlFor}-description`} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {children}
      {error && (
        <p id={`${htmlFor}-error`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
