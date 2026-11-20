import { test, expect } from './fixtures'
import { expectPatientFields, expectStatus, type Patient, type PatientWrite } from './api'
import {
  apiRequestMatches,
  browserJSON,
  choose,
  confirmDeletion,
  directory,
  expectNoOverflow,
  openPatient,
  waitForAPI,
} from './ui'

test('UI validates, creates all writable fields, persists, replaces the profile and cancels/confirms deletion', async ({
  page,
  browser,
  live,
}) => {
  const { api, actors } = live
  const actor = actors[0]
  const input = api.patientInput('Profile', {
    middle_initial: 'Q',
    phone: '+1 (212) 555-0199',
    email: `live-${api.token}@example.com`,
    address_line1: '10 Integration Lane',
    address_line2: 'Suite 2',
    city: 'New York',
    state: 'NY',
    postal_code: '00123',
    blood_type: 'O+',
    status: 'inactive',
    last_visit: '2023-06-15',
    conditions: [
      { code: 'I10', label: 'Integration hypertension' },
      { code: null, label: 'Integration observation' },
    ],
    allergies: ['Integration pollen'],
    allergy_status: 'reported',
  })
  const writes: string[] = []
  page.on('request', (request) => {
    if (apiRequestMatches(api, request, 'POST', '/patients')) writes.push(request.method())
  })
  await page.getByRole('link', { name: 'Add patient', exact: true }).click()
  const form = page.getByRole('form', { name: 'Add patient', exact: true })
  const fields = [
    ['First name', input.first_name],
    ['Last name', input.last_name],
    ['Middle initial', input.middle_initial!],
    ['Date of birth', input.date_of_birth],
    ['Phone', input.phone!],
    ['Email', 'invalid-email'],
    ['Address line 1', input.address_line1!],
    ['Address line 2', input.address_line2!],
    ['City', input.city!],
    ['State / region', input.state!],
    ['Postal code', input.postal_code!],
    ['Last visit', input.last_visit!],
  ] as const
  for (const [label, value] of fields) await form.getByLabel(label, { exact: false }).fill(value)
  await choose(
    page,
    form.getByRole('combobox', { name: 'Patient status', exact: false }),
    'Inactive',
  )
  await choose(page, form.getByRole('combobox', { name: 'Blood type', exact: false }), 'O+')
  for (const [index, condition] of input.conditions.entries()) {
    await form.getByRole('button', { name: 'Add condition', exact: true }).click()
    await form.getByLabel(`Condition ${index + 1} label`, { exact: false }).fill(condition.label)
    if (condition.code)
      await form.getByLabel(`Condition ${index + 1} code`, { exact: true }).fill(condition.code)
  }
  await form.getByRole('radio', { name: 'Reported allergies', exact: true }).check()
  await form.getByRole('button', { name: 'Add allergy', exact: true }).click()
  await form.getByRole('textbox', { name: /^Allergy 1/ }).fill(input.allergies[0]!)
  await form.getByRole('button', { name: 'Add patient', exact: true }).click()
  await expect(form.getByLabel('Email', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  await expect(form.getByText('Error: Enter a valid email address.', { exact: true })).toBeVisible()
  await expect(form.getByLabel('Postal code', { exact: true })).toHaveValue('00123')
  await expect(form.getByLabel('Condition 1 code', { exact: true })).toHaveValue('I10')
  expect(writes, 'Invalid UI draft must not reach patient POST').toHaveLength(0)

  await form.getByLabel('Email', { exact: true }).fill(input.email!)
  const createdResponse = waitForAPI(page, api, 'POST', '/patients')
  await form.getByRole('button', { name: 'Add patient', exact: true }).click()
  const reply = await createdResponse
  const created = await browserJSON<Patient>(reply, 201)
  api.trackCreated(created)
  expectPatientFields(reply.request().postDataJSON() as PatientWrite, input, true)
  expect(writes).toHaveLength(1)
  await expect(
    page.getByRole('dialog', { name: `Integration Q ${input.last_name}`, exact: true }),
  ).toBeVisible()
  await expectNoOverflow(page)
  const stored = await api.patient(created.id, actor.id)
  expectPatientFields(stored, input)

  await page.reload()
  await expect(
    page.getByRole('dialog', { name: `Integration Q ${input.last_name}`, exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Edit patient', exact: true }).click()
  const edit = page.getByRole('form', { name: 'Edit patient', exact: true })
  await expect(edit.getByLabel('Middle initial', { exact: true })).toHaveValue('Q')
  await expect(edit.getByLabel('Last visit', { exact: true })).toHaveValue(input.last_visit!)
  for (const label of ['Phone', 'Email', 'Address line 2', 'City'])
    await edit.getByLabel(label, { exact: true }).fill('')
  await edit.getByLabel('Condition 1 code', { exact: true }).fill('I11')
  await edit.getByLabel('Condition 1 label', { exact: false }).fill('Integration condition revised')
  await edit.getByRole('button', { name: 'Remove condition 2', exact: true }).click()
  await edit.getByRole('radio', { name: 'No known allergies', exact: true }).check()
  await choose(page, edit.getByRole('combobox', { name: 'Blood type', exact: false }), 'Unknown')
  await choose(page, edit.getByRole('combobox', { name: 'Patient status', exact: false }), 'Active')
  const expected: PatientWrite = {
    ...input,
    phone: null,
    email: null,
    address_line2: null,
    city: null,
    blood_type: null,
    status: 'active',
    conditions: [{ code: 'I11', label: 'Integration condition revised' }],
    allergy_status: 'no_known',
    allergies: [],
  }
  const editedResponse = waitForAPI(page, api, 'PUT', `/patients/${created.id}`)
  await edit.getByRole('button', { name: 'Save changes', exact: true }).click()
  const edited = await editedResponse
  expect(edited.status()).toBe(200)
  expectPatientFields(edited.request().postDataJSON() as PatientWrite, expected, true)
  await expect(page.getByRole('dialog')).toBeVisible()
  const replaced = await api.patient(created.id, actor.id)
  expectPatientFields(replaced, expected)
  for (const key of [
    'source_patient_id',
    'mrn',
    'source_lineage',
    'profile_details',
    'source_created_at',
    'source_updated_at',
  ] as const) {
    expect(
      JSON.stringify(replaced[key]) === JSON.stringify(stored[key]),
      `Retained read-only field: ${key}`,
    ).toBe(true)
  }

  // A separate context has no browser storage or React Query cache from the write journey.
  const freshContext = await browser.newContext({
    baseURL: api.baseURL,
    viewport: page.viewportSize() ?? undefined,
    isMobile: (page.viewportSize()?.width ?? 1440) < 768,
    hasTouch: (page.viewportSize()?.width ?? 1440) < 768,
    timezoneId: 'America/New_York',
    serviceWorkers: 'block',
  })
  try {
    const freshPage = await freshContext.newPage()
    await directory(freshPage, api, actor)
    await openPatient(freshPage, api, created.id)
    await freshPage.reload()
    await expect(
      freshPage.getByRole('dialog', { name: `Integration Q ${input.last_name}`, exact: true }),
    ).toBeVisible()
    await expectNoOverflow(freshPage)
    await freshPage.getByRole('button', { name: 'Edit patient', exact: true }).click()
    const persisted = freshPage.getByRole('form', { name: 'Edit patient', exact: true })
    await expect(persisted.getByLabel('Middle initial', { exact: true })).toHaveValue('Q')
    await expect(persisted.getByLabel('Last visit', { exact: true })).toHaveValue(input.last_visit!)
    for (const label of ['Phone', 'Email', 'Address line 2', 'City'])
      await expect(persisted.getByLabel(label, { exact: true })).toHaveValue('')
    await expect(persisted.getByLabel('Condition 1 code', { exact: true })).toHaveValue('I11')
    await expect(persisted.getByLabel('Condition 1 label', { exact: false })).toHaveValue(
      'Integration condition revised',
    )
    await expect(persisted.getByLabel('Condition 2 label', { exact: false })).toHaveCount(0)
    await expect(
      persisted.getByRole('radio', { name: 'No known allergies', exact: true }),
    ).toBeChecked()
    await expect(persisted.getByRole('combobox', { name: 'Blood type' })).toHaveText('Unknown')
    await expect(persisted.getByRole('combobox', { name: 'Patient status' })).toHaveText('Active')
  } finally {
    await freshContext.close()
  }

  await page.getByRole('button', { name: 'Delete patient', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expectStatus(await api.response('GET', `/patients/${created.id}`, actor.id), 200)
  await page.getByRole('button', { name: 'Delete patient', exact: true }).click()
  const deletedResponse = waitForAPI(page, api, 'DELETE', `/patients/${created.id}`)
  await confirmDeletion(page, 'Delete patient')
  expect((await deletedResponse).status()).toBe(204)
  await expectStatus(await api.response('GET', `/patients/${created.id}`, actor.id), 404)
  // Keep the tracked ID: cleanup accepts 404 and still verifies absence instead of double-delete failure.
  await page.goto(api.uiURL(`/patients/${created.id}`))
  await expect(page.getByRole('heading', { name: 'Patient not found', exact: true })).toBeVisible()
})
