import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockApi } from './mock-api'
import type { DashboardApi, PatientDetail, PatientWrite } from './types'

async function setup() {
  const api = createMockApi()
  const users = await api.listUsers()
  const first = { actorId: users[0]!.id }
  const second = { actorId: users[1]!.id }
  const all = await api.listPatients({ page_size: 100 }, first)
  const patient = all.items.find((item) => item.source_patient_id === 'PT-0001')!
  const other = all.items.find((item) => item.source_patient_id === 'PT-0002')!
  return { api, users, first, second, all, patient, other }
}

function writeFrom(item: PatientDetail): PatientWrite {
  return {
    first_name: item.first_name,
    middle_initial: item.middle_initial,
    last_name: item.last_name,
    date_of_birth: item.date_of_birth,
    phone: item.phone,
    email: item.email,
    address_line1: item.address_line1,
    address_line2: item.address_line2,
    city: item.city,
    state: item.state,
    postal_code: item.postal_code,
    blood_type: item.blood_type,
    status: item.status,
    last_visit: item.last_visit,
    conditions: item.conditions,
    allergies: item.allergies,
    allergy_status: item.allergy_status,
  }
}

afterEach(() => vi.useRealTimers())

describe('demo patient API', () => {
  it('has 100 deterministic records, separate IDs, live ages, and isolated mutable stores', async () => {
    const { api, first, all, patient } = await setup()
    const other = createMockApi()
    expect(all.total).toBe(100)
    expect(new Set(all.items.map((item) => item.id)).size).toBe(100)
    expect(patient.id).toMatch(/^[\da-f-]{36}$/)
    expect(patient.source_patient_id).toBe('PT-0001')
    expect(patient.mrn).toBe('01000001')
    expect((await other.listPatients({ page_size: 100 }, first)).items).toEqual(all.items)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-31T12:00:00Z'))
    const before = await api.getPatient(patient.id, first)
    vi.setSystemTime(new Date('2027-12-31T12:00:00Z'))
    expect((await api.getPatient(patient.id, first)).age).toBe(before.age + 1)
    await api.deletePatient(patient.id, first)
    expect((await other.listPatients({}, first)).total).toBe(100)
    expect((await api.listPatients({}, first)).total).toBe(99)
  })

  it('searches the complete dataset and filters before paging with accurate totals', async () => {
    const { api, first, all } = await setup()
    const tail = all.items[99]!
    const result = await api.listPatients({ q: tail.source_patient_id!, page_size: 1 }, first)
    expect(result.items.map((item) => item.id)).toEqual([tail.id])
    expect(result.total).toBe(1)
    expect((await api.listPatients({ q: tail.mrn! }, first)).total).toBe(1)
    expect((await api.listPatients({ q: 'GRACE.100@EXAMPLE.COM' }, first)).total).toBe(1)
    expect((await api.listPatients({ q: '%' }, first)).total).toBe(0)
    const expected = all.items.filter((item) => item.status === 'active')
    const active = await api.listPatients({ status: 'active', page: 2, page_size: 7 }, first)
    expect(active.total).toBe(expected.length)
    expect(active.items).toEqual(expected.slice(7, 14))
    expect(await api.listPatients({ page: 100, page_size: 10 }, first)).toMatchObject({
      items: [],
      total: 100,
      page: 100,
    })
  })

  it('sorts across pages, supports activity count sorts, and keeps null visits last both ways', async () => {
    const { api, first, all } = await setup()
    for (const sort_by of ['dob', 'status', 'notes_count', 'comments_count'] as const) {
      const key = sort_by === 'dob' ? 'date_of_birth' : sort_by
      const complete = await api.listPatients({ sort_by, order: 'desc', page_size: 100 }, first)
      const keys = complete.items.map((item) => item[key])
      expect(keys).toEqual(
        [...keys].sort((a, b) =>
          typeof a === 'number' && typeof b === 'number'
            ? b - a
            : String(b).localeCompare(String(a)),
        ),
      )
      const page = await api.listPatients({ sort_by, order: 'desc', page: 3, page_size: 9 }, first)
      expect(page.items).toEqual(complete.items.slice(18, 27))
      expect(new Set(complete.items.map((item) => item.id)).size).toBe(all.total)
    }
    for (const order of ['asc', 'desc'] as const) {
      const sorted = await api.listPatients({ sort_by: 'last_visit', order, page_size: 100 }, first)
      const firstNull = sorted.items.findIndex((item) => item.last_visit === null)
      expect(firstNull).toBeGreaterThan(0)
      expect(sorted.items.slice(firstNull).every((item) => item.last_visit === null)).toBe(true)
    }
  })

  it('validates full writes, dates, enums, null arrays, and unknown readonly fields atomically', async () => {
    const { api, first, patient } = await setup()
    const original = await api.getPatient(patient.id, first)
    const input = writeFrom(original)
    const invalidInputs = [
      { ...input, first_name: ' ' },
      { ...input, date_of_birth: '2026-02-30' },
      { ...input, date_of_birth: '9999-01-01' },
      { ...input, last_visit: '9999-01-01' },
      { ...input, email: 'not-an-email' },
      { ...input, status: 'pending' },
      { ...input, allergies: null },
      { ...input, conditions: null },
      { ...input, allergy_status: 'reported', allergies: [] },
      { ...input, allergy_status: 'no_known', allergies: ['Peanuts'] },
      { ...input, mrn: 'forged' },
      { ...input, middle_initial: undefined },
    ]
    for (const value of invalidInputs) {
      await expect(
        api.updatePatient(patient.id, value as PatientWrite, first),
      ).rejects.toMatchObject({ status: 422, kind: 'validation' })
    }
    expect(await api.getPatient(patient.id, first)).toEqual(original)
    const saved = await api.updatePatient(
      patient.id,
      {
        ...input,
        first_name: ' Updated ',
        phone: '+44 (20) 1234-5678',
        blood_type: null,
        conditions: [{ code: null, label: 'New condition' }],
        allergies: [],
        allergy_status: 'unknown',
      },
      first,
    )
    expect(saved.first_name).toBe('Updated')
    expect(saved.mrn).toBe(original.mrn)
    expect(saved.profile_details).toEqual(original.profile_details)
    expect(saved.conditions).toEqual([{ code: null, label: 'New condition' }])
    const created = await api.createPatient(input, first)
    expect(created).toMatchObject({
      source_patient_id: null,
      mrn: null,
      notes_count: 0,
      comments_count: 0,
    })
    expect(created.id).not.toBe(patient.id)
  })

  it('rejects invalid paging and sort/filter values, missing actors and malformed IDs', async () => {
    const { api, first, patient } = await setup()
    await expect(api.listPatients({})).rejects.toMatchObject({ status: 401 })
    await expect(api.listPatients({}, { actorId: 'invalid' })).rejects.toMatchObject({
      status: 401,
    })
    for (const params of [
      { page: 0 },
      { page_size: 101 },
      { page: 1.5 },
      { q: 'x'.repeat(201) },
      { sort_by: 'age' },
      { status: 'pending' },
      { has_unread_comments: 'true' },
    ]) {
      await expect(
        api.listPatients(params as Parameters<DashboardApi['listPatients']>[0], first),
      ).rejects.toMatchObject({ status: 422 })
    }
    await expect(api.getPatient('PT-0001', first)).rejects.toMatchObject({ status: 422 })
    const controller = new AbortController()
    controller.abort()
    await expect(
      api.deletePatient(patient.id, { ...first, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect((await api.listPatients({}, first)).total).toBe(100)
  })

  it('returns copies so consumers cannot change the underlying data', async () => {
    const { api, first, patient } = await setup()
    const one = await api.getPatient(patient.id, first)
    one.first_name = 'Forged'
    one.conditions.push({ code: null, label: 'Forged condition' })
    const notes = await api.listNotes(patient.id, first)
    notes[0]!.author.display_name = 'Forged author'
    expect((await api.getPatient(patient.id, first)).first_name).not.toBe('Forged')
    expect((await api.getPatient(patient.id, first)).conditions).not.toContainEqual({
      code: null,
      label: 'Forged condition',
    })
    expect((await api.listUsers())[0]!.display_name).not.toBe('Forged author')
  })
})

describe('demo conversation and notes API', () => {
  it('pages newest comments and notes consistently, with empty discussions available', async () => {
    const { api, first, all, patient } = await setup()
    const complete = await api.listComments(patient.id, { page_size: 100 }, first)
    expect(complete.items.map((item) => item.created_at)).toEqual(
      complete.items
        .map((item) => item.created_at)
        .sort()
        .reverse(),
    )
    const secondPage = await api.listComments(patient.id, { page: 2, page_size: 1 }, first)
    expect(secondPage.items).toEqual(complete.items.slice(1, 2))
    expect(secondPage.total).toBe(3)
    expect(secondPage.items[0]!.is_unread).toBe(false)
    const notes = await api.listNotes(patient.id, first)
    expect(notes.map((item) => item.timestamp)).toEqual(
      notes
        .map((item) => item.timestamp)
        .sort()
        .reverse(),
    )
    const empty = all.items.find((item) => item.comments_count === 0)!
    expect(empty).toBeDefined()
    expect(await api.listComments(empty.id, {}, first)).toEqual({
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
    })
  })

  it('seeds bounded unread activity and keeps notification totals global per viewer', async () => {
    const { api, first, second } = await setup()
    expect(await api.getNotificationSummary(first)).toEqual({
      unread_comments_count: 12,
      patients_with_unread_comments: 12,
    })
    const queue = await api.listPatients(
      { has_unread_comments: true, page: 2, page_size: 5 },
      first,
    )
    expect(queue.total).toBe(12)
    expect(queue.items).toHaveLength(5)
    expect(queue.items.every((item) => item.unread_comments_count > 0)).toBe(true)
    expect(
      (await api.listPatients({ has_unread_comments: false, page_size: 100 }, first)).total,
    ).toBe(88)
    expect(await api.getNotificationSummary(second)).toEqual({
      unread_comments_count: 9,
      patients_with_unread_comments: 9,
    })
    await api.listPatients({ q: 'no match', has_unread_comments: true }, first)
    expect((await api.getNotificationSummary(first)).unread_comments_count).toBe(12)
  })

  it('reads only observed comments idempotently; later arrivals and other viewers remain independent', async () => {
    const { api, first, second, patient } = await setup()
    const snapshot = await api.listComments(patient.id, { page_size: 1 }, first)
    expect(snapshot.total).toBe(3)
    expect(snapshot.items[0]!.is_unread).toBe(true)
    const incoming = await api.createComment(
      patient.id,
      { body: 'Arrived after snapshot', note_ids: [] },
      second,
    )
    const own = await api.createComment(patient.id, { body: 'My own reply', note_ids: [] }, first)
    expect(own.is_unread).toBe(false)
    expect(incoming.is_unread).toBe(false)
    const ids = snapshot.items.map((item) => item.id)
    const receipt = await api.markCommentsRead(patient.id, [...ids, ...ids], first)
    expect(receipt).toMatchObject({ read_comment_ids: ids, unread_comments_count: 1 })
    expect(await api.markCommentsRead(patient.id, ids, first)).toEqual(receipt)
    const after = await api.listComments(patient.id, {}, first)
    expect(after.items.find((item) => item.id === incoming.id)?.is_unread).toBe(true)
    expect(after.items.find((item) => item.id === own.id)?.is_unread).toBe(false)
    expect(after.items.find((item) => item.id === ids[0])?.is_unread).toBe(false)
    const forSecond = await api.listComments(patient.id, {}, second)
    expect(forSecond.items.find((item) => item.id === own.id)?.is_unread).toBe(true)
    await api.markCommentsRead(
      patient.id,
      forSecond.items.map((item) => item.id),
      second,
    )
    expect((await api.getPatient(patient.id, first)).unread_comments_count).toBe(1)
  })

  it('does not mark discussion read by opening profile, notes or summary; edits do not make read messages new', async () => {
    const { api, first, second, patient } = await setup()
    await api.getPatient(patient.id, first)
    await api.listNotes(patient.id, first)
    await api.getSummary(patient.id, first)
    expect((await api.getPatient(patient.id, first)).unread_comments_count).toBe(1)
    const messages = await api.listComments(patient.id, {}, first)
    const old = messages.items.find((item) => item.author.id === second.actorId)!
    await api.markCommentsRead(patient.id, [old.id], first)
    const edited = await api.updateComment(
      patient.id,
      old.id,
      { body: 'Edited body', note_ids: old.note_links.map((link) => link.id) },
      second,
    )
    expect(edited.created_at).toBe(old.created_at)
    expect(edited.updated_at >= old.updated_at).toBe(true)
    expect(edited.author).toEqual(old.author)
    expect((await api.getPatient(patient.id, first)).unread_comments_count).toBe(0)
    expect((await api.listPatients({ has_unread_comments: true }, first)).total).toBe(11)
  })

  it('rejects cross-patient links atomically and handles note tombstones without losing old links', async () => {
    const { api, first, second, patient, other } = await setup()
    const note = (await api.listNotes(patient.id, first)).find(
      (item) => item.author.id === first.actorId,
    )!
    const otherNote = (await api.listNotes(other.id, first))[0]!
    await expect(
      api.createComment(patient.id, { body: 'Wrong parent', note_ids: [otherNote.id] }, first),
    ).rejects.toMatchObject({ status: 422 })
    await expect(api.getNote(other.id, note.id, first)).rejects.toMatchObject({ status: 404 })
    await expect(api.deleteNote(other.id, note.id, second)).rejects.toMatchObject({ status: 404 })
    const linked = await api.createComment(
      patient.id,
      { body: 'Keep this reference', note_ids: [note.id] },
      first,
    )
    await expect(
      api.updateComment(
        patient.id,
        linked.id,
        { body: 'Invalid edit', note_ids: [otherNote.id] },
        first,
      ),
    ).rejects.toMatchObject({ status: 422 })
    expect(
      (await api.listComments(patient.id, {}, first)).items.find((item) => item.id === linked.id)
        ?.body,
    ).toBe('Keep this reference')
    const before = await api.getPatient(patient.id, first)
    await api.deleteNote(patient.id, note.id, first)
    await expect(api.getNote(patient.id, note.id, first)).rejects.toMatchObject({
      status: 410,
      kind: 'gone',
    })
    await expect(api.deleteNote(patient.id, note.id, first)).rejects.toMatchObject({ status: 404 })
    expect((await api.getPatient(patient.id, first)).notes_count).toBe(before.notes_count - 1)
    expect((await api.listNotes(patient.id, first)).some((item) => item.id === note.id)).toBe(false)
    const changed = await api.updateComment(
      patient.id,
      linked.id,
      { body: 'Unrelated edit', note_ids: [note.id] },
      first,
    )
    expect(changed.note_links[0]).toMatchObject({
      id: note.id,
      label: 'Deleted note',
      is_deleted: true,
    })
    await expect(
      api.createComment(patient.id, { body: 'New deleted link', note_ids: [note.id] }, first),
    ).rejects.toMatchObject({ status: 422 })
    await api.updateComment(
      patient.id,
      linked.id,
      { body: 'Reference removed', note_ids: [] },
      first,
    )
    await expect(
      api.updateComment(
        patient.id,
        linked.id,
        { body: 'Cannot restore deleted link', note_ids: [note.id] },
        first,
      ),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('enforces authorship and validates note/comment content, timestamps and link arrays', async () => {
    const { api, first, second, patient, other } = await setup()
    const note = await api.createNote(
      patient.id,
      { timestamp: '2026-10-31T09:00:00-04:00', content: ' Clinical note ' },
      first,
    )
    expect(note).toMatchObject({
      timestamp: '2026-10-31T13:00:00.000Z',
      content: 'Clinical note',
      author: { id: first.actorId },
      attachments: [],
    })
    const comment = await api.createComment(
      patient.id,
      { body: 'Discussion', note_ids: [note.id, note.id] },
      first,
    )
    expect(comment.note_links).toHaveLength(1)
    await expect(api.deleteNote(patient.id, note.id, second)).rejects.toMatchObject({ status: 403 })
    await expect(
      api.updateComment(patient.id, comment.id, { body: 'Forged', note_ids: [] }, second),
    ).rejects.toMatchObject({ status: 403 })
    await expect(api.deleteComment(other.id, comment.id, second)).rejects.toMatchObject({
      status: 404,
    })
    await expect(api.deleteComment(patient.id, comment.id, second)).rejects.toMatchObject({
      status: 403,
    })
    for (const input of [
      { timestamp: '2026-10-31T09:00', content: 'Text' },
      { timestamp: '2026-02-30T09:00:00Z', content: 'Text' },
      { timestamp: note.timestamp, content: ' ' },
      { timestamp: note.timestamp, content: 'x'.repeat(20_001) },
    ]) {
      await expect(api.createNote(patient.id, input, first)).rejects.toMatchObject({ status: 422 })
    }
    for (const input of [
      { body: ' ', note_ids: [] },
      { body: 'x'.repeat(10_001), note_ids: [] },
      { body: 'Text', note_ids: null },
      { body: 'Text', note_ids: ['not-a-uuid'] },
    ]) {
      await expect(
        api.createComment(
          patient.id,
          input as unknown as Parameters<DashboardApi['createComment']>[1],
          first,
        ),
      ).rejects.toMatchObject({ status: 422 })
    }
    await api.deleteComment(patient.id, comment.id, first)
    expect(
      (await api.listComments(patient.id, {}, first)).items.some((item) => item.id === comment.id),
    ).toBe(false)
  })

  it('scopes read acknowledgments atomically and tolerates a concurrent deletion', async () => {
    const { api, first, second, patient, other } = await setup()
    const one = (await api.listComments(patient.id, {}, first)).items[0]!
    const foreign = (await api.listComments(other.id, {}, first)).items[0]!
    await expect(
      api.markCommentsRead(patient.id, [one.id, foreign.id], first),
    ).rejects.toMatchObject({ status: 404 })
    expect((await api.getPatient(patient.id, first)).unread_comments_count).toBe(1)
    const incoming = await api.createComment(
      patient.id,
      { body: 'Removed while reading', note_ids: [] },
      second,
    )
    await api.deleteComment(patient.id, incoming.id, second)
    expect(await api.markCommentsRead(patient.id, [incoming.id, one.id], first)).toMatchObject({
      read_comment_ids: [one.id],
      unread_comments_count: 0,
    })
    expect((await api.getNotificationSummary(first)).unread_comments_count).toBe(11)
  })

  it('generates current summaries from profile and active notes, excluding discussion and deleted content', async () => {
    const { api, first, patient } = await setup()
    const before = await api.getSummary(patient.id, first)
    await api.createComment(patient.id, { body: 'DISCUSSION_ONLY_SECRET', note_ids: [] }, first)
    expect((await api.getSummary(patient.id, first)).summary).toBe(before.summary)
    const note = await api.createNote(
      patient.id,
      { timestamp: '2026-10-01T12:00:00Z', content: 'UNIQUE_CLINICAL_CONTENT' },
      first,
    )
    expect((await api.getSummary(patient.id, first)).summary).toContain('UNIQUE_CLINICAL_CONTENT')
    await api.deleteNote(patient.id, note.id, first)
    const summary = await api.getSummary(patient.id, first)
    expect(summary.summary).not.toContain('UNIQUE_CLINICAL_CONTENT')
    expect(summary.summary).not.toContain('DISCUSSION_ONLY_SECRET')
    expect(summary.method).toBe('template')
    const profile = await api.getPatient(patient.id, first)
    await api.updatePatient(
      patient.id,
      { ...writeFrom(profile), first_name: 'Changed', conditions: [] },
      first,
    )
    expect((await api.getSummary(patient.id, first)).summary).toContain('Changed')
    await api.deletePatient(patient.id, first)
    await expect(api.listNotes(patient.id, first)).rejects.toMatchObject({ status: 404 })
    await expect(api.listComments(patient.id, {}, first)).rejects.toMatchObject({ status: 404 })
    expect((await api.getNotificationSummary(first)).patients_with_unread_comments).toBe(11)
  })
})
