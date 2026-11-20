import { expect, test, type Page } from '@playwright/test'
import { choose, directory } from './demo-helpers'

async function newPatient(page: Page) {
  await directory(page)
  await page.getByRole('link', { name: 'Add patient', exact: true }).click()
  return page.getByRole('form', { name: 'Add patient', exact: true })
}

test('QA conditions: Add creates one empty label/code row without submitting', async ({ page }) => {
  const form = await newPatient(page)
  await expect(form.getByText('No conditions listed.', { exact: true })).toBeVisible()
  await form.getByRole('button', { name: 'Add condition', exact: true }).click()
  await expect(form.getByLabel('Condition 1 label', { exact: false })).toHaveValue('')
  await expect(form.getByLabel('Condition 1 code', { exact: true })).toHaveValue('')
  await expect(form.getByText('No conditions listed.', { exact: true })).toHaveCount(0)
  await expect(page).toHaveURL(/\/patients\/new/)
})

test('QA conditions: Remove first row retains the next row label and code', async ({ page }) => {
  const form = await newPatient(page)
  for (const [index, label, code] of [
    [1, 'First condition', 'I10'],
    [2, 'Second condition', 'E11'],
  ] as const) {
    await form.getByRole('button', { name: 'Add condition', exact: true }).click()
    await form.getByLabel(`Condition ${index} label`, { exact: false }).fill(label)
    await form.getByLabel(`Condition ${index} code`, { exact: true }).fill(code)
  }
  await form.getByRole('button', { name: 'Remove condition 1', exact: true }).click()
  await expect(form.getByLabel('Condition 1 label', { exact: false })).toHaveValue(
    'Second condition',
  )
  await expect(form.getByLabel('Condition 1 code', { exact: true })).toHaveValue('E11')
  await expect(form.getByLabel('Condition 2 label', { exact: false })).toHaveCount(0)
})

test('QA conditions: Remove last row restores the empty condition state', async ({ page }) => {
  const form = await newPatient(page)
  await form.getByRole('button', { name: 'Add condition', exact: true }).click()
  await form.getByRole('button', { name: 'Remove condition 1', exact: true }).click()
  await expect(form.getByText('No conditions listed.', { exact: true })).toBeVisible()
  await expect(form.getByLabel('Condition 1 label', { exact: false })).toHaveCount(0)
})

test('QA allergies: Reported reveals Add and Add creates one empty input', async ({ page }) => {
  const form = await newPatient(page)
  await expect(form.getByRole('radio', { name: 'Unknown', exact: true })).toBeChecked()
  await expect(form.getByRole('button', { name: 'Add allergy', exact: true })).toHaveCount(0)
  await form.getByRole('radio', { name: 'Reported allergies', exact: true }).check()
  await form.getByRole('button', { name: 'Add allergy', exact: true }).click()
  await expect(form.getByRole('textbox', { name: 'Allergy 1', exact: false })).toHaveValue('')
})

test('QA allergies: Remove first allergy preserves and renumbers the second', async ({ page }) => {
  const form = await newPatient(page)
  await form.getByRole('radio', { name: 'Reported allergies', exact: true }).check()
  // Arrange both rows before editing; the separate second-Add test covers blur/layout behavior.
  await form.getByRole('button', { name: 'Add allergy', exact: true }).click()
  await form.getByRole('button', { name: 'Add allergy', exact: true }).click()
  for (const [index, allergy] of [
    [1, 'Penicillin'],
    [2, 'Latex'],
  ] as const) {
    await form.getByRole('textbox', { name: `Allergy ${index}`, exact: false }).fill(allergy)
  }
  await form.getByRole('button', { name: 'Remove allergy 1', exact: true }).click()
  await expect(form.getByRole('textbox', { name: 'Allergy 1', exact: false })).toHaveValue('Latex')
  await expect(form.getByRole('textbox', { name: 'Allergy 2', exact: false })).toHaveCount(0)
})

test('QA allergies: Clicking Add after filling first allergy creates a second row on an incomplete form', async ({
  page,
}) => {
  const form = await newPatient(page)
  await form.getByRole('radio', { name: 'Reported allergies', exact: true }).check()
  await form.getByRole('button', { name: 'Add allergy', exact: true }).click()
  await form.getByRole('textbox', { name: 'Allergy 1', exact: false }).fill('Penicillin')
  await form.getByRole('button', { name: 'Add allergy', exact: true }).click()
  await expect(form.getByRole('textbox', { name: 'Allergy 2', exact: false })).toBeVisible()
  await expect(form.getByRole('textbox', { name: 'Allergy 1', exact: false })).toHaveValue(
    'Penicillin',
  )
})

test('QA allergies: Touching Add after filling first allergy creates a second row', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Touch-specific interaction; desktop pointer is tested separately.')
  const form = await newPatient(page)
  await form.getByRole('radio', { name: 'Reported allergies', exact: true }).check()
  await form.getByRole('button', { name: 'Add allergy', exact: true }).tap()
  await form.getByRole('textbox', { name: 'Allergy 1', exact: false }).fill('Penicillin')
  await form.getByRole('button', { name: 'Add allergy', exact: true }).tap()
  await expect(form.getByRole('textbox', { name: 'Allergy 2', exact: false })).toBeVisible()
})

for (const status of ['Unknown', 'No known allergies']) {
  test(`QA allergies: Choosing ${status} clears the reported list`, async ({ page }) => {
    const form = await newPatient(page)
    await form.getByRole('radio', { name: 'Reported allergies', exact: true }).check()
    await form.getByRole('button', { name: 'Add allergy', exact: true }).click()
    await form.getByRole('textbox', { name: 'Allergy 1', exact: false }).fill('Penicillin')
    await form.getByRole('radio', { name: status, exact: true }).check()
    await expect(form.getByRole('radio', { name: status, exact: true })).toBeChecked()
    await expect(form.getByRole('textbox', { name: 'Allergy 1', exact: false })).toHaveCount(0)
    await form.getByRole('radio', { name: 'Reported allergies', exact: true }).check()
    await expect(form.getByRole('textbox', { name: 'Allergy 1', exact: false })).toHaveCount(0)
    await form.getByRole('button', { name: 'Add allergy', exact: true }).click()
    await expect(form.getByRole('textbox', { name: 'Allergy 1', exact: false })).toHaveValue('')
  })
}

for (const bloodType of ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown']) {
  test(`QA blood type: Select ${bloodType} updates the displayed form value`, async ({ page }) => {
    const form = await newPatient(page)
    const control = form.getByRole('combobox', { name: 'Blood type', exact: true })
    // Start from a different value so Unknown also proves an actual transition.
    if (bloodType === 'Unknown') await choose(page, control, 'A+')
    await choose(page, control, bloodType)
    await expect(control).toHaveText(bloodType)
  })
}

for (const status of ['Inactive', 'Active']) {
  test(`QA patient status: Select ${status} updates the displayed form value`, async ({ page }) => {
    const form = await newPatient(page)
    const control = form.getByRole('combobox', { name: 'Patient status', exact: true })
    if (status === 'Active') await choose(page, control, 'Inactive')
    await choose(page, control, status)
    await expect(control).toHaveText(status)
  })
}

test('QA pagination: Previous disabled on first page, Next increments, Previous decrements', async ({
  page,
}) => {
  await directory(page)
  await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Next page', exact: true }).click()
  await expect(page.getByText('Page 2 of 5', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Previous page', exact: true }).click()
  await expect(page.getByText('Page 1 of 5', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled()
})

test('QA pagination: Next disabled on the last page', async ({ page }) => {
  await directory(page)
  await choose(page, page.getByRole('combobox', { name: 'Rows per page' }), '50')
  await page.getByRole('button', { name: 'Next page', exact: true }).click()
  await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeEnabled()
})

for (const size of [20, 50, 100]) {
  test(`QA pagination: Rows per page ${size} resets to page one and recalculates page count`, async ({
    page,
  }) => {
    await directory(page)
    await page.getByRole('button', { name: 'Next page', exact: true }).click()
    await expect(page.getByText('Page 2 of 5', { exact: true })).toBeVisible()
    // Selecting the current size is not a change; first change size for the 20 case.
    if (size === 20) {
      await choose(page, page.getByRole('combobox', { name: 'Rows per page' }), '50')
      await page.getByRole('button', { name: 'Next page', exact: true }).click()
    }
    await choose(page, page.getByRole('combobox', { name: 'Rows per page' }), String(size))
    await expect(page.getByText(`Page 1 of ${100 / size}`, { exact: true })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Rows per page' })).toHaveText(String(size))
    await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled()
    if (size === 100)
      await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled()
  })
}

test('QA form Cancel discards a draft and leaves the patient total unchanged', async ({ page }) => {
  const form = await newPatient(page)
  await form.getByLabel('First name', { exact: false }).fill('Unsaved')
  await form.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('100 patients')
  await page.getByRole('link', { name: 'Add patient', exact: true }).click()
  await expect(form.getByLabel('First name', { exact: false })).toHaveValue('')
})
