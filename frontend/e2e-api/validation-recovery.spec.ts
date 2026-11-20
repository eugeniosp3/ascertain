import { emptyWrite, expect, selectActor, test } from './contract-fixture'

// These deliberately injected 422s verify the browser's error-recovery contract,
// not whether these valid drafts would be rejected by a running backend.
const failures = [
  {
    code: 'allergies_required',
    message: 'Add at least one allergy when allergy status is reported.',
    reported: true,
  },
  {
    code: 'allergies_not_reported',
    message: 'Clear the allergy list or choose the reported allergy status.',
    reported: false,
  },
] as const

for (const width of [390, 1440]) {
  test.describe(`backend allergy error recovery at ${width}px`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 960 } })

    for (const failure of failures) {
      test(`${failure.code} remains visible, focused and actionable`, async ({
        page,
        contract,
      }) => {
        contract.handler = (call) =>
          call.method === 'POST' && call.path === '/patients'
            ? {
                status: 422,
                json: {
                  error: {
                    code: 'validation_error',
                    message: 'Request validation failed.',
                    fields: [
                      { path: ['body', 'allergies'], code: failure.code, message: failure.message },
                    ],
                  },
                },
              }
            : undefined

        await page.goto('/patients/new')
        await selectActor(page, contract)
        const form = page.getByRole('form', { name: 'Add patient', exact: true })
        await form.getByLabel('First name', { exact: false }).fill('HTTP')
        await form.getByLabel('Last name', { exact: false }).fill('Recovery')
        await form.getByLabel('Date of birth', { exact: false }).fill(emptyWrite.date_of_birth)
        if (failure.reported) {
          await form.getByRole('radio', { name: 'Reported allergies' }).check()
          await form.getByRole('button', { name: 'Add allergy', exact: true }).click()
          await form
            .getByRole('textbox', { name: 'Allergy 1', exact: true })
            .fill('Example allergen')
        }
        await form.getByRole('button', { name: 'Add patient', exact: true }).click()

        const summary = form.getByRole('alert', { name: 'Request validation failed.' })
        await expect(summary).toBeFocused()
        await expect(summary).toContainText(failure.message)
        const rect = await summary.boundingBox()
        expect(rect).not.toBeNull()
        expect(rect!.y).toBeGreaterThanOrEqual(0)
        expect(rect!.y + rect!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
        expect(contract.matching('POST', '/patients')).toHaveLength(1)
        await expect(form.getByLabel('First name', { exact: false })).toHaveValue('HTTP')
        await expect(form.getByLabel('Last name', { exact: false })).toHaveValue('Recovery')
        await summary
          .getByRole('button', { name: `Reported allergy list: ${failure.message}`, exact: true })
          .click()
        const target = failure.reported
          ? form.getByRole('button', { name: 'Add allergy', exact: true })
          : form.getByRole('radio', { name: 'Unknown', exact: true })
        await expect(target).toBeFocused()
        await expect(target).toBeInViewport()
      })
    }
  })
}
