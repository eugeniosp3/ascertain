import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export default function RouteError({ reset }: ErrorComponentProps) {
  const router = useRouter()
  return (
    <section className="ac-empty" role="alert">
      <h1>This page couldn’t be opened</h1>
      <p>Please try again.</p>
      <Button
        onClick={() => {
          reset()
          void router.invalidate()
        }}
      >
        Retry
      </Button>
    </section>
  )
}
