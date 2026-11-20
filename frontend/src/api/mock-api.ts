import { createDemoData, demoId } from '../fixtures/demo-data'
import type { DemoComment, DemoNote, DemoPatient } from '../fixtures/demo-data'
import { localToday, timestampFromMicros, timestampMicros } from '../utils/dates'
import { decodeDiscussionCursor, encodeDiscussionCursor } from './mock-discussion-cursor'
import { ApiError } from './client'
import type {
  Comment,
  DashboardApi,
  Note,
  Page,
  PatientDetail,
  PatientListItem,
  RequestContext,
  User,
} from './types'
import {
  invalid,
  validateComment,
  validateId,
  validateDiscussionRead,
  validateList,
  validateNote,
  validatePage,
  validatePatient,
} from './validation'

function copy<T>(value: T): T {
  return structuredClone(value)
}

function notFound(): never {
  throw new ApiError(404, 'not_found', 'The requested record was not found.')
}

function owned(author: User, actor: User) {
  if (author.id !== actor.id)
    throw new ApiError(403, 'forbidden', 'Only the author can change this record.')
}

function pageOf<T>(items: T[], params: { page: number; page_size: number }): Page<T> {
  const start = (params.page - 1) * params.page_size
  return {
    page: params.page,
    page_size: params.page_size,
    total: items.length,
    items: items.slice(start, start + params.page_size),
  }
}

// Mirrors the API's computed display name, which the list returns and search matches.
function fullName(item: DemoPatient): string {
  return [item.first_name, item.middle_initial, item.last_name].filter(Boolean).join(' ')
}

function ageOf(birthDate: string): number {
  const today = localToday()
  return (
    Number(today.slice(0, 4)) -
    Number(birthDate.slice(0, 4)) -
    (today.slice(5) < birthDate.slice(5) ? 1 : 0)
  )
}

/** An isolated, memory-only adapter. Select an actor from listUsers before domain calls. */
export function createMockApi(state = createDemoData()): DashboardApi {
  let lastClock = 0n
  // Model a database microsecond clock even when operations share a JS millisecond.
  function clock(): bigint {
    const wall = BigInt(Date.now()) * 1000n
    lastClock = wall > lastClock ? wall : lastClock + 1n
    return lastClock
  }
  let sequence = 10_000
  const newId = (kind: 'patient' | 'note' | 'comment') => demoId(kind, ++sequence)

  function actor(ctx?: RequestContext): User {
    ctx?.signal?.throwIfAborted()
    const user = state.users.find((item) => item.id === ctx?.actorId)
    if (!user) throw new ApiError(401, 'unauthorized', 'Select a valid demo user.')
    return user
  }

  function patient(id: string): DemoPatient {
    validateId(id, 'path.id')
    return state.patients.find((item) => item.id === id) ?? notFound()
  }

  function note(patientId: string, noteId: string): DemoNote {
    patient(patientId)
    validateId(noteId, 'path.note_id')
    return (
      state.notes.find((item) => item.id === noteId && item.patient_id === patientId) ?? notFound()
    )
  }

  function comment(patientId: string, commentId: string): DemoComment {
    patient(patientId)
    validateId(commentId, 'path.comment_id')
    return (
      state.comments.find((item) => item.id === commentId && item.patient_id === patientId) ??
      notFound()
    )
  }

  function unread(item: DemoComment, viewer: User): boolean {
    const through = state.lastReadByActor.get(viewer.id)!.get(item.patient_id)
    return (
      item.author.id !== viewer.id &&
      (through === undefined || timestampMicros(item.created_at) > timestampMicros(through))
    )
  }

  function listItem(item: DemoPatient, viewer: User): PatientListItem {
    const discussion = state.comments.filter((entry) => entry.patient_id === item.id)
    return {
      id: item.id,
      assigned_user_id: item.assigned_user_id,
      source_patient_id: item.source_patient_id,
      mrn: item.mrn,
      first_name: item.first_name,
      middle_initial: item.middle_initial,
      last_name: item.last_name,
      name: fullName(item),
      date_of_birth: item.date_of_birth,
      age: ageOf(item.date_of_birth),
      last_visit: item.last_visit,
      status: item.status,
      conditions: item.conditions,
      notes_count: state.notes.filter((entry) => entry.patient_id === item.id && !entry.deleted)
        .length,
      comments_count: discussion.length,
      unread_comments_count: discussion.filter((entry) => unread(entry, viewer)).length,
    }
  }

  function detail(item: DemoPatient, viewer: User): PatientDetail {
    return copy({ ...item, ...listItem(item, viewer) })
  }

  function noteDto(item: DemoNote): Note {
    return copy({
      id: item.id,
      patient_id: item.patient_id,
      timestamp: item.timestamp,
      content: item.content,
      author: item.author,
      created_at: item.created_at,
      updated_at: item.updated_at,
      attachments: item.attachments,
    })
  }

  function commentDto(item: DemoComment, viewer: User): Comment {
    return copy({
      id: item.id,
      patient_id: item.patient_id,
      body: item.body,
      author: item.author,
      created_at: item.created_at,
      updated_at: item.updated_at,
      is_unread: unread(item, viewer),
      note_links: item.note_ids.map((id) => {
        const linked = state.notes.find(
          (entry) => entry.id === id && entry.patient_id === item.patient_id,
        )!
        return {
          id,
          label: linked.deleted ? 'Deleted note' : linked.content.split('\n')[0]!.slice(0, 60),
          url: `/patients/${item.patient_id}/notes/${id}`,
          is_deleted: linked.deleted,
        }
      }),
    })
  }

  function checkLinks(patientId: string, ids: string[], existing: string[] = []) {
    ids.forEach((id, index) => {
      const linked = state.notes.find((entry) => entry.id === id && entry.patient_id === patientId)
      if (!linked || (linked.deleted && !existing.includes(id))) {
        invalid({ [`note_ids[${index}]`]: 'Choose an active note belonging to this patient.' })
      }
    })
  }

  function activeNotes(patientId: string): DemoNote[] {
    return state.notes
      .filter((item) => item.patient_id === patientId && !item.deleted)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || a.id.localeCompare(b.id))
  }

  return {
    async listUsers(ctx) {
      ctx?.signal?.throwIfAborted()
      return copy(state.users)
    },
    async listPatients(params, ctx) {
      const viewer = actor(ctx)
      const valid = validateList(params)
      const query = valid.q.toLocaleLowerCase('en-US')
      const matching = state.patients
        .filter((item) => {
          const haystack = [
            item.first_name,
            item.middle_initial,
            item.last_name,
            fullName(item),
            `${item.first_name} ${item.last_name}`,
            item.email,
            item.source_patient_id,
            item.mrn,
            item.id,
          ]
          return (
            haystack.some((value) => value?.toLocaleLowerCase('en-US').includes(query)) &&
            (valid.status === undefined || item.status === valid.status) &&
            (valid.assigned_to === undefined || item.assigned_user_id === viewer.id)
          )
        })
        .map((item) => listItem(item, viewer))
        .filter((item) => valid.has_unread_comments !== true || item.unread_comments_count > 0)
      const direction = valid.order === 'asc' ? 1 : -1
      matching.sort((a, b) => {
        let comparison = 0
        switch (valid.sort_by) {
          case 'name':
            comparison =
              a.last_name.localeCompare(b.last_name, 'en-US') ||
              a.first_name.localeCompare(b.first_name, 'en-US')
            break
          case 'dob':
            comparison = a.date_of_birth.localeCompare(b.date_of_birth)
            break
          case 'last_visit':
            if (a.last_visit === null || b.last_visit === null) {
              return a.last_visit === b.last_visit
                ? a.id.localeCompare(b.id)
                : a.last_visit === null
                  ? 1
                  : -1
            }
            comparison = a.last_visit.localeCompare(b.last_visit)
            break
          case 'status':
            comparison = a.status.localeCompare(b.status)
            break
          case 'notes_count':
          case 'comments_count':
            comparison = a[valid.sort_by] - b[valid.sort_by]
            break
        }
        return direction * comparison || a.id.localeCompare(b.id)
      })
      return copy(pageOf(matching, valid))
    },
    async getPatient(id, ctx) {
      const viewer = actor(ctx)
      return detail(patient(id), viewer)
    },
    async createPatient(input, ctx) {
      const viewer = actor(ctx)
      const value = validatePatient(input)
      const now = new Date().toISOString()
      const item: DemoPatient = {
        ...value,
        id: newId('patient'),
        // Server-owned workload: the creating actor is the assignee; writes never carry it.
        assigned_user_id: viewer.id,
        source_patient_id: null,
        mrn: null,
        created_at: now,
        updated_at: now,
      }
      state.patients.push(item)
      return detail(item, viewer)
    },
    async updatePatient(id, input, ctx) {
      const viewer = actor(ctx)
      const item = patient(id)
      const value = validatePatient(input)
      Object.assign(item, value, { updated_at: new Date().toISOString() })
      return detail(item, viewer)
    },
    async deletePatient(id, ctx) {
      actor(ctx)
      const item = patient(id)
      state.patients = state.patients.filter((entry) => entry !== item)
      state.notes = state.notes.filter((entry) => entry.patient_id !== id)
      state.comments = state.comments.filter((entry) => entry.patient_id !== id)
      for (const watermarks of state.lastReadByActor.values()) watermarks.delete(id)
    },
    async listNotes(id, ctx) {
      actor(ctx)
      patient(id)
      return activeNotes(id).map(noteDto)
    },
    async getNote(id, noteId, ctx) {
      actor(ctx)
      const item = note(id, noteId)
      if (item.deleted) throw new ApiError(410, 'gone', 'This note has been deleted.')
      return noteDto(item)
    },
    async createNote(id, input, ctx) {
      const author = actor(ctx)
      patient(id)
      const value = validateNote(input)
      const now = new Date().toISOString()
      const item: DemoNote = {
        ...value,
        id: newId('note'),
        patient_id: id,
        author,
        created_at: now,
        updated_at: now,
        attachments: [],
        deleted: false,
      }
      state.notes.push(item)
      return noteDto(item)
    },
    async deleteNote(id, noteId, ctx) {
      const viewer = actor(ctx)
      const item = note(id, noteId)
      if (item.deleted) notFound()
      owned(item.author, viewer)
      Object.assign(item, {
        deleted: true,
        content: '',
        attachments: [],
        updated_at: new Date().toISOString(),
      })
    },
    async getSummary(id, ctx) {
      const viewer = actor(ctx)
      const item = detail(patient(id), viewer)
      const conditions = item.conditions.length
        ? `Recorded conditions: ${item.conditions.map((entry) => entry.label).join(', ')}.`
        : 'No conditions are listed.'
      const allergies =
        item.allergy_status === 'reported'
          ? `Reported allergies: ${item.allergies.join(', ')}.`
          : item.allergy_status === 'no_known'
            ? 'No known allergies are recorded.'
            : 'Allergy status is unknown.'
      const notes = activeNotes(id).reverse()
      const narrative = notes.length
        ? notes.map((entry) => `${entry.timestamp}: ${entry.content}`).join('\n\n')
        : 'There are no clinical notes; this summary uses the profile only.'
      return {
        patient_id: id,
        summary: `${item.name}, age ${item.age}, is an ${item.status} patient. Blood type: ${item.blood_type ?? 'unknown'}. ${conditions} ${allergies}\n\n${narrative}`,
        generated_at: new Date().toISOString(),
        // Demo mode shows the AI presentation; the text itself is assembled locally.
        method: 'llm',
        model: 'gemma-3-27b',
      }
    },
    async listComments(id, params, ctx) {
      const viewer = actor(ctx)
      patient(id)
      const paging = validatePage(params)
      const now = clock()
      const cursor =
        params.cursor === undefined ? undefined : decodeDiscussionCursor(params.cursor, id, now)
      const cutoff = cursor ? timestampMicros(cursor.snapshot_at) : now
      const snapshot = state.comments
        .filter((entry) => entry.patient_id === id && timestampMicros(entry.created_at) <= cutoff)
        .sort((a, b) => {
          const difference = timestampMicros(a.created_at) - timestampMicros(b.created_at)
          return difference < 0n ? -1 : difference > 0n ? 1 : a.id.localeCompare(b.id)
        })
      const page = cursor?.page ?? paging.page
      const remaining = cursor
        ? snapshot.filter((entry) => {
            const time = timestampMicros(entry.created_at)
            const after = timestampMicros(cursor.after_created_at)
            return time > after || (time === after && entry.id > cursor.after_id)
          })
        : snapshot.slice((page - 1) * paging.page_size)
      const items = remaining.slice(0, paging.page_size)
      const more = remaining.length > items.length
      const reliable = cursor !== undefined || page === 1
      let readThrough = reliable ? timestampFromMicros(cutoff) : '0001-01-01T00:00:00.000000Z'
      let nextCursor: string | null = null
      if (reliable && more) {
        const last = items[items.length - 1]!
        const boundary = timestampMicros(last.created_at)
        const equalGroup = timestampMicros(remaining[items.length]!.created_at) === boundary
        readThrough = timestampFromMicros(equalGroup ? boundary - 1n : boundary)
        nextCursor = encodeDiscussionCursor({
          patient_id: id,
          snapshot_at: timestampFromMicros(cutoff),
          after_created_at: last.created_at,
          after_id: last.id,
          page: page + 1,
        })
      }
      return {
        items: items.map((entry) => commentDto(entry, viewer)),
        total: snapshot.length,
        page,
        page_size: paging.page_size,
        read_through: readThrough,
        next_cursor: nextCursor,
      }
    },
    async createComment(id, input, ctx) {
      const author = actor(ctx)
      patient(id)
      const value = validateComment(input)
      checkLinks(id, value.note_ids)
      const now = timestampFromMicros(clock())
      const item: DemoComment = {
        ...value,
        id: newId('comment'),
        patient_id: id,
        author,
        created_at: now,
        updated_at: now,
      }
      state.comments.push(item)
      return commentDto(item, author)
    },
    async updateComment(id, commentId, input, ctx) {
      const viewer = actor(ctx)
      const item = comment(id, commentId)
      owned(item.author, viewer)
      const value = validateComment(input)
      checkLinks(id, value.note_ids, item.note_ids)
      Object.assign(item, value, { updated_at: timestampFromMicros(clock()) })
      return commentDto(item, viewer)
    },
    async deleteComment(id, commentId, ctx) {
      const viewer = actor(ctx)
      const item = comment(id, commentId)
      owned(item.author, viewer)
      state.comments = state.comments.filter((entry) => entry !== item)
    },
    async markCommentsRead(id, input, ctx) {
      const viewer = actor(ctx)
      patient(id)
      const { through } = validateDiscussionRead(input)
      const now = clock()
      const requested = timestampMicros(through)
      const bounded = requested > now ? timestampFromMicros(now) : through
      const watermarks = state.lastReadByActor.get(viewer.id)!
      const previous = watermarks.get(id)
      const last_read_at =
        previous !== undefined && timestampMicros(previous) >= timestampMicros(bounded)
          ? previous
          : bounded
      watermarks.set(id, last_read_at)
      return { patient_id: id, last_read_at }
    },
    async getNotificationSummary(ctx) {
      const viewer = actor(ctx)
      const comments = state.comments.filter((entry) => unread(entry, viewer))
      return {
        unread_comments_count: comments.length,
        patients_with_unread_comments: new Set(comments.map((entry) => entry.patient_id)).size,
      }
    },
  }
}
