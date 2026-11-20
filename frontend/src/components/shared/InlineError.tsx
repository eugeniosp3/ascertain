import { Button } from '@/components/ui/button'

export interface InlineErrorProps {
  message: string
  retry?: () => void
}

export function InlineError({ message, retry }: InlineErrorProps) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-danger-soft p-3 text-destructive"
    >
      <p className="min-w-0 break-words">{message}</p>
      {retry && (
        <Button type="button" variant="outline" onClick={retry}>
          Retry
        </Button>
      )}
    </div>
  )
}
