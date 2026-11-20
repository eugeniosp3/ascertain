import { useEffect, useRef, useState } from 'react'

/**
 * Invalid-submit focus for small forms: when a submit fails client validation, move focus to the
 * first field marked aria-invalid once its error has rendered. Screen readers then read that
 * field's aria-describedby error, which is the single announcement (inline errors are not alerts).
 * Pass `onSubmitInvalid` to TanStack Form and `formRef` to the <form>.
 */
export function useInvalidSubmitFocus() {
  const formRef = useRef<HTMLFormElement>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (attempt > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [attempt])
  return { formRef, onSubmitInvalid: () => setAttempt((count) => count + 1) }
}
