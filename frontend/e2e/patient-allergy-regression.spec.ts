import { expect, test, type Locator } from '@playwright/test'
import { directory } from './demo-helpers'

for (const width of [375, 390, 1440]) {
  test.describe(`${width}px patient list controls`, () => {
    const touch = width < 768
    test.use({ viewport: { width, height: touch ? 844 : 960 }, isMobile: touch, hasTouch: touch })

    async function activate(button: Locator) {
      if (touch) await button.tap()
      else await button.click()
    }

    test('first activation after typing adds exactly one allergy, retains values, renumbers and clears statuses', async ({
      page,
    }) => {
      // This context owns an unsaved synthetic draft; no clinical record is edited or submitted.
      await directory(page)
      await page.getByRole('link', { name: 'Add patient', exact: true }).click()
      const form = page.getByRole('form', { name: 'Add patient', exact: true })
      const rows = form.getByRole('textbox', { name: /^Allergy \d+$/ })
      const add = form.getByRole('button', { name: 'Add allergy', exact: true })
      const allergy = (index: number) =>
        form.getByRole('textbox', { name: `Allergy ${index}`, exact: true })

      await form.getByRole('radio', { name: 'Reported allergies', exact: true }).check()
      await activate(add)
      await allergy(1).fill('Penicillin')
      await activate(add)
      await expect(rows).toHaveCount(2)
      await expect(allergy(1)).toHaveValue('Penicillin')
      await expect(allergy(2)).toHaveValue('')

      await allergy(2).fill('Latex')
      await activate(add)
      await expect(rows).toHaveCount(3)
      await expect(allergy(1)).toHaveValue('Penicillin')
      await expect(allergy(2)).toHaveValue('Latex')
      await expect(allergy(3)).toHaveValue('')
      await allergy(3).fill('Pollen')
      await activate(form.getByRole('button', { name: 'Remove allergy 1', exact: true }))
      await expect(rows).toHaveCount(2)
      await expect(allergy(1)).toHaveValue('Latex')
      await expect(allergy(2)).toHaveValue('Pollen')
      await expect(form.getByRole('button', { name: 'Remove allergy 3', exact: true })).toHaveCount(
        0,
      )

      for (const status of ['Unknown', 'No known allergies']) {
        await form.getByRole('radio', { name: status, exact: true }).check()
        await expect(form.getByRole('radio', { name: status, exact: true })).toBeChecked()
        await expect(rows).toHaveCount(0)
        await expect(add).toHaveCount(0)
        await form.getByRole('radio', { name: 'Reported allergies', exact: true }).check()
        await expect(rows).toHaveCount(0)
        await activate(add)
        await expect(rows).toHaveCount(1)
        await expect(allergy(1)).toHaveValue('')
        await allergy(1).fill('Owned regression draft')
      }
      await expect(form.getByRole('textbox', { name: 'First name', exact: true })).toHaveValue('')
      await expect(page).toHaveURL(/\/patients\/new/)
    })

    test('list controls retain keyboard activation and blur validation while condition rows keep their codes', async ({
      page,
    }) => {
      await directory(page)
      await page.getByRole('link', { name: 'Add patient', exact: true }).click()
      const form = page.getByRole('form', { name: 'Add patient', exact: true })
      const addCondition = form.getByRole('button', { name: 'Add condition', exact: true })
      for (const [index, label, code] of [
        [1, 'First condition', 'I10'],
        [2, 'Second condition', 'E11'],
      ] as const) {
        await activate(addCondition)
        await form
          .getByRole('textbox', { name: `Condition ${index} label`, exact: true })
          .fill(label)
        await form.getByRole('textbox', { name: `Condition ${index} code`, exact: true }).fill(code)
      }
      await activate(form.getByRole('button', { name: 'Remove condition 1', exact: true }))
      await expect(
        form.getByRole('textbox', { name: 'Condition 1 label', exact: true }),
      ).toHaveValue('Second condition')
      await expect(
        form.getByRole('textbox', { name: 'Condition 1 code', exact: true }),
      ).toHaveValue('E11')
      await expect(
        form.getByRole('textbox', { name: 'Condition 2 label', exact: true }),
      ).toHaveCount(0)

      await form.getByRole('radio', { name: 'Reported allergies', exact: true }).check()
      const add = form.getByRole('button', { name: 'Add allergy', exact: true })
      await add.focus()
      await page.keyboard.press('Enter')
      const first = form.getByRole('textbox', { name: 'Allergy 1', exact: true })
      await first.fill('Penicillin')
      // Tab through Remove to Add: validation still runs on leaving the textbox.
      await first.press('Tab')
      await expect(
        form.getByRole('button', { name: 'Remove allergy 1', exact: true }),
      ).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(add).toBeFocused()
      await page.keyboard.press('Space')
      const second = form.getByRole('textbox', { name: 'Allergy 2', exact: true })
      await expect(second).toHaveValue('')
      await second.focus()
      await second.press('Tab')
      await expect(second).toHaveAttribute('aria-invalid', 'true')
      await expect(second).toHaveAccessibleDescription('Error: Enter an allergy.')
      await page.keyboard.press('Enter')
      await expect(second).toHaveCount(0)
      await expect(first).toHaveValue('Penicillin')
      await expect(page).toHaveURL(/\/patients\/new/)
    })
  })
}
