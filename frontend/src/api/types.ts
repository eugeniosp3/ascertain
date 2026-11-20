export type PatientStatus = 'active' | 'inactive'
export type AllergyStatus = 'unknown' | 'no_known' | 'reported'

export interface Condition {
  code: string | null
  label: string
}

export interface User {
  id: string
  display_name: string
  display_role?: string | null
}

export interface PatientListItem {
  id: string
  // Stored workload membership (a user ID or unassigned): read-only, never writable or access control.
  readonly assigned_user_id: string | null
  source_patient_id: string | null
  mrn: string | null
  first_name: string
  middle_initial: string | null
  last_name: string
  name: string
  date_of_birth: string
  age: number
  last_visit: string | null
  status: PatientStatus
  conditions: Condition[]
  notes_count: number
  comments_count: number
  unread_comments_count: number
}

// Imported sections describe the source snapshot, never writable current clinical state.
export interface IdentityProfile {
  readonly age_years: number
  readonly sex_at_birth: string
  readonly gender_identity: string
  readonly race: string
  readonly ethnicity: string
  readonly preferred_language: string
  readonly interpreter_needed: boolean
  readonly marital_status: string
  readonly employment_status: string
}

export interface ContactProfile {
  readonly home_phone: string | null
  readonly mobile_phone: string | null
  readonly emergency_contact_name: string
  readonly emergency_contact_relationship: string
  readonly emergency_contact_phone: string
}

export interface CareTeamProfile {
  readonly pcp_name: string
  readonly pcp_npi: string
  readonly home_facility_key: string
  readonly first_registered_date: string
}

export interface CoverageProfile {
  readonly primary_payer_name: string
  readonly primary_line_of_business: string
  readonly primary_plan_name: string
  readonly primary_plan_type: string
  readonly primary_member_id: string
  readonly primary_group_number: string | null
  readonly primary_coverage_effective_date: string
  readonly secondary_payer_name: string | null
  readonly secondary_member_id: string | null
}

// Decimal source measurements stay exact decimal strings, with units in field names/docs.
export interface ClinicalProfile {
  readonly primary_clinical_story: string
  readonly height_cm: string
  readonly weight_kg: string
  readonly bmi: string
  readonly smoking_status: string
  readonly alcohol_use: string
  readonly has_hypertension: boolean
  readonly has_diabetes: string
  readonly has_ckd: boolean
  readonly has_copd: boolean
  readonly has_heart_failure: boolean
  readonly has_cad: boolean
  readonly has_afib: boolean
  readonly has_osa: boolean
  readonly has_depression: boolean
  readonly has_obesity: boolean
  readonly has_cancer_history: boolean
  readonly charlson_comorbidity_index: number
  readonly active_medications: string | null
}

export interface LabsProfile {
  readonly last_labs_date: string
  readonly last_hba1c_pct: string
  readonly last_egfr: number
  readonly last_creatinine_mg_dl: string
  readonly last_ldl_mg_dl: number
  readonly last_hemoglobin_g_dl: string
  readonly hospitalizations_12mo: number
  readonly ed_visits_12mo: number
}

export interface SocialProfile {
  readonly housing_status: string
  readonly transportation_barrier: boolean
  readonly advance_directive_on_file: boolean
  readonly code_status: string
  readonly pa_request_count: number
}

export interface ProfileDetails {
  readonly identity?: IdentityProfile
  readonly contact?: ContactProfile
  readonly care_team?: CareTeamProfile
  readonly coverage?: CoverageProfile
  readonly clinical?: ClinicalProfile
  readonly labs?: LabsProfile
  readonly social?: SocialProfile
}

export interface PatientDetail extends PatientListItem {
  phone: string | null
  email: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  blood_type: string | null
  allergies: string[]
  allergy_status: AllergyStatus
  created_at: string
  updated_at: string
  readonly profile_details?: ProfileDetails
  readonly source_lineage?: SourceLineage | null
  readonly source_created_at?: string | null
  readonly source_updated_at?: string | null
}

export interface SourceLineage {
  readonly bronze_id: string
  readonly silver_id: string
  readonly source_row_number: number
  readonly export_id: string | null
  readonly source_file_id: string | null
  readonly transformation_version: string | null
}

export interface PatientWrite {
  first_name: string
  middle_initial: string | null
  last_name: string
  date_of_birth: string
  phone: string | null
  email: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  blood_type: string | null
  status: PatientStatus
  last_visit: string | null
  conditions: Condition[]
  allergies: string[]
  allergy_status: AllergyStatus
}

export interface PatientListParams {
  q?: string
  status?: PatientStatus
  // 'me' narrows to the selected actor's assigned cohort before totals and paging; omit it for
  // the shared directory.
  assigned_to?: 'me'
  sort_by?: 'name' | 'dob' | 'last_visit' | 'status' | 'notes_count' | 'comments_count'
  order?: 'asc' | 'desc'
  page?: number
  page_size?: number
  has_unread_comments?: boolean
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface NoteAttachment {
  id: string
  display_name: string
  source_url: string
  media_type?: string | null
  source_description?: string | null
}

export interface Note {
  id: string
  patient_id: string
  timestamp: string
  content: string
  title?: string
  author: User
  created_at: string
  updated_at: string
  attachments: NoteAttachment[]
}

export interface NoteWrite {
  timestamp: string
  content: string
}

export interface Comment {
  id: string
  patient_id: string
  body: string
  author: User
  created_at: string
  updated_at: string
  is_unread: boolean
  note_links: Array<{
    id: string
    title?: string
    label: string
    timestamp?: string
    url: string
    is_deleted: boolean
  }>
}

export interface CommentWrite {
  body: string
  note_ids: string[]
}

export interface CommentPageParams {
  page?: number
  page_size?: number
  cursor?: string
}

export interface CommentPage extends Page<Comment> {
  read_through: string
  next_cursor: string | null
}

export interface DiscussionReadInput {
  through: string
}

export interface PatientSummary {
  patient_id: string
  summary: string
  generated_at: string
  /** `llm`: written by a language model. `template`: the deterministic fallback. */
  method: 'llm' | 'template'
  /** The model behind an `llm` summary, for example "gemma-3-27b". */
  model?: string
}

export interface NotificationSummary {
  unread_comments_count: number
  patients_with_unread_comments: number
}

export interface ReadReceipt {
  patient_id: string
  last_read_at: string
}

export interface RequestContext {
  actorId?: string
  signal?: AbortSignal
}

export interface DashboardApi {
  listUsers(ctx?: RequestContext): Promise<User[]>
  listPatients(params: PatientListParams, ctx?: RequestContext): Promise<Page<PatientListItem>>
  getPatient(id: string, ctx?: RequestContext): Promise<PatientDetail>
  createPatient(input: PatientWrite, ctx?: RequestContext): Promise<PatientDetail>
  updatePatient(id: string, input: PatientWrite, ctx?: RequestContext): Promise<PatientDetail>
  deletePatient(id: string, ctx?: RequestContext): Promise<void>
  listNotes(patientId: string, ctx?: RequestContext): Promise<Note[]>
  getNote(patientId: string, noteId: string, ctx?: RequestContext): Promise<Note>
  createNote(patientId: string, input: NoteWrite, ctx?: RequestContext): Promise<Note>
  deleteNote(patientId: string, noteId: string, ctx?: RequestContext): Promise<void>
  getSummary(patientId: string, ctx?: RequestContext): Promise<PatientSummary>
  listComments(
    patientId: string,
    params: CommentPageParams,
    ctx?: RequestContext,
  ): Promise<CommentPage>
  createComment(patientId: string, input: CommentWrite, ctx?: RequestContext): Promise<Comment>
  updateComment(
    patientId: string,
    commentId: string,
    input: CommentWrite,
    ctx?: RequestContext,
  ): Promise<Comment>
  deleteComment(patientId: string, commentId: string, ctx?: RequestContext): Promise<void>
  markCommentsRead(
    patientId: string,
    input: DiscussionReadInput,
    ctx?: RequestContext,
  ): Promise<ReadReceipt>
  getNotificationSummary(ctx?: RequestContext): Promise<NotificationSummary>
}
