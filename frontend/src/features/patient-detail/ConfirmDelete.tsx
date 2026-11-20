import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { InlineError } from '@/components/shared/InlineError'
import { getFormErrors } from '@/utils/form-errors'

interface Props {
  label: string
  description: string
  pending: boolean
  error: unknown
  onConfirm: () => Promise<unknown>
  children?: ReactNode
}

export function ConfirmDelete({ label, description, pending, error, onConfirm, children }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) setOpen(next)
      }}
    >
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive-outline">
          {children ?? label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{label}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error != null && <InlineError message={getFormErrors(error).message} />}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              try {
                await onConfirm()
                setOpen(false)
              } catch {
                /* The mutation error stays in the dialog. */
              }
            }}
          >
            {pending ? 'Deleting…' : label}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
