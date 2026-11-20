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
        <p id={`${htmlFor}-description`} className="text-sm max-md:text-base text-muted-foreground">
          {description}
        </p>
      )}
      {children}
      {error && <FieldError id={`${htmlFor}-error`} message={error} />}
    </div>
  )
}

/**
 * Inline field error: plain text that the control references through aria-describedby and
 * aria-invalid. It is deliberately not an alert; on submit the focused error summary is the
 * single announcement. The hidden prefix tells screen-reader users this description is an error.
 */
export function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} className="text-sm max-md:text-base text-destructive">
      {/* The space sits outside the hidden span so every name computation reads "Error: …". */}
      <span className="sr-only">Error:</span> {message}
    </p>
  )
}
