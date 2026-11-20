import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { BackToPatients } from '@/app/AppShell'
import { Button } from '@/components/ui/button'

export default function RouteError({ reset }: ErrorComponentProps) {
  const router = useRouter()
  return (
    <section className="ac-empty" role="alert">
      <h1>This page couldn’t be opened</h1>
      <p>Please try again.</p>
      {/* A way out as well as a retry, so a persistent failure never strands the viewer. */}
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          onClick={() => {
            reset()
            void router.invalidate()
          }}
        >
          Retry
        </Button>
        <BackToPatients />
      </div>
    </section>
  )
}
