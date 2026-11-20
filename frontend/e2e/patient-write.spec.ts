import { expect, test } from '@playwright/test'
import { choose, closeWorkspace, confirmDeletion, directory, searchPatient } from './demo-helpers'

test('create the 101st patient, preserve an invalid draft, edit the full profile and confirm deletion', async ({
  page,
}) => {
  await directory(page)
  await page.getByRole('link', { name: 'Add patient', exact: true }).click()
  const create = page.getByRole('form', { name: 'Add patient', exact: true })

  await test.step('Client validation preserves the completed draft', async () => {
    await create.getByLabel('First name', { exact: false }).fill('Zelda')
    await create.getByLabel('Last name', { exact: false }).fill('Journey')
    await create.getByLabel('Middle initial', { exact: true }).fill('Q')
    await create.getByLabel('Date of birth', { exact: false }).fill('1987-05-09')
    await create.getByLabel('Email', { exact: true }).fill('invalid-email')
    await create.getByLabel('Postal code', { exact: true }).fill('00123')
    await create.getByRole('button', { name: 'Add condition', exact: true }).click()
    await create
      .getByLabel('Condition 1 label', { exact: false })
      .fill('Clinical journey condition')
    await create.getByLabel('Condition 1 code', { exact: true }).fill('I10')
    await create.getByRole('button', { name: 'Add condition', exact: true }).click()
    await create
      .getByLabel('Condition 2 label', { exact: false })
      .fill('Uncoded clinical observation')
    await create.getByRole('button', { name: 'Add patient', exact: true }).click()
    await expect(create.getByText('Enter a valid email address.', { exact: true })).toBeVisible()
    await expect(create.getByLabel('First name', { exact: false })).toHaveValue('Zelda')
    await expect(create.getByLabel('Condition 1 code', { exact: true })).toHaveValue('I10')
    await expect(create.getByLabel('Postal code', { exact: true })).toHaveValue('00123')
    await create.getByLabel('Email', { exact: true }).fill('zelda.journey@example.com')
    await create.getByRole('button', { name: 'Add patient', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Zelda Q Journey', exact: true })).toBeVisible()
    await expect(
      page.getByRole('listitem').filter({ hasText: 'Clinical journey condition' }),
    ).toBeVisible()
    await expect(page.getByText('I10', { exact: true })).toBeVisible()
  })

  await test.step('Find the 101st record and round-trip nullable fields and condition codes', async () => {
    await closeWorkspace(page)
    await expect(page.getByRole('status').filter({ hasText: /^101 patients$/ })).toBeVisible()
    await searchPatient(page, 'zelda.journey@example.com')
    await page.getByRole('link', { name: 'Zelda Q Journey', exact: true }).click()
    await page.getByRole('button', { name: 'Edit patient', exact: true }).click()
    const edit = page.getByRole('form', { name: 'Edit patient', exact: true })
    await expect(edit.getByLabel('Condition 1 code', { exact: true })).toHaveValue('I10')
    await expect(edit.getByLabel('Condition 2 code', { exact: true })).toHaveValue('')
    for (const nullable of [
      'Phone',
      'Address line 1',
      'Address line 2',
      'City',
      'State / region',
      'Last visit',
    ]) {
      await expect(edit.getByLabel(nullable, { exact: true })).toHaveValue('')
    }
    await expect(edit.getByRole('combobox', { name: 'Blood type', exact: true })).toHaveText(
      'Unknown',
    )
    await expect(edit.getByRole('radio', { name: 'Unknown', exact: true })).toBeChecked()
    await edit.getByLabel('Last name', { exact: false }).fill('Updated')
    await edit.getByLabel('Condition 1 label', { exact: false }).fill('Updated condition label')
    await choose(
      page,
      edit.getByRole('combobox', { name: 'Patient status', exact: true }),
      'Inactive',
    )
    await edit.getByLabel('Last visit', { exact: true }).fill('2026-11-18')
    await edit.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Zelda Q Updated', exact: true })).toBeVisible()
    await expect(
      page.getByRole('listitem').filter({ hasText: 'Updated condition label' }),
    ).toBeVisible()
    await expect(page.getByText('I10', { exact: true })).toBeVisible()
    await closeWorkspace(page)
    const row = page
      .getByRole('link', { name: 'Zelda Q Updated', exact: true })
      .locator('xpath=ancestor::*[self::tr or self::li][1]')
    await expect(row).toContainText('Inactive')
    await page.getByRole('link', { name: 'Zelda Q Updated', exact: true }).click()
    await page.getByRole('button', { name: 'Edit patient', exact: true }).click()
    await expect(edit.getByLabel('Condition 1 code', { exact: true })).toHaveValue('I10')
    await expect(edit.getByLabel('Condition 2 code', { exact: true })).toHaveValue('')
    await expect(edit.getByLabel('Phone', { exact: true })).toHaveValue('')
    await edit.getByRole('button', { name: 'Cancel', exact: true }).click()
  })

  await test.step('Deletion requires confirmation and removes the record from the directory', async () => {
    await page.getByRole('button', { name: 'Delete patient', exact: true }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Zelda Q Updated', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Delete patient', exact: true }).click()
    await confirmDeletion(page, 'Delete patient')
    await expect(
      page.getByRole('heading', { name: 'No matching patients', exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Clear search', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: /^100 patients$/ })).toBeVisible()
    await searchPatient(page, 'PT-0001')
    await expect(page.getByRole('link', { name: 'Ana J Silva', exact: true })).toBeVisible()
  })
})
