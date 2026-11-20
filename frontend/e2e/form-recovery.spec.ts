import { expect, test, type Locator } from '@playwright/test'
import { directory, expectNoPageOverflow } from './demo-helpers'

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme} patient form recovery`, () => {
    test.beforeEach(async ({ page }) => {
      // The private compiled DEMO build owns only an unsaved synthetic draft.
      await page.addInitScript((selectedTheme) => {
        localStorage.setItem(
          'ascertain:ui-preferences',
          JSON.stringify({ state: { theme: selectedTheme }, version: 1 }),
        )
      }, theme)
      await directory(page)
      await page.getByRole('link', { name: 'Add patient', exact: true }).click()
      await expect(page.locator('html')).toHaveClass(theme)
    })

    test('list actions validate only blurred fields and retain the first touch or click', async ({
      page,
    }) => {
      const form = page.getByRole('form', { name: 'Add patient', exact: true })
      const touch = (page.viewportSize()?.width ?? 1440) < 768
      const activate = async (control: Locator) => {
        if (touch) await control.tap()
        else await control.click()
      }
      const untouchedPersonal = async () => {
        for (const name of ['First name', 'Last name', 'Date of birth']) {
          await expect(form.getByLabel(new RegExp(`^${name}`))).toHaveAttribute(
            'aria-invalid',
            'false',
          )
        }
        await expect(form.getByText('Enter a first name.', { exact: true })).toHaveCount(0)
        await expect(form.getByText('Enter a last name.', { exact: true })).toHaveCount(0)
        await expect(form.getByText('Enter a valid date.', { exact: true })).toHaveCount(0)
      }

      await activate(form.getByRole('button', { name: 'Add condition', exact: true }))
      await expect(
        form.getByRole('textbox', { name: 'Condition 1 label', exact: true }),
      ).toHaveValue('')
      await untouchedPersonal()
      await expect(
        form.getByRole('textbox', { name: 'Condition 1 label', exact: true }),
      ).toHaveAttribute('aria-invalid', 'false')
      await form
        .getByRole('textbox', { name: 'Condition 1 label', exact: true })
        .fill('Draft condition')
      await form.getByRole('textbox', { name: 'Condition 1 code', exact: true }).fill('I10')

      await form.getByRole('radio', { name: 'Reported allergies', exact: true }).check()
      const add = form.getByRole('button', { name: 'Add allergy', exact: true })
      await activate(add)
      const first = form.getByRole('textbox', { name: 'Allergy 1', exact: true })
      await expect(first).toHaveValue('')
      await untouchedPersonal()
      await expect(
        form.getByText('Add at least one reported allergy.', { exact: true }),
      ).toHaveCount(0)
      await expect(first).toHaveAttribute('aria-invalid', 'false')
      await first.fill('Penicillin')
      await activate(add)
      await expect(form.getByRole('textbox', { name: /^Allergy \d+$/ })).toHaveCount(2)
      await expect(first).toHaveValue('Penicillin')
      const second = form.getByRole('textbox', { name: 'Allergy 2', exact: true })
      await second.focus()
      await second.press('Tab')
      await expect(second).toHaveAccessibleDescription('Enter an allergy.')
      await untouchedPersonal()
      await second.fill('Latex')
      await expect(second).toHaveAttribute('aria-invalid', 'false')
      await expect(
        form.getByRole('textbox', { name: 'Condition 1 code', exact: true }),
      ).toHaveValue('I10')
      await expectNoPageOverflow(page)
    })

    test('invalid submits focus visible actionable errors on every attempt and retain the draft', async ({
      page,
    }, testInfo) => {
      const form = page.getByRole('form', { name: 'Add patient', exact: true })
      const first = form.getByRole('textbox', { name: 'First name', exact: true })
      await first.focus()
      await first.press('Tab')
      await expect(first).toHaveAccessibleDescription('Enter a first name.')
      await form
        .getByRole('textbox', { name: 'Address line 2', exact: true })
        .fill('Unsaved draft unit 7')
      const submit = form.getByRole('button', { name: 'Add patient', exact: true })
      const summary = form
        .getByRole('alert')
        .filter({ hasText: /Check .*fields before saving\./ })
        .first()

      for (let attempt = 0; attempt < 2; attempt += 1) {
        await submit.click()
        await expect(summary).toBeFocused()
        await expect(summary).toBeInViewport({ ratio: 1 })
        await expect(
          summary.getByRole('button', { name: 'First name: Enter a first name.' }),
        ).toBeVisible()
        await expect(
          summary.getByRole('button', { name: 'Last name: Enter a last name.' }),
        ).toBeVisible()
        await expect(
          summary.getByRole('button', { name: 'Date of birth: Enter a valid date.' }),
        ).toBeVisible()
        await expect(
          form.getByRole('textbox', { name: 'Address line 2', exact: true }),
        ).toHaveValue('Unsaved draft unit 7')
      }
      await page.screenshot({ path: testInfo.outputPath(`${theme}-invalid-submit.png`) })
      await summary.getByRole('button', { name: 'First name: Enter a first name.' }).focus()
      await page.keyboard.press('Enter')
      await expect(first).toBeFocused()
      await expect(first).toBeInViewport({ ratio: 1 })
      await first.fill('Recovery')
      await form.getByRole('textbox', { name: 'Last name', exact: true }).fill('Draft')
      await form.getByLabel(/^Date of birth/).fill('1980-01-02')
      await expect(summary).toHaveCount(0)
      await expect(form.getByRole('textbox', { name: 'Address line 2', exact: true })).toHaveValue(
        'Unsaved draft unit 7',
      )
      await expect(page).toHaveURL(/\/patients\/new/)
      await expectNoPageOverflow(page)
    })

    test('reported-list errors refresh after adding, editing, removing and changing status', async ({
      page,
    }) => {
      const form = page.getByRole('form', { name: 'Add patient', exact: true })
      await form.getByRole('textbox', { name: 'First name', exact: true }).fill('Recovery')
      await form.getByRole('textbox', { name: 'Last name', exact: true }).fill('Draft')
      await form.getByLabel(/^Date of birth/).fill('1980-01-02')
      await form.getByRole('radio', { name: 'Reported allergies', exact: true }).check()
      await form.getByRole('button', { name: 'Add patient', exact: true }).click()
      const summary = form
        .getByRole('alert')
        .filter({ hasText: /Check .*fields before saving\./ })
        .first()
      await expect(summary).toBeFocused()
      await expect(summary).toBeInViewport({ ratio: 1 })
      await summary
        .getByRole('button', { name: 'Reported allergy list: Add at least one reported allergy.' })
        .click()
      const add = form.getByRole('button', { name: 'Add allergy', exact: true })
      await expect(add).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(
        form.getByText('Add at least one reported allergy.', { exact: true }),
      ).toHaveCount(0)
      const allergy = form.getByRole('textbox', { name: 'Allergy 1', exact: true })
      await expect(allergy).toHaveAccessibleDescription('Enter an allergy.')
      await allergy.fill('Latex')
      await expect(summary).toHaveCount(0)
      await form.getByRole('button', { name: 'Remove allergy 1', exact: true }).click()
      await expect(
        form.getByText('Add at least one reported allergy.', { exact: true }),
      ).toBeVisible()
      await form.getByRole('radio', { name: 'No known allergies', exact: true }).check()
      await expect(summary).toHaveCount(0)
      await expect(
        form.getByText('Add at least one reported allergy.', { exact: true }),
      ).toHaveCount(0)
      await expect(form.getByRole('textbox', { name: 'First name', exact: true })).toHaveValue(
        'Recovery',
      )
      await expect(page).toHaveURL(/\/patients\/new/)
    })
  })
}
