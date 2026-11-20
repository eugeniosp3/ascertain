import { BackToPatients } from '@/app/AppShell'

export default function NotFoundPage() {
  return (
    <section className="ac-not-found">
      <span className="ac-eyebrow">404</span>
      <h1>Page not found</h1>
      <p>This address doesn’t point to a page in this workspace.</p>
      <BackToPatients />
    </section>
  )
}
