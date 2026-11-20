# Data dictionary: prior authorization practice data

Two files, both **synthetic** (no real patients). Dataset date: **2026-11-18**.

| File | Rows | Columns | One row is... |
|---|---|---|---|
| `data/patients_100.csv` | 100 | 76 | one patient |
| `data/prior_auth_requests_master.csv` | 138 | 382 | one authorization request (a patient has 1 or more) |
| `data/data_dictionary.csv` | 458 | 12 | one column of the two files above (same content as this page, for sorting and filtering) |

**Link between the files:** `patient_id`. **Link inside the requests file:** `related_request_id` points to the earlier request in the same care plan.

**Blank cells** in the requests file mean "does not apply to this kind of request" (a knee replacement has no PD-L1 score). They do not mean missing data. The *Filled* column shows how many rows have a value.

**Dates and times:** dates are `YYYY-MM-DD`; timestamps are `YYYY-MM-DDTHH:MM:SSZ` in UTC. **Money** is US dollars. **Codes** are real code systems (ICD-10-CM, CPT, HCPCS, MS-DRG, UB-04 revenue codes, CMS place-of-service) but the *combinations* are invented. NDC drug codes, policy numbers, member IDs, NPIs and tax IDs are random and not assigned to anyone on purpose.

## How to read the privacy tags

HIPAA does not use the term "PII". It protects **PHI** (protected health information): health information that can be tied to a specific person. The rule for de-identifying data (the "Safe Harbor" method, 45 CFR 164.514(b)(2)) lists **18 identifiers** that must be removed, and they apply to the patient **and to the patient's relatives, employers and household members**. Every tag below follows that list.

| Tag in tables | Meaning | Count |
|---|---|---|
| **ID (A)** to **ID (R)** | One of the HIPAA identifiers. The letter is the item number in the regulation. Treat as PII *and* PHI. | 72 |
| QUASI | Not on the list, but combinations (age + sex + rare condition + small town) can single someone out. | 19 |
| HEALTH | Diagnoses, treatments, results, coverage and payment facts. Not identifiers alone, but PHI the moment they sit on a row tied to a person. | 312 |
| TEXT | Free-text narrative. Can accidentally contain names, dates or places, so it must be scrubbed before sharing. | 11 |
| NONE | Describes a doctor's office, facility, payer rule or staff member, not the patient. | 44 |

**The 18 Safe Harbor identifiers** (the ones that appear in this data are marked *used*):

| Item | Identifier | In this data? |
|---|---|---|
| (A) | Names | **used** |
| (B) | Geographic areas smaller than a state: street address, city, county, ZIP (first 3 digits allowed only if the area has over 20,000 people) | **used** |
| (C) | All elements of dates except year, if tied to the person: birth, admission, discharge, death, **service dates and record timestamps**; and all ages over 89 | **used** |
| (D) | Telephone numbers | **used** |
| (E) | Fax numbers (the patient's own) | no |
| (F) | Email addresses | **used** |
| (G) | Social Security numbers | no |
| (H) | Medical record numbers | **used** |
| (I) | Health plan beneficiary numbers (member IDs) | **used** |
| (J) | Account numbers | no |
| (K) | Certificate or license numbers | no |
| (L) | Vehicle identifiers and license plates | no |
| (M) | Device identifiers and serial numbers | no |
| (N) | Web URLs | no |
| (O) | IP addresses | no |
| (P) | Biometric identifiers (fingerprints, voice prints) | no |
| (Q) | Full-face photographs and comparable images | no |
| (R) | Any other unique identifying number, characteristic or code (patient IDs, request IDs, authorization numbers, employer group numbers) | **used** |

**About `created_at` and `updated_at`.** These are timestamps on a row about a patient, so they fall under item (C): they reveal when that person registered, was authorized or was treated. Under Safe Harbor you would drop them or keep only the year. This is the conservative reading; your privacy officer makes the final call. A timestamp on a row that is *not* tied to a person (for example a payer-rule table) would not be PHI.

**Not in this data on purpose:** Social Security numbers (G), patient fax numbers (E), photos (Q), biometrics (P), URLs (N), IP addresses (O), device serial numbers (M), vehicle IDs (L), license numbers (K) and account numbers (J). Real authorization work almost never needs them. No age is above 89 (ages 90+ would have to be grouped as "90 or older").

**All people, plans and hospitals here are invented.** The tags describe what each field *would be* if this were a real extract.

## Service keys (`service_key`)

| Key | Request category | Code | Code system | What it is | Rule set used by the payer |
|---|---|---|---|---|---|
| `MRI_LSPINE` | Advanced imaging | 72148 | CPT | MRI lumbar spine without contrast | Payer radiology guideline based on ACR Appropriateness Criteria |
| `MRI_KNEE` | Advanced imaging | 73721 | CPT | MRI any joint of lower extremity (knee) without contrast | Payer radiology guideline based on ACR Appropriateness Criteria |
| `ESI` | Outpatient procedure | 62323 | CPT | Lumbar epidural steroid injection with imaging guidance | Payer medical policy: epidural steroid injections |
| `TKA` | Surgery | 27447 | CPT | Total knee arthroplasty (knee replacement) | Payer medical policy: total joint arthroplasty |
| `THA` | Surgery | 27130 | CPT | Total hip arthroplasty (hip replacement) | Payer medical policy: total joint arthroplasty |
| `FUSION` | Surgery | 22612 | CPT | Posterolateral lumbar spinal fusion, single interspace | Payer medical policy: lumbar spinal fusion |
| `PT` | Therapy | 97110 | CPT | Outpatient physical therapy: therapeutic exercise program | Payer medical policy: outpatient rehabilitation therapy |
| `ADALIMUMAB` | Pharmacy drug | NDC (see rx_ndc) | NDC | Adalimumab 40 mg/0.4 mL autoinjector pen (self-administered) | Payer pharmacy policy: TNF blockers (step therapy) |
| `USTEKINUMAB` | Specialty drug (medical benefit) | J3358 | HCPCS | Ustekinumab IV induction dose, 1 mg | Payer medical policy: IL-12/23 inhibitors; site-of-care policy |
| `OCRELIZUMAB` | Specialty drug (medical benefit) | J2350 | HCPCS | Ocrelizumab injection, 1 mg (600 mg IV every 6 months) | Payer medical policy: anti-CD20 therapy for multiple sclerosis |
| `SEMAGLUTIDE` | Pharmacy drug | NDC (see rx_ndc) | NDC | Semaglutide weekly injection pen (self-administered) | Payer pharmacy policy: GLP-1 receptor agonists |
| `PET_CT` | Advanced imaging | 78815 | CPT | PET with concurrent CT, skull base to mid-thigh | Payer radiology policy: PET imaging in oncology (NCCN-aligned) |
| `PEMBROLIZUMAB` | Specialty drug (medical benefit) | J9271 | HCPCS | Pembrolizumab injection, 1 mg (200 mg every 3 weeks) | NCCN guidelines (payer-recognized compendium) |
| `BRCA_TEST` | Genetic testing | 81162 | CPT | BRCA1/BRCA2 full sequence and deletion/duplication analysis | Payer genetic testing policy (NCCN testing criteria) |
| `SLEEP_STUDY` | Diagnostic testing | 95810 | CPT | Attended in-lab polysomnography (overnight sleep study) | Payer medical policy: sleep testing (AASM-aligned) |
| `CPAP` | DME | E0601 | HCPCS | Continuous positive airway pressure (CPAP) device, initial rental | Medicare-style PAP coverage rule (many payers copy it) |
| `CPAP_CONT` | DME | E0601 | HCPCS | CPAP device, continued rental after 90-day adherence check | Medicare-style PAP coverage rule (many payers copy it) |
| `CGM` | DME | E2103 | HCPCS | Continuous glucose monitor receiver (non-adjunctive) | Medicare-style CGM coverage rule (many payers copy it) |
| `SPECT_MPI` | Cardiac diagnostics | 78452 | CPT | Myocardial perfusion SPECT, multiple studies (stress nuclear test) | Appropriate Use Criteria for cardiac imaging |
| `CARDIAC_CATH` | Cardiac procedure | 93458 | CPT | Left heart catheterization with coronary angiography | Appropriate Use Criteria for coronary revascularization |
| `PCI` | Cardiac procedure | 92928 | CPT | Percutaneous coronary intervention with stent, single major vessel | Appropriate Use Criteria for coronary revascularization |
| `TAVR` | Surgery | 33361 | CPT | Transcatheter aortic valve replacement, percutaneous femoral approach | Medicare national coverage rule for TAVR (payers follow it) |
| `BARIATRIC` | Surgery | 43775 | CPT | Laparoscopic sleeve gastrectomy (weight-loss surgery) | Payer medical policy: bariatric surgery |
| `INPT_ADMIT` | Inpatient admission | NDC (see rx_ndc) | MS-DRG (expected) | Inpatient admission notification and initial clinical review | InterQual or MCG inpatient criteria (licensed; not reproduced) |
| `INPT_CONT_STAY` | Inpatient continued stay | NDC (see rx_ndc) | MS-DRG (expected) | Concurrent review: continued inpatient days | InterQual or MCG continued-stay criteria (licensed; not reproduced) |
| `IRF_ADMIT` | Post-acute care | 0128 | Revenue code | Inpatient rehabilitation facility admission after stroke | Medicare IRF coverage criteria (payers follow them) |

## Patient file columns

### Identity

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `patient_id` | string | **ID (R)** | Unique key for the patient in this dataset. Links to prior_auth_requests_master.csv. | PT-0001 to PT-0100 | 100% | PT-0001 |
| `mrn` | string | **ID (H)** | Medical record number assigned by the hospital system when the patient first registered. | 8 digits | 100% | 17363971 |
| `first_name` | string | **ID (A)** | Legal first name. |  | 100% | Ann |
| `middle_initial` | string | **ID (A)** | Middle initial; blank if none. |  | 74% | D |
| `last_name` | string | **ID (A)** | Legal last name. |  | 100% | Thomas |
| `date_of_birth` | date | **ID (C)** | Date of birth. | YYYY-MM-DD | 100% | 1948-05-10 |
| `age_years` | integer | QUASI | Age in whole years on the dataset date (2026-11-18). |  | 100% | 78 |
| `sex_at_birth` | enum | QUASI | Sex recorded at birth, as payers require for eligibility matching. *Values in this data:* F (52); M (48). | F / M | 100% | F |
| `gender_identity` | enum | QUASI | Self-reported gender identity. *Values in this data:* Woman (51); Man (47); Declined (1); Non-binary (1). | Woman / Man / Non-binary / Declined | 100% | Declined |
| `race` | enum | QUASI | Self-reported race using the OMB categories. *Values in this data:* White (66); Black or African American (22); Two or more races (6); Declined to answer (4); Asian (2). |  | 100% | White |
| `ethnicity` | enum | QUASI | Self-reported ethnicity using the OMB categories. *Values in this data:* Not Hispanic or Latino (81); Hispanic or Latino (19). | Hispanic or Latino / Not Hispanic or Latino | 100% | Not Hispanic or Latino |
| `preferred_language` | string | QUASI | Language the patient prefers for care and written material. |  | 100% | English |
| `interpreter_needed` | flag | QUASI | Y if a medical interpreter is needed. *Values in this data:* N (95); Y (5). | Y / N | 100% | N |
| `marital_status` | enum | QUASI | Marital status from registration. *Values in this data:* Married (52); Single (18); Widowed (15); Divorced (15). |  | 100% | Married |
| `employment_status` | enum | QUASI | Employment status from registration; helps explain the coverage type. *Values in this data:* Employed full-time (43); Retired (31); Part-time (10); Disabled (7); Self-employed (5); Unemployed (4). |  | 100% | Retired |

### Contact

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `address_line1` | string | **ID (B)** | Street address (invented). |  | 100% | 6360 Sunset Ln |
| `city` | string | **ID (B)** | City. |  | 100% | Cincinnati |
| `state` | string | QUASI | Two-letter state. | USPS | 100% | OH |
| `zip` | string | **ID (B)** | 5-digit ZIP code. |  | 100% | 45202 |
| `home_phone` | string | **ID (D)** | Home phone; 555-01xx numbers are reserved for fiction. |  | 100% | (513) 555-0154 |
| `mobile_phone` | string | **ID (D)** | Mobile phone used for text reminders. |  | 100% | (513) 555-0185 |
| `email` | string | **ID (F)** | Fake email at example.com, which cannot receive mail. |  | 100% | ann.thomas25@example.com |
| `emergency_contact_name` | string | **ID (A)** | Emergency contact. |  | 100% | Elizabeth Thomas |
| `emergency_contact_relationship` | string | QUASI | Relationship of the emergency contact. |  | 100% | Spouse |
| `emergency_contact_phone` | string | **ID (D)** | Emergency contact phone. |  | 100% | (513) 555-0153 |

### Care team and registration

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `pcp_name` | string | NONE | Primary care physician of record. |  | 100% | Dr. Luis Ruiz, MD |
| `pcp_npi` | string | NONE | PCP National Provider Identifier (random, check-digit valid). | 10 digits | 100% | 2483904829 |
| `pcp_last_visit_date` | date | **ID (C)** | Date of the last PCP visit. | YYYY-MM-DD | 100% | 2026-09-07 |
| `home_facility_key` | string | HEALTH | Short code for the hospital the patient mostly uses (see facility_name in the requests file). |  | 100% | ROS |
| `first_registered_date` | date | **ID (C)** | Date the patient first registered with the health system. | YYYY-MM-DD | 100% | 2020-01-22 |

### Coverage on file

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `primary_payer_name` | string | HEALTH | Insurer on the registration record. |  | 100% | Pinnacle Medicare Advantage |
| `primary_line_of_business` | enum | HEALTH | Commercial / Medicare Advantage / Medicaid Managed Care / ACA Marketplace. *Values in this data:* Commercial (41); Medicare Advantage (36); Medicaid Managed Care (13); ACA Marketplace (10). |  | 100% | Medicare Advantage |
| `primary_plan_name` | string | HEALTH | Specific plan product. |  | 100% | Pinnacle Gold HMO-POS |
| `primary_plan_type` | enum | HEALTH | HMO / PPO / EPO / POS / HMO-POS. *Values in this data:* PPO (34); HMO (24); HMO-POS (20); EPO (15); POS (7). |  | 100% | HMO-POS |
| `primary_member_id` | string | **ID (I)** | Member ID printed on the insurance card. |  | 100% | PMA431662011 |
| `primary_group_number` | string | **ID (R)** | Employer group number; blank for individual, Medicare and Medicaid coverage. |  | 41% | GRP506040 |
| `primary_coverage_effective_date` | date | **ID (C)** | Date the current coverage began. | YYYY-MM-DD | 100% | 2026-01-01 |
| `secondary_payer_name` | string | HEALTH | Second insurer, if any (for example a Medicare supplement or spouse's plan). |  | 8% | Harbor Medicaid Choice |
| `secondary_member_id` | string | **ID (I)** | Member ID for the second insurer. |  | 8% | HMC931582320 |

### Clinical profile

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `primary_clinical_story` | string | HEALTH | Plain label for the main condition driving the patient's authorization requests. Not a real chart field; added to make the data easy to follow. |  | 100% | Lumbar stenosis / slipped vertebra heading to spinal fusion |
| `height_cm` | decimal | HEALTH | Height. | centimetres | 100% | 162.4 |
| `weight_kg` | decimal | HEALTH | Weight at the most recent measurement. | kilograms | 100% | 72.0 |
| `bmi` | decimal | HEALTH | Body mass index. | kg/m2 | 100% | 27.3 |
| `smoking_status` | enum | HEALTH | Never / Former / Current. *Values in this data:* Never (51); Former (30); Current (19). |  | 100% | Former |
| `alcohol_use` | enum | HEALTH | None / Social / Moderate / Heavy. *Values in this data:* Social (46); None (29); Moderate (19); Heavy (6). |  | 100% | None |
| `problem_list_icd10` | code | HEALTH | Active diagnoses as ICD-10-CM codes, separated by semicolons. | semicolon list | 100% | M48.062; I10; E78.5; Z87.891 |
| `problem_list_text` | text | HEALTH | Plain-language names matching problem_list_icd10, in the same order. |  | 100% | Spinal stenosis, lumbar region with neurogenic claudicati... |
| `has_hypertension` | flag | HEALTH | Hypertension on the problem list. *Values in this data:* N (54); Y (46). | Y / N | 100% | Y |
| `has_diabetes` | enum | HEALTH | None / Type 1 / Type 2. *Values in this data:* None (72); Type 2 (26); Type 1 (2). |  | 100% | None |
| `has_ckd` | flag | HEALTH | Chronic kidney disease stage 3 or worse. *Values in this data:* N (85); Y (15). | Y / N | 100% | N |
| `has_copd` | flag | HEALTH | COPD. *Values in this data:* N (88); Y (12). | Y / N | 100% | N |
| `has_heart_failure` | flag | HEALTH | Heart failure. *Values in this data:* N (92); Y (8). | Y / N | 100% | N |
| `has_cad` | flag | HEALTH | Coronary artery disease. *Values in this data:* N (87); Y (13). | Y / N | 100% | N |
| `has_afib` | flag | HEALTH | Atrial fibrillation. *Values in this data:* N (96); Y (4). | Y / N | 100% | N |
| `has_osa` | flag | HEALTH | Obstructive sleep apnea diagnosed. *Values in this data:* N (74); Y (26). | Y / N | 100% | N |
| `has_depression` | flag | HEALTH | Depression on the problem list. *Values in this data:* N (86); Y (14). | Y / N | 100% | N |
| `has_obesity` | flag | HEALTH | BMI 30 or higher. *Values in this data:* Y (56); N (44). | Y / N | 100% | N |
| `has_cancer_history` | flag | HEALTH | Active or past cancer. *Values in this data:* N (94); Y (6). | Y / N | 100% | N |
| `charlson_comorbidity_index` | integer | HEALTH | Simplified Charlson score: higher means more chronic illness burden. |  | 100% | 3 |
| `active_medications` | text | HEALTH | Current medicines with dose and schedule, separated by semicolons. |  | 100% | Losartan 50 mg daily; Atorvastatin 40 mg nightly; Acetami... |
| `drug_allergies` | text | HEALTH | Drug allergies and reaction, or 'NKDA' (no known drug allergies). |  | 100% | NKDA |

### Recent labs and utilization

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `last_labs_date` | date | **ID (C)** | Date of the most recent lab panel. | YYYY-MM-DD | 100% | 2026-10-31 |
| `last_hba1c_pct` | decimal | HEALTH | Hemoglobin A1c, the 3-month blood sugar average. | percent | 100% | 5.3 |
| `last_egfr` | integer | HEALTH | Estimated glomerular filtration rate, a kidney function measure. | mL/min/1.73m2 | 100% | 58 |
| `last_creatinine_mg_dl` | decimal | HEALTH | Serum creatinine. | mg/dL | 100% | 1.14 |
| `last_ldl_mg_dl` | integer | HEALTH | LDL cholesterol. | mg/dL | 100% | 128 |
| `last_hemoglobin_g_dl` | decimal | HEALTH | Hemoglobin. | g/dL | 100% | 13.3 |
| `hospitalizations_12mo` | integer | HEALTH | Inpatient admissions in the 12 months before the dataset date. |  | 100% | 0 |
| `ed_visits_12mo` | integer | HEALTH | Emergency department visits in the 12 months before the dataset date. |  | 100% | 0 |

### Social and administrative

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `housing_status` | enum | HEALTH | Stable / Unstable / Lives with family. *Values in this data:* Stable (74); Lives with family (19); Unstable (7). |  | 100% | Unstable |
| `transportation_barrier` | flag | HEALTH | Y if the patient reports trouble getting to appointments. *Values in this data:* N (97); Y (3). | Y / N | 100% | N |
| `advance_directive_on_file` | flag | HEALTH | Y if an advance directive is in the chart. *Values in this data:* N (80); Y (20). | Y / N | 100% | N |
| `code_status` | enum | HEALTH | Full code / DNR / Not documented. *Values in this data:* Full code (86); Not documented (8); DNR (6). |  | 100% | Full code |
| `pa_request_count` | integer | HEALTH | Number of rows for this patient in prior_auth_requests_master.csv (derived). |  | 100% | 2 |

### System audit fields

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `created_at` | datetime | **ID (C)** | When this patient row was first created in the registration system (the patient's first registration). | UTC, ISO 8601, e.g. 2021-03-04T14:22:31Z | 100% | 2020-01-22T13:22:16Z |
| `updated_at` | datetime | **ID (C)** | When this patient row was last changed (new lab, visit, coverage change or a new authorization request). Never earlier than created_at. | UTC, ISO 8601 | 100% | 2026-10-31T11:14:00Z |

## Request file columns

### 1. Request and workflow

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `pa_request_id` | string | **ID (R)** | Unique ID of the authorization request (the work item). | PA-2026-000001 | 100% | PA-2026-000001 |
| `related_request_id` | string | **ID (R)** | Earlier request this one follows (continued stay after an admission, extension, or the next step in a care plan). Blank if none. |  | 28% | PA-2026-000001 |
| `patient_id` | string | **ID (R)** | Patient this request is for. Links to patients_100.csv. |  | 100% | PT-0090 |
| `request_type` | enum | HEALTH | Initial = first request; Concurrent = review while the patient is still in the hospital; Extension = more of the same service; Resubmission = a corrected request after a denial. *Values in this data:* Initial (129); Resubmission (3); Extension (3); Concurrent (3). |  | 100% | Initial |
| `request_category` | enum | HEALTH | Broad group used to route work: imaging, surgery, specialty drug, DME, genetic testing, inpatient, post-acute, therapy, cardiac. *Values in this data:* Advanced imaging (24); Surgery (22); Pharmacy drug (18); Specialty drug (medical benefit) (11); Inpatient admission (10); Therapy (9); DME (8); Cardiac diagnostics (7); Cardiac procedure (7); Outpatient procedure (6); Diagnostic testing (6); Genetic testing (4). |  | 100% | Inpatient admission |
| `service_key` | string | HEALTH | Short internal code for the service (for example TKA = total knee replacement). See the service table in the dictionary. |  | 100% | INPT_ADMIT |
| `urgency` | enum | HEALTH | Standard or Expedited. Expedited means waiting could seriously harm the patient; payers must answer faster. *Values in this data:* Standard (108); Expedited (30). | Standard / Expedited | 100% | Expedited |
| `urgency_reason` | text | TEXT | Why the request was marked expedited; blank for standard. |  | 22% | Patient is currently in the hospital |
| `request_source` | enum | HEALTH | Where the work item came from: surgeon's scheduling office, ED/inpatient case management, pharmacy, clinic order. *Values in this data:* Physician office order (69); Surgeon scheduling office (35); Pharmacy (18); ED / inpatient case management (16). |  | 100% | ED / inpatient case management |
| `work_queue` | enum | NONE | Team queue in the hospital's authorization department. *Values in this data:* Surgical Scheduling (25); Specialty Drug & Infusion (23); Therapy & DME (23); Imaging & Diagnostics (18); Cardiology (17); Inpatient Utilization Review (16); Oncology & Genetics (16). |  | 100% | Inpatient Utilization Review |
| `assigned_specialist_id` | string | NONE | Authorization specialist working the request (staff ID, not a patient field). | PAS-01 to PAS-12 | 100% | PAS-08 |
| `received_datetime` | datetime | **ID (C)** | When the hospital received the order or work item. | UTC, ISO 8601 | 100% | 2026-01-16T03:30:00Z |
| `submitted_datetime` | datetime | **ID (C)** | When the request was sent to the payer. | UTC, ISO 8601 | 100% | 2026-01-16T04:51:50Z |
| `submission_channel` | enum | NONE | How it was sent: payer portal, X12 278 electronic transaction, FHIR prior-auth API, fax, phone. *Values in this data:* Payer portal (62); Fax (26); X12 278 electronic transaction (22); Phone (19); FHIR prior-authorization API (9). |  | 100% | X12 278 electronic transaction |
| `payer_case_number` | string | **ID (R)** | Reference number the payer assigns to the request. |  | 100% | PMA-734830408 |
| `request_status` | enum | HEALTH | Where the request stands on the dataset date (2026-11-18). *Values in this data:* Approved (113); Denied (15); Withdrawn (4); Partially approved (2); Submitted - awaiting decision (2); Denied - appeal pending (1); Pended - awaiting documentation (1). |  | 100% | Approved |
| `decision_datetime` | datetime | **ID (C)** | When the payer's first decision was issued. Blank if still waiting. | UTC, ISO 8601 | 95% | 2026-01-16T16:15:37Z |
| `turnaround_hours` | decimal | HEALTH | Hours from submission to first decision, including any time the payer waited for missing information. | hours | 95% | 11.4 |
| `payer_deadline_hours` | integer | NONE | How long this payer type has to decide: 72 hours for expedited; 168 hours (7 days) for standard Medicare Advantage and Medicaid managed care under CMS-0057-F; 360 hours (15 days) typical for commercial and marketplace plans (varies by state). | hours | 100% | 72 |
| `payer_decision_deadline` | datetime | **ID (C)** | Submission time plus payer_deadline_hours. | UTC, ISO 8601 | 100% | 2026-01-19T04:51:50Z |
| `within_timeframe` | flag | HEALTH | Y if the payer decided by the deadline, not counting time spent waiting for information the hospital owed. Blank if no decision yet. *Values in this data:* Y (129); N (2). | Y / N | 95% | Y |
| `planned_service_date` | date | **ID (C)** | Date the service or admission is scheduled for (or happened). | YYYY-MM-DD | 100% | 2026-01-15 |
| `days_submission_to_service` | integer | HEALTH | Days of lead time between submission and the planned service date. Small numbers mean pressure. |  | 100% | -1 |
| `auth_number` | string | **ID (R)** | Authorization number the payer issued. Blank if not approved. | A + 10 digits | 83% | A3748137893 |
| `auth_effective_date` | date | **ID (C)** | First day the approval is valid. | YYYY-MM-DD | 83% | 2026-01-16 |
| `auth_expiration_date` | date | **ID (C)** | Last day the approval is valid; the service must happen by then. | YYYY-MM-DD | 83% | 2026-01-18 |
| `units_approved` | integer | HEALTH | Units the payer approved (visits, doses, days, procedures). Less than units_requested means a partial approval. |  | 95% | 2 |

### 2. Patient demographics (copied from the patient record at request time)

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `mrn` | string | **ID (H)** | Hospital medical record number. |  | 100% | 39978009 |
| `patient_first_name` | string | **ID (A)** | First name as printed on the insurance card; payers match on this. |  | 100% | Richard |
| `patient_last_name` | string | **ID (A)** | Last name. |  | 100% | Ruiz |
| `patient_dob` | date | **ID (C)** | Date of birth; payers match on this. | YYYY-MM-DD | 100% | 1946-11-30 |
| `patient_age_at_request` | integer | QUASI | Age in years on the date the request was received. |  | 100% | 79 |
| `patient_sex` | enum | QUASI | Sex at birth. *Values in this data:* M (70); F (68). | F / M | 100% | M |
| `patient_race` | enum | QUASI | Self-reported race (OMB categories). *Values in this data:* White (95); Black or African American (29); Two or more races (8); Declined to answer (4); Asian (2). |  | 100% | White |
| `patient_ethnicity` | enum | QUASI | Self-reported ethnicity. *Values in this data:* Not Hispanic or Latino (114); Hispanic or Latino (24). |  | 100% | Not Hispanic or Latino |
| `patient_preferred_language` | string | QUASI | Preferred language. |  | 100% | English |
| `patient_interpreter_needed` | flag | QUASI | Y if an interpreter is needed. *Values in this data:* N (132); Y (6). | Y / N | 100% | N |
| `patient_address_line1` | string | **ID (B)** | Street address. |  | 100% | 3746 Ridge Way |
| `patient_city` | string | **ID (B)** | City. |  | 100% | Toledo |
| `patient_state` | string | QUASI | State. |  | 100% | OH |
| `patient_zip` | string | **ID (B)** | 5-digit ZIP. |  | 100% | 43614 |
| `patient_phone` | string | **ID (D)** | Best phone number for the patient. |  | 100% | (419) 555-0101 |

### 3. Coverage and eligibility

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `payer_name` | string | HEALTH | Insurance company. |  | 100% | Pinnacle Medicare Advantage |
| `line_of_business` | enum | HEALTH | Commercial / Medicare Advantage / Medicaid Managed Care / ACA Marketplace. *Values in this data:* Commercial (57); Medicare Advantage (54); Medicaid Managed Care (15); ACA Marketplace (12). |  | 100% | Medicare Advantage |
| `plan_name` | string | HEALTH | Specific plan product. |  | 100% | Pinnacle Gold HMO-POS |
| `plan_type` | enum | HEALTH | HMO / PPO / EPO / POS / HMO-POS. *Values in this data:* PPO (48); HMO-POS (31); HMO (31); EPO (19); POS (9). |  | 100% | HMO-POS |
| `member_id` | string | **ID (I)** | Member ID on the card. |  | 100% | PMA347219645 |
| `group_number` | string | **ID (R)** | Employer group number (commercial only). |  | 41% | GRP466481 |
| `subscriber_relationship` | enum | QUASI | Patient's relationship to the policyholder: Self, Spouse or Child. *Values in this data:* Self (138). |  | 100% | Self |
| `coverage_effective_date` | date | **ID (C)** | Date coverage began. | YYYY-MM-DD | 100% | 2026-01-01 |
| `coverage_termination_date` | date | **ID (C)** | Date coverage ends if known; blank means no end date on file. | YYYY-MM-DD | 1% | 2026-04-10 |
| `eligibility_checked_datetime` | datetime | **ID (C)** | When the real-time eligibility check (X12 270/271) was run. | UTC, ISO 8601 | 100% | 2026-01-15T05:10:44Z |
| `eligibility_status` | enum | HEALTH | Result of the check: Active, Active - COB on file, Inactive. *Values in this data:* Active (126); Active - COB on file (11); Inactive (1). |  | 100% | Active |
| `deductible_individual_usd` | decimal | HEALTH | Plan's yearly deductible for one person. | US dollars | 100% | 0 |
| `deductible_met_ytd_usd` | decimal | HEALTH | Amount of that deductible already paid this year. | US dollars | 100% | 0.0 |
| `oop_max_usd` | decimal | HEALTH | Yearly out-of-pocket maximum. | US dollars | 100% | 8300 |
| `oop_met_ytd_usd` | decimal | HEALTH | Amount already counted toward the out-of-pocket maximum. | US dollars | 100% | 144.0 |
| `coinsurance_pct` | integer | HEALTH | Patient's share of the cost after the deductible. | percent | 100% | 20 |
| `pa_required` | flag | HEALTH | Y if the payer's rules require prior authorization for this service and this patient's plan. N means the check found no requirement. *Values in this data:* Y (138). | Y / N | 100% | Y |
| `pa_requirement_source` | enum | NONE | Where the requirement came from: payer PA list, medical policy, formulary, or site-of-care policy. *Values in this data:* Payer prior authorization list (91); Formulary / pharmacy policy (18); Admission notification rule (16); Medical policy (8); Site-of-care policy (5). |  | 100% | Admission notification rule |
| `pa_requirement_policy_id` | string | NONE | Payer policy number that created the requirement (invented). |  | 100% | UM-INPT-2026-01 |
| `payer_portal` | string | NONE | Name of the payer's provider portal used for submission. |  | 100% | Pinnacle Care Connect |
| `secondary_payer_name` | string | HEALTH | Second insurer, if any. |  | 8% | Harbor Medicaid Choice |
| `secondary_member_id` | string | **ID (I)** | Second insurer member ID. |  | 8% | HMC450489369 |
| `referral_required` | flag | HEALTH | Y if the plan (usually an HMO) requires a PCP referral for the service. *Values in this data:* N (106); Y (32). | Y / N | 100% | N |
| `referral_on_file` | flag | HEALTH | Y if a referral is on file; blank when no referral is required. *Values in this data:* Y (30); N (2). | Y / N | 23% | Y |
| `facility_network_status` | enum | HEALTH | Is the hospital in the patient's plan network. *Values in this data:* In network (135); Out of network (3). |  | 100% | In network |
| `ordering_provider_network_status` | enum | HEALTH | Is the ordering doctor in network. *Values in this data:* In network (132); Out of network (6). |  | 100% | In network |
| `out_of_network_exception_requested` | flag | HEALTH | Y if the team asked the payer to treat an out-of-network provider as in-network. *Values in this data:* N (137); Y (1). | Y / N | 100% | N |

### 4. Ordering provider and facility

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `ordering_provider_name` | string | NONE | Doctor who ordered or will perform the service. |  | 100% | Dr. Deborah Peterson, MD |
| `ordering_provider_npi` | string | NONE | Doctor's National Provider Identifier. | 10 digits | 100% | 1964786028 |
| `ordering_provider_specialty` | string | NONE | Doctor's specialty; payers often require a specialist (for example a rheumatologist for a biologic). |  | 100% | Hospital Medicine |
| `ordering_provider_phone` | string | NONE | Office phone for payer calls and peer-to-peer scheduling. |  | 100% | (216) 555-0119 |
| `ordering_provider_fax` | string | NONE | Office fax; many payers still send requests for more information by fax. |  | 100% | (216) 555-0176 |
| `ordering_provider_tin` | string | NONE | Practice tax ID. |  | 100% | 07-6764080 |
| `ordering_practice_name` | string | NONE | Practice or group name. |  | 100% | Peterson Hospital Associates |
| `rendering_provider_name` | string | NONE | Doctor who will actually perform the service (the surgeon, the reading radiologist). |  | 100% | Dr. Deborah Peterson, MD |
| `rendering_provider_npi` | string | NONE | Rendering doctor's NPI. |  | 100% | 1964786028 |
| `pcp_name` | string | NONE | Patient's primary care doctor. |  | 100% | Dr. Joseph Myers, MD |
| `pcp_npi` | string | NONE | PCP NPI. |  | 100% | 2683774832 |
| `office_contact_name` | string | NONE | Person in the ordering office to call about this request. |  | 100% | Michelle Harris |
| `office_contact_phone` | string | NONE | That person's phone. |  | 100% | (216) 555-0103 |
| `facility_name` | string | NONE | Hospital or hospital department where the service will happen. |  | 100% | Lakeshore Community Hospital |
| `facility_npi` | string | NONE | Facility NPI that goes on the claim. |  | 100% | 2394449534 |
| `facility_tin` | string | NONE | Facility tax ID. |  | 100% | 07-1964790 |
| `facility_type` | string | NONE | Kind of facility. |  | 100% | Community hospital (210 beds) |
| `facility_department` | string | NONE | Department or unit within the facility. |  | 100% | Inpatient Medicine |
| `place_of_service_code` | code | NONE | CMS place-of-service code: 19/22 outpatient hospital, 21 inpatient hospital, 12 home, 61 inpatient rehab, 01 pharmacy. | CMS POS | 100% | 21 |
| `place_of_service_desc` | string | NONE | Name of the place-of-service code. |  | 100% | Inpatient hospital |
| `bill_type_code` | code | NONE | Hospital claim type: 0111 inpatient, 0131 outpatient. Blank for pharmacy and DME claims. | UB-04 TOB | 81% | 0111 |
| `revenue_code` | code | NONE | UB-04 revenue code for the service line (what department produced the charge). | UB-04 | 81% | 0120 |

### 5. Service requested

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `procedure_code` | code | HEALTH | The CPT/HCPCS code, MS-DRG, revenue code or NDC being authorized (see code_system). |  | 100% | 066 |
| `code_system` | enum | HEALTH | Which coding system procedure_code comes from. *Values in this data:* CPT (85); HCPCS (19); NDC (18); MS-DRG (expected) (13); Revenue code (3). |  | 100% | MS-DRG (expected) |
| `code_modifier` | string | HEALTH | Modifier such as LT/RT (left/right); blank if none. |  | 16% | LT |
| `procedure_description` | string | HEALTH | Plain-language name of the service. |  | 100% | Inpatient admission notification and initial clinical review |
| `units_requested` | integer | HEALTH | Number of units requested: visits, hospital days, procedures, mg for infused drugs, or pens per 30 days for self-injected drugs. |  | 100% | 2 |
| `service_start_date` | date | **ID (C)** | First date of service requested. | YYYY-MM-DD | 100% | 2026-01-15 |
| `service_end_date` | date | **ID (C)** | Last date of service requested. | YYYY-MM-DD | 100% | 2026-01-17 |
| `laterality` | enum | HEALTH | Left / Right / Bilateral / Not applicable. *Values in this data:* Not applicable (125); Left (7); Right (6). |  | 100% | Not applicable |
| `benefit_channel` | enum | HEALTH | Which part of the plan pays: Medical (hospital/clinic bills), Pharmacy (drug store/specialty pharmacy bills) or DME (equipment supplier bills). *Values in this data:* Medical (112); Pharmacy (18); DME (8). |  | 100% | Medical |
| `estimated_allowed_amount_usd` | decimal | HEALTH | Rough amount the payer would allow for the whole request; used to size the money at risk. | US dollars | 100% | 5293.19 |
| `estimated_patient_responsibility_usd` | decimal | HEALTH | Rough patient share after deductible and coinsurance. | US dollars | 100% | 1058.64 |
| `primary_dx_icd10` | code | HEALTH | Main diagnosis driving the request. | ICD-10-CM | 100% | I63.9 |
| `primary_dx_description` | string | HEALTH | Name of the main diagnosis. |  | 100% | Cerebral infarction, unspecified |
| `secondary_dx_1_icd10` | code | HEALTH | Supporting diagnosis 1. | ICD-10-CM | 96% | I10 |
| `secondary_dx_1_description` | string | HEALTH | Name of supporting diagnosis 1. |  | 96% | Essential (primary) hypertension |
| `secondary_dx_2_icd10` | code | HEALTH | Supporting diagnosis 2. | ICD-10-CM | 90% | E78.5 |
| `secondary_dx_2_description` | string | HEALTH | Name of supporting diagnosis 2. |  | 90% | Hyperlipidemia, unspecified |
| `secondary_dx_3_icd10` | code | HEALTH | Supporting diagnosis 3. | ICD-10-CM | 79% | I25.10 |
| `secondary_dx_3_description` | string | HEALTH | Name of supporting diagnosis 3. |  | 79% | Atherosclerotic heart disease of native coronary artery w... |
| `dx_onset_date` | date | **ID (C)** | Approximate date the main problem started. | YYYY-MM-DD | 97% | 2026-01-08 |

### 6. Clinical snapshot at the qualifying visit

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `encounter_id` | string | **ID (R)** | ID of the visit whose notes support the request. |  | 100% | ENC-162925017 |
| `encounter_date` | date | **ID (C)** | Date of that visit. Payers usually want notes from the last 30-90 days. | YYYY-MM-DD | 100% | 2026-01-13 |
| `encounter_type` | enum | HEALTH | Office visit, inpatient progress note, telehealth and so on. *Values in this data:* Office visit (91); Specialist consult visit (17); Inpatient progress note (16); Telehealth visit (14). |  | 100% | Inpatient progress note |
| `chief_complaint` | text | TEXT | Patient's main complaint in one line. |  | 100% | Admitted with stroke |
| `history_of_present_illness` | text | TEXT | Short story of the problem, as it would appear in the visit note. |  | 100% | 79-year-old man presented to the emergency department wit... |
| `symptom_onset_date` | date | **ID (C)** | When symptoms began. | YYYY-MM-DD | 97% | 2026-01-08 |
| `symptom_duration_weeks` | integer | HEALTH | Weeks since symptoms began. |  | 86% | 20 |
| `pain_score_0_10` | integer | HEALTH | Patient-rated pain, 0 none to 10 worst. | 0-10 | 86% | 7 |
| `functional_limitation_summary` | text | TEXT | What the patient can no longer do. |  | 100% | Unable to manage at home |
| `height_cm` | decimal | HEALTH | Height at the visit. | centimetres | 100% | 182.4 |
| `weight_kg` | decimal | HEALTH | Weight at the visit. | kilograms | 100% | 88.1 |
| `bmi` | decimal | HEALTH | Body mass index at the visit. | kg/m2 | 100% | 26.5 |
| `bp_systolic` | integer | HEALTH | Top blood pressure number. | mmHg | 100% | 136 |
| `bp_diastolic` | integer | HEALTH | Bottom blood pressure number. | mmHg | 100% | 79 |
| `heart_rate_bpm` | integer | HEALTH | Pulse. | beats/min | 100% | 72 |
| `spo2_pct` | integer | HEALTH | Blood oxygen saturation. | percent | 100% | 99 |
| `smoking_status` | enum | HEALTH | Never / Former / Current. Many surgery rules require nicotine-free status. *Values in this data:* Never (66); Former (46); Current (26). |  | 100% | Never |
| `comorb_hypertension` | flag | HEALTH | High blood pressure. *Values in this data:* N (76); Y (62). | Y / N | 100% | Y |
| `comorb_diabetes` | enum | HEALTH | None / Type 1 / Type 2. *Values in this data:* None (102); Type 2 (34); Type 1 (2). |  | 100% | None |
| `comorb_ckd` | flag | HEALTH | Chronic kidney disease. *Values in this data:* N (118); Y (20). | Y / N | 100% | N |
| `comorb_copd` | flag | HEALTH | COPD. *Values in this data:* N (121); Y (17). | Y / N | 100% | N |
| `comorb_heart_failure` | flag | HEALTH | Heart failure. *Values in this data:* N (127); Y (11). | Y / N | 100% | N |
| `comorb_cad` | flag | HEALTH | Coronary artery disease. *Values in this data:* N (116); Y (22). | Y / N | 100% | Y |
| `comorb_afib` | flag | HEALTH | Atrial fibrillation. *Values in this data:* N (133); Y (5). | Y / N | 100% | N |
| `comorb_osa` | flag | HEALTH | Sleep apnea. *Values in this data:* N (99); Y (39). | Y / N | 100% | N |
| `comorb_depression` | flag | HEALTH | Depression. *Values in this data:* N (113); Y (25). | Y / N | 100% | N |
| `comorb_obesity` | flag | HEALTH | BMI 30 or higher. *Values in this data:* Y (79); N (59). | Y / N | 100% | N |
| `comorb_cancer` | flag | HEALTH | Active or past cancer. *Values in this data:* N (125); Y (13). | Y / N | 100% | N |
| `charlson_comorbidity_index` | integer | HEALTH | Simplified chronic illness burden score. |  | 100% | 4 |
| `active_medications` | text | HEALTH | Current medicines, dose and schedule. |  | 100% | Losartan 50 mg daily; Rosuvastatin 20 mg nightly; Aspirin... |
| `drug_allergies` | text | HEALTH | Drug allergies, or NKDA (no known drug allergies). |  | 100% | Iodinated contrast (hives) |
| `labs_date` | date | **ID (C)** | Date of the labs below. | YYYY-MM-DD | 100% | 2026-01-13 |
| `hba1c_pct` | decimal | HEALTH | Hemoglobin A1c (3-month blood sugar average). | percent | 100% | 5.1 |
| `egfr` | integer | HEALTH | Kidney function estimate. | mL/min/1.73m2 | 100% | 56 |
| `creatinine_mg_dl` | decimal | HEALTH | Serum creatinine. | mg/dL | 100% | 1.38 |
| `hemoglobin_g_dl` | decimal | HEALTH | Hemoglobin. | g/dL | 100% | 11.9 |
| `wbc_k_ul` | decimal | HEALTH | White blood cell count. | thousand/uL | 100% | 5.4 |
| `platelets_k_ul` | integer | HEALTH | Platelet count. | thousand/uL | 100% | 247 |
| `ldl_mg_dl` | integer | HEALTH | LDL cholesterol. | mg/dL | 100% | 50 |
| `inr` | decimal | HEALTH | Blood clotting ratio; relevant for surgery and blood thinners. |  | 100% | 1.0 |
| `albumin_g_dl` | decimal | HEALTH | Albumin, a nutrition marker used for surgery risk. | g/dL | 100% | 4.3 |

### 7. Prior treatment and history

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `conservative_therapy_weeks` | integer | HEALTH | Weeks of non-surgical treatment already tried and documented (therapy, medicines, injections). Most imaging and surgery rules require a minimum. |  | 34% | 20 |
| `conservative_therapy_description` | text | HEALTH | What was tried. |  | 34% | NSAIDs; activity modification; 16 physical therapy sessio... |
| `conservative_pt_sessions` | integer | HEALTH | Physical therapy sessions completed. |  | 34% | 16 |
| `nsaid_trial_weeks` | integer | HEALTH | Weeks on anti-inflammatory pain medicine. |  | 34% | 13 |
| `steroid_injections_12mo` | integer | HEALTH | Steroid injections in the last 12 months; payers cap how many. |  | 34% | 0 |
| `prior_surgery_same_site` | flag | HEALTH | Y if the same body part was operated on before. *Values in this data:* N (13). | Y / N | 9% | N |
| `prior_imaging_12mo` | flag | HEALTH | Y if the same body area was imaged in the last 12 months. Repeat scans are a common denial reason. *Values in this data:* Y (29); N (22). | Y / N | 37% | N |
| `prior_imaging_modality` | string | HEALTH | Type of the earlier imaging. |  | 21% | MRI brain with and without contrast |
| `prior_imaging_date` | date | **ID (C)** | Date of the earlier imaging. | YYYY-MM-DD | 21% | 2025-08-25 |
| `prior_imaging_result` | text | TEXT | What the earlier imaging showed. |  | 21% | Periventricular and juxtacortical T2 lesions; 2 enhancing... |
| `red_flag_present` | flag | HEALTH | Y if a warning sign exists that justifies skipping the waiting period (for example new weakness). *Values in this data:* N (38). | Y / N | 28% | N |
| `red_flag_detail` | string | HEALTH | Which warning sign. |  | 0% |  |
| `neuro_deficit_present` | flag | HEALTH | Y if nerve damage signs are documented (weakness, numbness, reflex change). *Values in this data:* N (15); Y (6). | Y / N | 15% | Y |
| `prior_pa_same_service` | flag | HEALTH | Y if this service was already authorized or denied before. *Values in this data:* N (125); Y (13). | Y / N | 100% | N |
| `prior_pa_outcome` | string | HEALTH | Outcome of that earlier request. |  | 9% | Denied; resubmitted with additional documentation |

### 8. Imaging details

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `img_modality` | enum | HEALTH | MRI, PET/CT, SPECT or other scan type. *Values in this data:* MRI (18). |  | 13% | MRI |
| `img_body_region` | string | HEALTH | Body area scanned. |  | 13% | Lumbar spine |
| `img_contrast` | enum | HEALTH | With or without contrast dye. *Values in this data:* Without contrast (18). |  | 13% | Without contrast |
| `img_xray_done_first` | flag | HEALTH | Y if plain X-rays were done first, as many imaging rules require. *Values in this data:* Y (13); N (5). | Y / N | 13% | Y |
| `img_xray_date` | date | **ID (C)** | Date of the X-ray. | YYYY-MM-DD | 9% | 2025-12-08 |
| `img_result_changes_management` | flag | HEALTH | Y if the note states how the result would change treatment. *Values in this data:* Y (16); N (2). | Y / N | 13% | Y |
| `img_guideline_reference` | string | NONE | Appropriateness guideline the order is checked against. |  | 13% | ACR Appropriateness Criteria: Low Back Pain |
| `img_benefit_manager` | string | NONE | Radiology benefit manager the payer uses (invented name); many payers outsource imaging review. |  | 13% | ImageWise Radiology Management (fictional) |

### 9. Orthopedic, spine and therapy details

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `or_imaging_confirmation` | text | TEXT | Imaging finding that confirms the diagnosis. |  | 10% | Standing X-ray: severe joint-space narrowing, osteophytes... |
| `or_kl_grade` | integer | HEALTH | Kellgren-Lawrence arthritis grade on X-ray, 0 normal to 4 severe. Joint replacement rules usually need 3 or 4. | 0-4 | 9% | 4 |
| `or_joint_space_narrowing` | enum | HEALTH | How much cartilage space is lost on X-ray. *Values in this data:* Severe (11); Moderate (2). |  | 9% | Severe |
| `or_radiographic_instability` | flag | HEALTH | Y if spine X-rays show abnormal movement between vertebrae. *Values in this data:* Y (1). | Y / N | 1% | Y |
| `or_spondylolisthesis_grade` | integer | HEALTH | Degree of vertebral slip (Meyerding grade 0-4). | 0-4 | 1% | 3 |
| `or_levels_requested` | integer | HEALTH | Spine levels to be fused. |  | 1% | 1 |
| `or_functional_score_name` | string | HEALTH | Questionnaire used to score disability. |  | 21% | WOMAC |
| `or_functional_score_value` | integer | HEALTH | Score on that questionnaire (higher = worse for ODI and WOMAC). |  | 21% | 56 |
| `or_asa_class` | integer | HEALTH | Anesthesia risk class 1 (healthy) to 4 (severe disease). | 1-4 | 16% | 2 |
| `or_smoking_cessation_weeks` | integer | HEALTH | Weeks nicotine-free, confirmed if required (cotinine test). |  | 2% | 2 |
| `or_preop_clearance_done` | flag | HEALTH | Y if medical clearance for surgery is on file. *Values in this data:* Y (14). | Y / N | 10% | Y |
| `or_psych_screen_done` | flag | HEALTH | Y if a psychological screen is on file (required before many spine fusions). *Values in this data:* Y (1). | Y / N | 1% | Y |
| `or_planned_implant` | string | HEALTH | Implant planned. |  | 10% | Cemented cobalt-chrome / polyethylene system |
| `or_planned_los_days` | integer | HEALTH | Planned hospital nights. |  | 16% | 0 |
| `pt_visits_requested` | integer | HEALTH | Therapy visits requested. |  | 7% | 12 |
| `pt_visits_per_week` | integer | HEALTH | Planned visits per week. |  | 7% | 3 |
| `pt_visits_used_ytd` | integer | HEALTH | Therapy visits already used this benefit year. |  | 7% | 19 |
| `pt_annual_visit_cap` | integer | HEALTH | Plan's yearly therapy visit limit. |  | 7% | 60 |
| `pt_plan_of_care_signed` | flag | HEALTH | Y if the therapist's plan of care is signed by the physician. *Values in this data:* Y (9). | Y / N | 7% | Y |
| `pt_measurable_goals_documented` | flag | HEALTH | Y if goals are measurable (for example 'walk 500 feet'). *Values in this data:* Y (8); N (1). | Y / N | 7% | Y |

### 10. Oncology and genetic testing details

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `onc_primary_site` | string | HEALTH | Where the cancer started. |  | 9% | Lung, lobe not specified |
| `onc_histology` | string | HEALTH | Cell type from the pathology report. |  | 9% | Squamous cell carcinoma |
| `onc_stage_group` | string | HEALTH | Overall cancer stage. |  | 9% | IIB |
| `onc_tnm` | string | HEALTH | Tumor-node-metastasis staging. |  | 9% | T2b N1 M0 |
| `onc_ecog` | integer | HEALTH | Performance status 0 (fully active) to 4 (bedbound). Most drug rules want 0-1 or 0-2. | 0-4 | 9% | 1 |
| `onc_intent` | enum | HEALTH | Curative or palliative. *Values in this data:* Curative (7); Palliative (5). |  | 9% | Curative |
| `onc_biomarker_tested` | string | HEALTH | Biomarker tests done. |  | 4% | EGFR, ALK, ROS1, BRAF, KRAS G12C, MET, PD-L1 (22C3) |
| `onc_biomarker_result` | string | HEALTH | Biomarker results. |  | 4% | No actionable driver mutation; PD-L1 TPS 95% |
| `onc_pdl1_tps_pct` | integer | HEALTH | PD-L1 tumor proportion score; decides immunotherapy eligibility. | percent | 4% | 95 |
| `onc_driver_mutation_found` | flag | HEALTH | Y if an EGFR/ALK-type mutation was found (changes drug choice). *Values in this data:* N (6). | Y / N | 4% | N |
| `onc_line_of_therapy` | integer | HEALTH | 1 = first treatment for advanced disease. |  | 4% | 1 |
| `onc_regimen` | string | HEALTH | Drug regimen. |  | 4% | Pembrolizumab 200 mg IV every 3 weeks |
| `onc_cycle_number` | integer | HEALTH | Cycle being requested. |  | 4% | 1 |
| `onc_planned_cycles` | integer | HEALTH | Cycles planned in this authorization. |  | 4% | 6 |
| `onc_bsa_m2` | decimal | HEALTH | Body surface area, used for dose calculation. | m2 | 4% | 2.0 |
| `onc_dose_mg` | integer | HEALTH | Dose per cycle. | mg | 4% | 200 |
| `onc_dose_basis` | string | HEALTH | Flat dose or weight/BSA based. |  | 4% | Flat dose |
| `onc_nccn_category` | string | HEALTH | Evidence category in the NCCN oncology guidelines. |  | 4% | Category 1 |
| `onc_nccn_aligned` | flag | HEALTH | Y if the regimen is listed in NCCN for this cancer and stage. *Values in this data:* Y (6). | Y / N | 4% | Y |
| `onc_tumor_board_reviewed` | flag | HEALTH | Y if a tumor board discussed the case. *Values in this data:* Y (5); N (1). | Y / N | 4% | N |
| `onc_pet_indication` | enum | HEALTH | Why a PET was ordered: Initial staging / Restaging / Treatment response. *Values in this data:* Initial staging (4); Restaging (1); Treatment response (1). |  | 4% | Restaging |
| `onc_prior_pet_date` | date | **ID (C)** | Date of last PET. | YYYY-MM-DD | 1% | 2026-03-03 |
| `onc_conventional_imaging_done` | flag | HEALTH | Y if CT or MRI was done first and was not enough. *Values in this data:* Y (6). | Y / N | 4% | Y |
| `onc_genetic_test_name` | string | HEALTH | Genetic test ordered. |  | 3% | BRCA1/BRCA2 full sequence and del/dup |
| `onc_family_history_summary` | text | TEXT | Relatives with cancer. |  | 3% | Mother: breast cancer at 44; Sister: breast cancer at 39 |
| `onc_genetic_counseling_done` | flag | HEALTH | Y if pre-test genetic counseling was documented. *Values in this data:* Y (4). | Y / N | 3% | Y |
| `onc_prior_genetic_testing` | flag | HEALTH | Y if the patient was already tested (payers do not repay for the same test). *Values in this data:* N (4). | Y / N | 3% | N |
| `onc_autoimmune_disease_active` | flag | HEALTH | Y if active autoimmune disease (a safety issue for immunotherapy). *Values in this data:* N (6). | Y / N | 4% | N |

### 11. Drug details

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `rx_drug_name` | string | HEALTH | Brand or product name. |  | 21% | Ocrevus (ocrelizumab) |
| `rx_generic_name` | string | HEALTH | Generic name. |  | 21% | ocrelizumab |
| `rx_product_type` | enum | HEALTH | Reference brand, biosimilar or brand. *Values in this data:* Reference brand (12); Biosimilar (9); Brand (8). |  | 21% | Reference brand |
| `rx_ndc` | string | HEALTH | National Drug Code (format only; invented numbers). | 5-4-2 digits | 17% | 65070-8269-03 |
| `rx_strength_form` | string | HEALTH | Strength and form. |  | 17% | 300 mg/10 mL vial |
| `rx_route` | enum | HEALTH | How it is given. *Values in this data:* Subcutaneous (18); Intravenous (11). |  | 21% | Intravenous |
| `rx_dose_regimen` | string | HEALTH | Dose and schedule. |  | 21% | 600 mg IV every 6 months (two infusions requested) |
| `rx_quantity_per_30_days` | decimal | HEALTH | Quantity per 30 days. |  | 17% | 0 |
| `rx_days_supply` | integer | HEALTH | Days of drug supplied per fill or dose. |  | 17% | 1 |
| `rx_requested_duration_months` | integer | HEALTH | Months of approval requested (payers commonly approve 6-12 months at a time). |  | 21% | 12 |
| `rx_site_of_care` | enum | HEALTH | Where infused or given: hospital outpatient, home infusion, office, self-administered. *Values in this data:* Hospital outpatient infusion (11); Self-administered at home (10). |  | 15% | Hospital outpatient infusion |
| `rx_site_of_care_policy_met` | flag | HEALTH | Y if the requested site meets the payer's site-of-care rule (many payers push infusions out of hospitals to cheaper sites). *Values in this data:* Y (4); N (1). | Y / N | 4% | Y |
| `rx_formulary_status` | enum | NONE | Preferred, Non-preferred or Not covered on the payer's drug list. *Values in this data:* Preferred (28); Non-preferred (1). |  | 21% | Preferred |
| `rx_preferred_alternative` | string | NONE | Cheaper drug the payer would rather use. |  | 1% | Hyrimoz (adalimumab-adaz) |
| `rx_step_therapy_required` | flag | HEALTH | Y if the plan requires cheaper drugs to be tried first. *Values in this data:* Y (17); N (6). | Y / N | 17% | N |
| `rx_step_agents_tried` | text | TEXT | Earlier drugs tried. |  | 12% | Methotrexate 20 mg weekly; sulfasalazine |
| `rx_step_trial_months` | integer | HEALTH | Months of the step drug tried. |  | 12% | 5 |
| `rx_step_failure_reason` | string | HEALTH | Why the step drug failed (no response, side effects, contraindication). |  | 12% | Inadequate response |
| `rx_tb_screen_result` | enum | HEALTH | Tuberculosis test result; required before many biologics. *Values in this data:* Negative (IGRA) (12); Not done (1). |  | 9% | Negative (IGRA) |
| `rx_tb_screen_date` | date | **ID (C)** | Date of the TB test. | YYYY-MM-DD | 9% | 2025-04-19 |
| `rx_hepb_screen_result` | enum | HEALTH | Hepatitis B screening result. *Values in this data:* Negative (11); Immune (vaccinated) (4). |  | 11% | Negative |
| `rx_severity_measure` | string | HEALTH | Disease activity score used (for example DAS28, PASI, Harvey-Bradshaw). |  | 17% | EDSS |
| `rx_severity_value` | decimal | HEALTH | Value of that score at baseline. |  | 17% | 5.5 |
| `rx_specialist_prescriber` | flag | HEALTH | Y if prescribed by the required specialist type. *Values in this data:* Y (23). | Y / N | 17% | Y |
| `rx_diagnosis_confirmed_by` | string | HEALTH | How the diagnosis was confirmed (biopsy, endoscopy, MRI, specialist exam). |  | 17% | MRI brain and spine with lesions disseminated in space an... |
| `rx_renewal_request` | flag | HEALTH | Y if this renews an existing approval. *Values in this data:* N (21); Y (2). | Y / N | 17% | N |
| `rx_response_documented` | flag | HEALTH | Y if improvement on the drug is documented (needed for renewals). *Values in this data:* Y (2). | Y / N | 1% | Y |
| `rx_benefit_exclusion` | flag | HEALTH | Y if the plan contract excludes this drug class for this use (for example weight-loss drugs). *Values in this data:* N (28); Y (1). | Y / N | 21% | N |
| `rx_monthly_cost_usd` | decimal | HEALTH | Approximate monthly cost to the plan. | US dollars | 21% | 4844.07 |
| `rx_concurrent_biologic` | flag | HEALTH | Y if the patient is already on another biologic (plans usually deny doubling up). *Values in this data:* N (23). | Y / N | 17% | N |
| `rx_lifestyle_program_months` | integer | HEALTH | Months in a supervised diet/exercise program (weight-loss drugs). |  | 3% | 3 |

### 12. Cardiac details

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `ca_nyha_class` | integer | HEALTH | Heart failure/breathlessness class 1 (none) to 4 (at rest). | 1-4 | 12% | 1 |
| `ca_ccs_angina_class` | integer | HEALTH | Angina class 1 to 4. | 1-4 | 10% | 2 |
| `ca_lvef_pct` | integer | HEALTH | Left ventricular ejection fraction: how much blood the heart pumps out each beat. | percent | 12% | 53 |
| `ca_stress_test_type` | string | HEALTH | Stress test performed. |  | 10% | Treadmill SPECT |
| `ca_stress_test_date` | date | **ID (C)** | Stress test date. | YYYY-MM-DD | 5% | 2026-02-28 |
| `ca_stress_test_result` | string | HEALTH | Stress test result. |  | 5% | Reversible anterior ischemia involving 11% of myocardium |
| `ca_ischemic_eval_12mo` | flag | HEALTH | Y if an ischemia test was done in the last 12 months. *Values in this data:* N (7). | Y / N | 5% | N |
| `ca_max_stenosis_pct` | integer | HEALTH | Worst artery narrowing seen. | percent | 1% | 78 |
| `ca_vessels_diseased` | integer | HEALTH | Number of major coronary arteries with significant disease. |  | 1% | 2 |
| `ca_fractional_flow_reserve` | decimal | HEALTH | FFR; 0.80 or less means the blockage limits blood flow. |  | 1% | 0.67 |
| `ca_antianginal_agents` | integer | HEALTH | Number of angina medicines on board. |  | 10% | 1 |
| `ca_sts_risk_pct` | decimal | HEALTH | Predicted surgical mortality (STS score). | percent | 2% | 4.2 |
| `ca_heart_team_evaluation` | flag | HEALTH | Y if a surgeon and interventional cardiologist both evaluated the patient. *Values in this data:* Y (4); N (1). | Y / N | 4% | Y |
| `ca_aortic_valve_area_cm2` | decimal | HEALTH | Aortic valve opening area; 1.0 or less is severe. | cm2 | 2% | 0.79 |
| `ca_mean_gradient_mmhg` | integer | HEALTH | Pressure drop across the aortic valve; 40 or more is severe. | mmHg | 2% | 51 |
| `ca_peak_velocity_ms` | decimal | HEALTH | Blood speed across the valve; 4.0 or more is severe. | m/s | 2% | 5.0 |
| `ca_ecg_findings` | string | HEALTH | ECG result. |  | 5% | Normal |
| `ca_pretest_probability` | enum | HEALTH | Estimated chance of coronary disease before testing. *Values in this data:* High (8); Intermediate (6). |  | 10% | High |
| `ca_pharmacologic_stress_justified` | flag | HEALTH | Y if the patient cannot exercise so a drug stress is justified. *Values in this data:* N (6); Y (1). | Y / N | 5% | N |

### 13. Sleep and equipment (DME) details

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `dm_item` | string | HEALTH | Equipment requested. |  | 10% | Sleep study |
| `dm_ahi_events_per_hr` | decimal | HEALTH | Apnea-hypopnea index: breathing pauses per hour of sleep. | events/hour | 3% | 26.2 |
| `dm_epworth_score` | integer | HEALTH | Daytime sleepiness score 0-24. | 0-24 | 7% | 12 |
| `dm_sleep_study_type` | string | HEALTH | In-lab or home sleep test. |  | 7% | Attended in-lab polysomnography |
| `dm_sleep_study_date` | date | **ID (C)** | Date of the sleep study. | YYYY-MM-DD | 7% | 2026-04-15 |
| `dm_home_sleep_test_contraindication` | string | HEALTH | Reason a home test is not suitable, justifying an in-lab study. |  | 2% | BMI above 45 |
| `dm_face_to_face_date` | date | **ID (C)** | Date of the required in-person visit. | YYYY-MM-DD | 10% | 2026-03-27 |
| `dm_cmn_signed` | flag | HEALTH | Y if the physician signed the order/certificate of medical necessity. *Values in this data:* Y (8). | Y / N | 6% | Y |
| `dm_cpap_adherence_pct_nights` | integer | HEALTH | Percent of nights CPAP used 4+ hours (needs 70% for continued coverage). | percent | 1% | 87 |
| `dm_cpap_avg_hours_per_night` | decimal | HEALTH | Average nightly use. | hours | 1% | 7.4 |
| `dm_insulin_injections_per_day` | integer | HEALTH | Daily insulin injections (3+ often required for a glucose monitor). |  | 3% | 3 |
| `dm_hypoglycemia_episodes_3mo` | integer | HEALTH | Low blood sugar episodes in the last 3 months. |  | 3% | 6 |
| `dm_rental_or_purchase` | enum | HEALTH | Rental or purchase. *Values in this data:* Purchase (receiver) plus monthly sensors (4); Rental (13 months) (4). |  | 6% | Purchase (receiver) plus monthly sensors |
| `dm_supplier_name` | string | NONE | Equipment supplier (invented). |  | 6% | Buckeye Respiratory Supply (fictional) |
| `dm_supplier_npi` | string | NONE | Supplier NPI. |  | 6% | 2664069319 |
| `dm_supplier_in_network` | flag | NONE | Y if the supplier is in the patient's network. *Values in this data:* Y (8). | Y / N | 6% | Y |

### 14. Weight-loss surgery details

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `ba_procedure` | string | HEALTH | Operation planned. |  | 4% | Laparoscopic sleeve gastrectomy |
| `ba_comorbidity_count` | integer | HEALTH | Obesity-related conditions present (diabetes, hypertension, sleep apnea and so on). |  | 4% | 0 |
| `ba_supervised_diet_months` | integer | HEALTH | Months in a supervised weight-management program. |  | 4% | 8 |
| `ba_psych_eval_completed` | flag | HEALTH | Y if a psychological evaluation is on file. *Values in this data:* Y (5). | Y / N | 4% | Y |
| `ba_nutrition_eval_completed` | flag | HEALTH | Y if a dietitian evaluation is on file. *Values in this data:* Y (5). | Y / N | 4% | Y |
| `ba_program_accredited` | flag | HEALTH | Y if the surgery program is accredited (MBSAQIP), which payers require. *Values in this data:* Y (5). | Y / N | 4% | Y |
| `ba_prior_bariatric_surgery` | flag | HEALTH | Y if weight-loss surgery was done before. *Values in this data:* N (5). | Y / N | 4% | N |
| `ba_nicotine_free_weeks` | integer | HEALTH | Weeks nicotine-free. |  | 4% | 26 |

### 15. Inpatient and rehab stay details

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `ip_admit_datetime` | datetime | **ID (C)** | When the patient was admitted. | UTC, ISO 8601 | 12% | 2026-01-15T23:14:00Z |
| `ip_admit_source` | enum | HEALTH | How the patient arrived: ED, direct admit, transfer. *Values in this data:* Emergency department (11); Transfer from acute care hospital (3); Direct admit (2). |  | 12% | Emergency department |
| `ip_status_requested` | enum | HEALTH | Inpatient or Observation. Payers often argue a stay should be observation. *Values in this data:* Inpatient (16). |  | 12% | Inpatient |
| `ip_level_of_care` | enum | HEALTH | Medical/surgical, telemetry, step-down, ICU, or inpatient rehab. *Values in this data:* Telemetry (7); ICU (3); Inpatient rehab (3); Medical/surgical (3). |  | 12% | ICU |
| `ip_two_midnight_expectation` | flag | HEALTH | Y if the doctor expected care to cross two midnights (basis for inpatient status in Medicare rules). *Values in this data:* Y (16). | Y / N | 12% | Y |
| `ip_review_type` | enum | HEALTH | Admission review or continued-stay review. *Values in this data:* Admission review (13); Continued-stay review (3). |  | 12% | Admission review |
| `ip_review_day` | integer | HEALTH | Hospital day this review covers. |  | 12% | 1 |
| `ip_current_los_days` | integer | HEALTH | Days in hospital so far. |  | 12% | 1 |
| `ip_expected_total_los_days` | integer | HEALTH | Expected total stay. |  | 12% | 2 |
| `ip_gmlos_days` | decimal | NONE | Geometric mean length of stay for the DRG: the national benchmark payers compare against. | days | 9% | 2.5 |
| `ip_days_requested` | integer | HEALTH | Hospital days requested in this review. |  | 12% | 2 |
| `ip_days_approved` | integer | HEALTH | Days approved. |  | 12% | 2 |
| `ip_severity_of_illness` | text | HEALTH | Clinical findings showing how sick the patient is (the 'SI' half of InterQual/MCG). |  | 12% | Acute ischemic stroke, NIHSS 11, MRI diffusion restrictio... |
| `ip_intensity_of_service` | text | HEALTH | Treatments only a hospital can give (the 'IS' half). |  | 12% | Neuro checks every hour for 24 hours, telemetry, swallow ... |
| `ip_criteria_vendor` | enum | NONE | Screening criteria product used (InterQual or MCG). The criteria text itself is licensed and not reproduced here. *Values in this data:* MCG (14); InterQual (2). |  | 12% | MCG |
| `ip_criteria_subset` | string | NONE | Condition-specific subset used. |  | 12% | Stroke |
| `ip_discharge_barriers` | text | TEXT | What is delaying discharge. |  | 12% | None yet |
| `ip_post_acute_plan` | string | HEALTH | Planned next level of care (home, home health, SNF, rehab). |  | 12% | To be determined |
| `ip_discharge_datetime` | datetime | **ID (C)** | When the patient left; blank if still in hospital. | UTC, ISO 8601 | 12% | 2026-01-18T03:14:00Z |
| `ip_discharge_disposition` | string | HEALTH | Where the patient went. |  | 12% | To be determined |
| `ip_readmission_30d` | flag | HEALTH | Y if readmitted within 30 days. *Values in this data:* N (13); Y (2). | Y / N | 11% | N |
| `ip_rehab_therapy_hours_per_day` | decimal | HEALTH | Therapy hours per day the rehab hospital plans (3 hours is the usual rule). | hours | 2% | 3.0 |
| `ip_functional_score_admit` | integer | HEALTH | Function score at rehab admission (0-100, higher = more independent). |  | 2% | 42 |
| `ip_nihss_admit` | integer | HEALTH | Stroke severity score at admission, 0 to 42. | 0-42 | 2% | 15 |
| `ip_medical_stability_for_irf` | flag | HEALTH | Y if the patient is medically stable enough for rehab. *Values in this data:* Y (3). | Y / N | 2% | Y |

### 16. Documentation and attachments

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `dc_criteria_set` | string | NONE | Rule set the payer applies (policy, ACR, NCCN, InterQual/MCG, Medicare coverage rule). |  | 100% | InterQual or MCG inpatient criteria (licensed; not reprod... |
| `dc_policy_id` | string | NONE | Payer policy number for that rule set (invented). |  | 100% | UM-INPT-2026-01 |
| `dc_visit_note` | enum | HEALTH | Visit note: Attached / Missing / Not required. *Values in this data:* Attached (120); Not required (16); Missing (2). |  | 100% | Not required |
| `dc_imaging_report` | enum | HEALTH | Imaging report: Attached / Missing / Not required. *Values in this data:* Not required (87); Attached (48); Missing (3). |  | 100% | Attached |
| `dc_lab_report` | enum | HEALTH | Lab report: Attached / Missing / Not required. *Values in this data:* Not required (68); Attached (66); Missing (4). |  | 100% | Attached |
| `dc_pt_notes` | enum | HEALTH | Physical therapy notes: Attached / Missing / Not required. *Values in this data:* Not required (92); Attached (42); Missing (4). |  | 100% | Not required |
| `dc_medical_necessity_letter` | enum | HEALTH | Letter of medical necessity: Attached / Missing / Not required. *Values in this data:* Not required (116); Attached (20); Missing (2). |  | 100% | Not required |
| `dc_pathology_report` | enum | HEALTH | Pathology report: Attached / Missing / Not required. *Values in this data:* Not required (123); Attached (15). |  | 100% | Not required |
| `dc_sleep_study_report` | enum | HEALTH | Sleep study report: Attached / Missing / Not required. *Values in this data:* Not required (134); Attached (4). |  | 100% | Not required |
| `dc_cardiac_testing_report` | enum | HEALTH | Stress test, cath or echo report: Attached / Missing / Not required. *Values in this data:* Not required (121); Attached (15); Missing (2). |  | 100% | Not required |
| `dc_specialist_consult` | enum | HEALTH | Specialist, psychology or nutrition consult: Attached / Missing / Not required. *Values in this data:* Not required (107); Attached (26); Missing (5). |  | 100% | Not required |
| `dc_inpatient_record` | enum | HEALTH | H&P, progress notes, orders and medication record: Attached / Missing / Not required. *Values in this data:* Not required (122); Attached (16). |  | 100% | Attached |
| `dc_required_count` | integer | HEALTH | Number of document types the payer requires. |  | 100% | 3 |
| `dc_attached_count` | integer | HEALTH | How many of those were attached. |  | 100% | 3 |
| `dc_completeness_pct` | integer | HEALTH | Attached divided by required. | percent | 100% | 100 |
| `dc_missing_documents` | text | HEALTH | Names of missing documents. |  | 14% | Imaging report |
| `dc_attachment_method` | enum | NONE | How documents were sent: portal upload, X12 275 attachment, fax. *Values in this data:* Portal upload (62); Fax (45); X12 275 attachment (22); FHIR DocumentReference (9). |  | 100% | X12 275 attachment |
| `dc_attachment_pages` | integer | HEALTH | Total pages sent. |  | 100% | 37 |
| `dc_medical_necessity_summary` | text | TEXT | The 2-3 sentence argument the specialist wrote for why the service is needed. |  | 100% | 79-year-old man with cerebral infarction, unspecified. Re... |

### 17. Criteria check (hospital's own pre-screen)

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `cr_total` | integer | HEALTH | Number of criteria checked for this service. |  | 100% | 4 |
| `cr_met` | integer | HEALTH | How many the chart supports. |  | 100% | 4 |
| `cr_met_pct` | integer | HEALTH | cr_met divided by cr_total. | percent | 100% | 100 |
| `cr_detail` | text | HEALTH | Each criterion with MET or NOT MET. |  | 100% | Severity of illness findings meet criteria: MET; Intensit... |
| `cr_unmet` | text | HEALTH | Only the criteria that are not met. |  | 21% | Nicotine-free for at least 4 weeks; Pre-operative medical... |
| `cr_medical_necessity_met` | flag | HEALTH | Y if every criterion is met. *Values in this data:* Y (109); N (29). | Y / N | 100% | Y |
| `cr_gold_card_exempt` | flag | HEALTH | Y if the ordering doctor has a payer 'gold card' (approval history that waives review for this service). *Values in this data:* N (133); Y (5). | Y / N | 100% | N |
| `cr_internal_prescreen` | enum | HEALTH | Hospital's own prediction before submitting: Likely approve, Needs more documentation, Likely deny. *Values in this data:* Likely approve (95); Needs more documentation (39); Likely deny (4). |  | 100% | Likely approve |
| `cr_denial_risk_score` | integer | HEALTH | 0-100 score for how likely a denial is. | 0-100 | 100% | 0 |

### 18. Payer determination, peer-to-peer and appeal

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `dt_first_decision` | enum | HEALTH | Payer's first answer. *Values in this data:* Approved (103); Denied (26); Withdrawn by provider (4); Partially approved (2). |  | 98% | Approved |
| `dt_reason_code` | string | HEALTH | Payer's reason code for a denial or partial approval (invented code set). |  | 20% | MN-01 |
| `dt_denial_category` | enum | HEALTH | Why it was denied. *Values in this data:* Medical necessity criteria not met (19); Insufficient clinical documentation (2); Level of care (observation instead of inpatient) (2); Step therapy not completed (1); Eligibility: coverage not active (1); Plan exclusion (not a covered benefit) (1); Site of care (use a lower-cost site) (1); Out-of-network provider or facility (1). |  | 20% | Medical necessity criteria not met |
| `dt_denial_rationale` | text | TEXT | Payer's stated reason, in its own words. |  | 20% | Reviewer determined the request did not meet Payer radiol... |
| `dt_reviewer_type` | enum | HEALTH | Who decided: automated rules, nurse reviewer or medical director (physician). *Values in this data:* Nurse reviewer (55); Medical director (physician) (52); Automated rules engine (24). |  | 95% | Nurse reviewer |
| `dt_reviewer_specialty_match` | flag | HEALTH | Y if a physician of the same specialty reviewed a denial (many states and plans require it). *Values in this data:* Y (18); N (10). | Y / N | 20% | Y |
| `dt_info_requested` | flag | HEALTH | Y if the payer asked for more information before deciding. *Values in this data:* N (113); Y (21). | Y / N | 97% | N |
| `dt_info_requested_datetime` | datetime | **ID (C)** | When the payer asked. | UTC, ISO 8601 | 15% | 2026-04-15T17:00:43Z |
| `dt_info_received_datetime` | datetime | **ID (C)** | When the hospital answered. | UTC, ISO 8601 | 13% | 2026-05-01T13:31:20Z |
| `dt_pend_hours` | decimal | HEALTH | Hours the request waited on the hospital. | hours | 15% | 336.0 |
| `dt_p2p_offered` | flag | HEALTH | Y if the payer offered a doctor-to-doctor call (peer-to-peer). *Values in this data:* Y (18); N (8). | Y / N | 19% | Y |
| `dt_p2p_completed` | flag | HEALTH | Y if the call happened. *Values in this data:* Y (9); N (9). | Y / N | 13% | Y |
| `dt_p2p_datetime` | datetime | **ID (C)** | When the call took place. | UTC, ISO 8601 | 7% | 2026-01-23T14:37:32Z |
| `dt_p2p_outcome` | enum | HEALTH | Overturned or Upheld. *Values in this data:* Upheld (6); Overturned (3). |  | 7% | Overturned |
| `dt_appeal_filed` | flag | HEALTH | Y if a formal appeal was filed. *Values in this data:* N (13); Y (10). | Y / N | 17% | Y |
| `dt_appeal_level` | enum | HEALTH | Reconsideration, first-level appeal, or external independent review. *Values in this data:* Reconsideration (5); First-level appeal (4); External independent review (1). |  | 7% | First-level appeal |
| `dt_appeal_filed_date` | date | **ID (C)** | Date the appeal was filed. | YYYY-MM-DD | 7% | 2026-04-10 |
| `dt_appeal_decision` | enum | HEALTH | Appeal result. *Values in this data:* Overturned (approved) (7); Upheld (denial stands) (2). |  | 7% | Overturned (approved) |
| `dt_appeal_decision_date` | date | **ID (C)** | Date of the appeal result. | YYYY-MM-DD | 7% | 2026-04-28 |
| `dt_final_outcome` | enum | HEALTH | Where it ended after peer-to-peer and appeals. Blank while still open. *Values in this data:* Approved (103); Denied - no further action (12); Approved on appeal (7); Approved after peer-to-peer (3); Denied - upheld (2); Partially approved (2). |  | 93% | Approved |
| `dt_service_status` | enum | HEALTH | Whether the service happened. *Values in this data:* Completed (104); Scheduled (7); Not performed (6); Alternative treatment (6); Cancelled by patient (5); Delayed (4); Rescheduled (3); Pending authorization (3). |  | 100% | Completed |
| `dt_service_delay_days` | integer | HEALTH | Days the service was pushed back because of the authorization process. |  | 83% | 1 |
| `dt_claim_status` | enum | HEALTH | Billing status; shows the money consequence of the authorization. *Values in this data:* Paid (79); Not billed (24); Pending payment (23); Not yet billed (10); Denied - no authorization (2). |  | 100% | Paid |

### 19. Work effort and money at stake

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `wk_staff_touches` | integer | HEALTH | Times staff handled the request (calls, uploads, follow-ups). |  | 100% | 6 |
| `wk_staff_minutes` | integer | HEALTH | Total staff minutes. |  | 100% | 61 |
| `wk_payer_calls` | integer | HEALTH | Phone calls to the payer. |  | 100% | 2 |
| `wk_fax_pages` | integer | HEALTH | Fax pages sent. |  | 100% | 0 |
| `wk_first_pass_approved` | flag | HEALTH | Y if approved on the first submission with no extra work. *Values in this data:* Y (87); N (51). | Y / N | 100% | Y |
| `wk_revenue_at_risk_usd` | decimal | HEALTH | Estimated allowed amount lost if the request stays denied. | US dollars | 100% | 0.0 |
| `wk_staff_cost_usd` | decimal | HEALTH | Staff time cost at a blended hourly rate. | US dollars | 100% | 38.63 |

### 20. System audit fields

| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |
|---|---|---|---|---|---|---|
| `created_at` | datetime | **ID (C)** | When this request row was created in the authorization system (when staff opened the work item). | UTC, ISO 8601 | 100% | 2026-01-16T03:38:48Z |
| `updated_at` | datetime | **ID (C)** | When this row last changed: new status, decision, document upload or appeal event. Never earlier than created_at. | UTC, ISO 8601 | 100% | 2026-02-21T13:03:32Z |
