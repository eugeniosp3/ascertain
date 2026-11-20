"""Column definitions for patients_100.csv (one row per patient)."""
from .schema import Schema

PATIENT_SCHEMA = Schema("Patient master")

PATIENT_SCHEMA.group("Identity", [
    ("patient_id", "string", "Unique key for the patient in this dataset. Links to prior_auth_requests_master.csv.", "PT-0001 to PT-0100"),
    ("mrn", "string", "Medical record number assigned by the hospital system when the patient first registered.", "8 digits"),
    ("first_name", "string", "Legal first name."),
    ("middle_initial", "string", "Middle initial; blank if none."),
    ("last_name", "string", "Legal last name."),
    ("date_of_birth", "date", "Date of birth.", "YYYY-MM-DD"),
    ("age_years", "integer", "Age in whole years on the dataset date (2026-11-18)."),
    ("sex_at_birth", "enum", "Sex recorded at birth, as payers require for eligibility matching.", "F / M"),
    ("gender_identity", "enum", "Self-reported gender identity.", "Woman / Man / Non-binary / Declined"),
    ("race", "enum", "Self-reported race using the OMB categories."),
    ("ethnicity", "enum", "Self-reported ethnicity using the OMB categories.", "Hispanic or Latino / Not Hispanic or Latino"),
    ("preferred_language", "string", "Language the patient prefers for care and written material."),
    ("interpreter_needed", "flag", "Y if a medical interpreter is needed.", "Y / N"),
    ("marital_status", "enum", "Marital status from registration."),
    ("employment_status", "enum", "Employment status from registration; helps explain the coverage type."),
])
PATIENT_SCHEMA.group("Contact", [
    ("address_line1", "string", "Street address (invented)."),
    ("city", "string", "City."),
    ("state", "string", "Two-letter state.", "USPS"),
    ("zip", "string", "5-digit ZIP code."),
    ("home_phone", "string", "Home phone; 555-01xx numbers are reserved for fiction."),
    ("mobile_phone", "string", "Mobile phone used for text reminders."),
    ("email", "string", "Fake email at example.com, which cannot receive mail."),
    ("emergency_contact_name", "string", "Emergency contact."),
    ("emergency_contact_relationship", "string", "Relationship of the emergency contact."),
    ("emergency_contact_phone", "string", "Emergency contact phone."),
])
PATIENT_SCHEMA.group("Care team and registration", [
    ("pcp_name", "string", "Primary care physician of record."),
    ("pcp_npi", "string", "PCP National Provider Identifier (random, check-digit valid).", "10 digits"),
    ("pcp_last_visit_date", "date", "Date of the last PCP visit.", "YYYY-MM-DD"),
    ("home_facility_key", "string", "Short code for the hospital the patient mostly uses (see facility_name in the requests file)."),
    ("first_registered_date", "date", "Date the patient first registered with the health system.", "YYYY-MM-DD"),
])
PATIENT_SCHEMA.group("Coverage on file", [
    ("primary_payer_name", "string", "Insurer on the registration record."),
    ("primary_line_of_business", "enum", "Commercial / Medicare Advantage / Medicaid Managed Care / ACA Marketplace."),
    ("primary_plan_name", "string", "Specific plan product."),
    ("primary_plan_type", "enum", "HMO / PPO / EPO / POS / HMO-POS."),
    ("primary_member_id", "string", "Member ID printed on the insurance card."),
    ("primary_group_number", "string", "Employer group number; blank for individual, Medicare and Medicaid coverage."),
    ("primary_coverage_effective_date", "date", "Date the current coverage began.", "YYYY-MM-DD"),
    ("secondary_payer_name", "string", "Second insurer, if any (for example a Medicare supplement or spouse's plan)."),
    ("secondary_member_id", "string", "Member ID for the second insurer."),
])
PATIENT_SCHEMA.group("Clinical profile", [
    ("primary_clinical_story", "string", "Plain label for the main condition driving the patient's authorization requests. Not a real chart field; added to make the data easy to follow."),
    ("height_cm", "decimal", "Height.", "centimetres"),
    ("weight_kg", "decimal", "Weight at the most recent measurement.", "kilograms"),
    ("bmi", "decimal", "Body mass index.", "kg/m2"),
    ("smoking_status", "enum", "Never / Former / Current."),
    ("alcohol_use", "enum", "None / Social / Moderate / Heavy."),
    ("problem_list_icd10", "code", "Active diagnoses as ICD-10-CM codes, separated by semicolons.", "semicolon list"),
    ("problem_list_text", "text", "Plain-language names matching problem_list_icd10, in the same order."),
    ("has_hypertension", "flag", "Hypertension on the problem list.", "Y / N"),
    ("has_diabetes", "enum", "None / Type 1 / Type 2."),
    ("has_ckd", "flag", "Chronic kidney disease stage 3 or worse.", "Y / N"),
    ("has_copd", "flag", "COPD.", "Y / N"),
    ("has_heart_failure", "flag", "Heart failure.", "Y / N"),
    ("has_cad", "flag", "Coronary artery disease.", "Y / N"),
    ("has_afib", "flag", "Atrial fibrillation.", "Y / N"),
    ("has_osa", "flag", "Obstructive sleep apnea diagnosed.", "Y / N"),
    ("has_depression", "flag", "Depression on the problem list.", "Y / N"),
    ("has_obesity", "flag", "BMI 30 or higher.", "Y / N"),
    ("has_cancer_history", "flag", "Active or past cancer.", "Y / N"),
    ("charlson_comorbidity_index", "integer", "Simplified Charlson score: higher means more chronic illness burden."),
    ("active_medications", "text", "Current medicines with dose and schedule, separated by semicolons."),
    ("drug_allergies", "text", "Drug allergies and reaction, or 'NKDA' (no known drug allergies)."),
])
PATIENT_SCHEMA.group("Recent labs and utilization", [
    ("last_labs_date", "date", "Date of the most recent lab panel.", "YYYY-MM-DD"),
    ("last_hba1c_pct", "decimal", "Hemoglobin A1c, the 3-month blood sugar average.", "percent"),
    ("last_egfr", "integer", "Estimated glomerular filtration rate, a kidney function measure.", "mL/min/1.73m2"),
    ("last_creatinine_mg_dl", "decimal", "Serum creatinine.", "mg/dL"),
    ("last_ldl_mg_dl", "integer", "LDL cholesterol.", "mg/dL"),
    ("last_hemoglobin_g_dl", "decimal", "Hemoglobin.", "g/dL"),
    ("hospitalizations_12mo", "integer", "Inpatient admissions in the 12 months before the dataset date."),
    ("ed_visits_12mo", "integer", "Emergency department visits in the 12 months before the dataset date."),
])
PATIENT_SCHEMA.group("Social and administrative", [
    ("housing_status", "enum", "Stable / Unstable / Lives with family."),
    ("transportation_barrier", "flag", "Y if the patient reports trouble getting to appointments.", "Y / N"),
    ("advance_directive_on_file", "flag", "Y if an advance directive is in the chart.", "Y / N"),
    ("code_status", "enum", "Full code / DNR / Not documented."),
    ("pa_request_count", "integer", "Number of rows for this patient in prior_auth_requests_master.csv (derived)."),
])
PATIENT_SCHEMA.group("System audit fields", [
    ("created_at", "datetime", "When this patient row was first created in the registration system (the patient's first registration).", "UTC, ISO 8601, e.g. 2021-03-04T14:22:31Z"),
    ("updated_at", "datetime", "When this patient row was last changed (new lab, visit, coverage change or a new authorization request). Never earlier than created_at.", "UTC, ISO 8601"),
])
