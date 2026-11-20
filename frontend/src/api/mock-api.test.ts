import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDemoData } from '../fixtures/demo-data'
import { timestampMicros } from '../utils/dates'
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
  it('pages chronological comments and newest notes consistently, with empty discussions available', async () => {
    const { api, first, all, patient } = await setup()
    const complete = await api.listComments(patient.id, { page_size: 100 }, first)
    expect(complete.items.map((item) => item.created_at)).toEqual(
      complete.items.map((item) => item.created_at).sort(),
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
    expect(await api.listComments(empty.id, {}, first)).toMatchObject({
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
    ).toBe(100)
    expect(await api.getNotificationSummary(second)).toEqual({
      unread_comments_count: 9,
      patients_with_unread_comments: 9,
    })
    await api.listPatients({ q: 'no match', has_unread_comments: true }, first)
    expect((await api.getNotificationSummary(first)).unread_comments_count).toBe(12)
  })

  it('acknowledges displayed chronological prefixes; later arrivals and viewers stay independent', async () => {
    const { api, first, second, patient } = await setup()
    const snapshot = await api.listComments(patient.id, { page_size: 2 }, first)
    expect(snapshot.total).toBe(3)
    const incoming = await api.createComment(
      patient.id,
      { body: 'Arrived after snapshot', note_ids: [] },
      second,
    )
    const own = await api.createComment(patient.id, { body: 'My own reply', note_ids: [] }, first)
    expect(own.is_unread).toBe(false)
    expect(incoming.is_unread).toBe(false)
    const continuation = await api.listComments(
      patient.id,
      { cursor: snapshot.next_cursor!, page_size: 2 },
      first,
    )
    expect(continuation.items.map((item) => item.id)).not.toContain(incoming.id)
    expect(continuation).toMatchObject({ total: 3, page: 2, next_cursor: null })
    const input = { through: continuation.read_through }
    const receipt = await api.markCommentsRead(patient.id, input, first)
    expect(receipt).toEqual({ patient_id: patient.id, last_read_at: input.through })
    expect(await api.markCommentsRead(patient.id, input, first)).toEqual(receipt)
    expect(
      await api.markCommentsRead(patient.id, { through: snapshot.read_through }, first),
    ).toEqual(receipt)
    const after = await api.listComments(patient.id, {}, first)
    expect(after.items.find((item) => item.id === incoming.id)?.is_unread).toBe(true)
    expect(after.items.find((item) => item.id === own.id)?.is_unread).toBe(false)
    const forSecond = await api.listComments(patient.id, {}, second)
    expect(forSecond.items.find((item) => item.id === own.id)?.is_unread).toBe(true)
    await api.markCommentsRead(patient.id, { through: forSecond.read_through }, second)
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
    await api.markCommentsRead(patient.id, { through: messages.read_through }, first)
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
      { body: 'Discussion', note_ids: [note.id] },
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
      { timestamp: '2999-01-01T09:00:00Z', content: 'Text' },
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
      { body: 'Text', note_ids: [note.id, note.id] },
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

  it('keeps cursor positions stable across deletion and rejects wrong-patient or invalid cursors', async () => {
    const { api, first, patient, other } = await setup()
    const page = await api.listComments(patient.id, { page_size: 1 }, first)
    const cursor = page.next_cursor!
    const original = await api.listComments(patient.id, { page_size: 100 }, first)
    await api.deleteComment(patient.id, page.items[0]!.id, first)
    const next = await api.listComments(patient.id, { cursor, page: 99, page_size: 1 }, first)
    expect(next.page).toBe(2)
    expect(next.total).toBe(2)
    expect(next.items[0]!.id).toBe(original.items[1]!.id)
    await expect(api.listComments(other.id, { cursor }, first)).rejects.toMatchObject({
      status: 422,
      code: 'invalid_discussion_cursor',
    })
    await expect(api.listComments(patient.id, { cursor: 'garbage' }, first)).rejects.toMatchObject({
      status: 422,
    })
    const legacy = await api.listComments(patient.id, { page: 2, page_size: 1 }, first)
    expect(legacy).toMatchObject({ read_through: '0001-01-01T00:00:00.000000Z', next_cursor: null })
    await api.markCommentsRead(patient.id, { through: legacy.read_through }, first)
    expect((await api.getPatient(patient.id, first)).unread_comments_count).toBe(1)
    expect(
      await api.listComments(patient.id, { page: Number.MAX_SAFE_INTEGER }, first),
    ).toMatchObject({ items: [], next_cursor: null })
  })

  it('does not acknowledge an equal-timestamp group until the entire group was fetched', async () => {
    const data = createDemoData()
    const patientId = data.patients[0]!.id
    const actor = { actorId: data.users[0]!.id }
    data.lastReadByActor.get(actor.actorId)!.delete(patientId)
    data.comments
      .filter((item) => item.patient_id === patientId)
      .forEach((item) => {
        item.author = data.users[1]!
        item.created_at = '2026-11-03T16:00:00.123456Z'
      })
    const api = createMockApi(data)
    const first = await api.listComments(patientId, { page_size: 1 }, actor)
    expect(first.read_through).toBe('2026-11-03T16:00:00.123455Z')
    await api.markCommentsRead(patientId, { through: first.read_through }, actor)
    expect((await api.getPatient(patientId, actor)).unread_comments_count).toBe(3)
    const second = await api.listComments(
      patientId,
      { cursor: first.next_cursor!, page_size: 1 },
      actor,
    )
    await api.markCommentsRead(patientId, { through: second.read_through }, actor)
    expect((await api.getPatient(patientId, actor)).unread_comments_count).toBe(3)
    const third = await api.listComments(
      patientId,
      { cursor: second.next_cursor!, page_size: 1 },
      actor,
    )
    await api.markCommentsRead(patientId, { through: third.read_through }, actor)
    expect((await api.getPatient(patientId, actor)).unread_comments_count).toBe(0)
  })

  it('keeps unseen comments in sequence when earlier or unseen snapshot entries are deleted', async () => {
    const { api, first, second, patient } = await setup()
    const firstPage = await api.listComments(patient.id, { page_size: 1 }, first)
    const original = await api.listComments(patient.id, {}, first)
    // Remove the next unread position rather than shifting an offset past the final comment.
    await api.deleteComment(patient.id, original.items[1]!.id, first)
    const final = await api.listComments(
      patient.id,
      { cursor: firstPage.next_cursor!, page_size: 1 },
      first,
    )
    expect(final.items.map((item) => item.id)).toEqual([original.items[2]!.id])
    expect(final.next_cursor).toBeNull()
    const incoming = await api.createComment(
      patient.id,
      { body: 'After snapshot', note_ids: [] },
      second,
    )
    await api.deleteComment(patient.id, final.items[0]!.id, second)
    await api.markCommentsRead(patient.id, { through: final.read_through }, first)
    const refreshed = await api.listComments(patient.id, {}, first)
    expect(refreshed.items.find((item) => item.id === incoming.id)?.is_unread).toBe(true)
  })

  it('validates watermarks and clamps future acknowledgments to a monotonic database clock', async () => {
    const { api, first, patient } = await setup()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-20T10:00:00Z'))
    for (const through of ['', 'invalid', '2026-11-20T10:00:00', '2026-02-30T10:00:00Z']) {
      await expect(api.markCommentsRead(patient.id, { through }, first)).rejects.toMatchObject({
        status: 422,
      })
    }
    const receipt = await api.markCommentsRead(
      patient.id,
      { through: '2999-01-01T00:00:00Z' },
      first,
    )
    expect(timestampMicros(receipt.last_read_at)).toBe(BigInt(Date.now()) * 1000n)
    expect(
      await api.markCommentsRead(patient.id, { through: '2020-01-01T00:00:00Z' }, first),
    ).toEqual(receipt)
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
    expect(summary).toMatchObject({ method: 'llm', model: 'gemma-3-27b' })
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

describe('demo assigned workload', () => {
  it('splits the shared directory into disjoint per-actor cohorts, filtered before totals and paging', async () => {
    const { api, users, first, second, all } = await setup()
    // Omitting assigned_to keeps the same global directory for every actor.
    expect(
      (await api.listPatients({ page_size: 100 }, second)).items.map((item) => item.id),
    ).toEqual(all.items.map((item) => item.id))
    const mine = await api.listPatients({ assigned_to: 'me', page_size: 100 }, first)
    const theirs = await api.listPatients({ assigned_to: 'me', page_size: 100 }, second)
    expect([mine.total, theirs.total]).toEqual([52, 48])
    expect(mine.items.every((item) => item.assigned_user_id === users[0]!.id)).toBe(true)
    expect(theirs.items.every((item) => item.assigned_user_id === users[1]!.id)).toBe(true)
    expect(new Set([...mine.items, ...theirs.items].map((item) => item.id)).size).toBe(100)
    const params = { status: 'active', sort_by: 'last_visit', order: 'desc' } as const
    const expected = (await api.listPatients({ ...params, page_size: 100 }, first)).items.filter(
      (item) => item.assigned_user_id === users[0]!.id,
    )
    const page = await api.listPatients(
      { ...params, assigned_to: 'me', page: 2, page_size: 7 },
      first,
    )
    expect(page.total).toBe(expected.length)
    expect(page.items).toEqual(expected.slice(7, 14))
    const queue = await api.listPatients({ has_unread_comments: true, page_size: 100 }, first)
    const assignedQueue = await api.listPatients(
      { assigned_to: 'me', has_unread_comments: true, q: 'example.com', page_size: 100 },
      first,
    )
    expect(assignedQueue.items.map((item) => item.id)).toEqual(
      queue.items.filter((item) => item.assigned_user_id === users[0]!.id).map((item) => item.id),
    )
    // Unread notifications stay personal across all patients, not the cohort.
    expect((await api.getNotificationSummary(first)).unread_comments_count).toBe(queue.total)
    expect(assignedQueue.total).toBeLessThan(queue.total)
  })

  it('assigns creates to the selected actor, preserves assignment on PUT and rejects assignment input', async () => {
    const { api, users, first, second, patient } = await setup()
    const original = await api.getPatient(patient.id, first)
    const input = writeFrom(original)
    const created = await api.createPatient(input, second)
    expect(created.assigned_user_id).toBe(users[1]!.id)
    expect((await api.listPatients({ assigned_to: 'me' }, second)).total).toBe(49)
    expect((await api.listPatients({ assigned_to: 'me' }, first)).total).toBe(52)
    expect((await api.listPatients({}, first)).total).toBe(101)
    const edited = await api.updatePatient(
      patient.id,
      { ...input, status: 'inactive' },
      original.assigned_user_id === users[0]!.id ? second : first,
    )
    expect(edited.status).toBe('inactive')
    expect(edited.assigned_user_id).toBe(original.assigned_user_id)
    const forged = { ...input, assigned_user_id: users[1]!.id } as PatientWrite
    await expect(api.createPatient(forged, first)).rejects.toMatchObject({
      status: 422,
      fieldErrors: { assigned_user_id: 'Unexpected field.' },
    })
    await expect(api.updatePatient(patient.id, forged, first)).rejects.toMatchObject({
      status: 422,
    })
    expect((await api.getPatient(patient.id, first)).assigned_user_id).toBe(
      original.assigned_user_id,
    )
    expect((await api.listPatients({}, first)).total).toBe(101)
  })

  it('rejects invalid assigned filters and missing actors, and verifies empty cohorts', async () => {
    const { first } = await setup()
    const state = createDemoData()
    state.patients = state.patients.map((item) => ({ ...item, assigned_user_id: null }))
    const api = createMockApi(state)
    expect(await api.listPatients({ assigned_to: 'me' }, first)).toMatchObject({
      items: [],
      total: 0,
      page: 1,
    })
    // Unassigned patients remain in the shared directory.
    expect((await api.listPatients({}, first)).total).toBe(100)
    await expect(api.listPatients({ assigned_to: 'me' })).rejects.toMatchObject({ status: 401 })
    for (const assigned_to of ['you', '', 'ME']) {
      await expect(
        api.listPatients({ assigned_to } as Parameters<DashboardApi['listPatients']>[0], first),
      ).rejects.toMatchObject({
        status: 422,
        fieldErrors: { 'query.assigned_to': 'Value is not one of the allowed choices.' },
      })
    }
  })
})
