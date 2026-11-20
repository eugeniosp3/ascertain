# Prior authorization practice pack

All people, doctors, hospitals and insurers are **invented**. Dataset date: 2026-11-18.

| What | File |
|---|---|
| 1. One-page overview of the work | `docs/01_prior_auth_overview.md` |
| 2. Four real-style scenarios (two pages) | `docs/02_real_scenarios.md` |
| 3. How the person doing the work looks at a patient, and the data they use | `docs/03_reviewer_workflow.md` |
| 4. 100 patient records (76 columns) | `data/patients_100.csv` |
| 5. The big file: 138 authorization requests x 382 columns | `data/prior_auth_requests_master.csv` |
| 6. Data dictionary with HIPAA privacy tags | `docs/04_data_dictionary.md` and `data/data_dictionary.csv` |

Link the two data files with `patient_id`. Blank cells in the requests file mean "does not apply to this kind of request".

## Privacy tags
Every column in the dictionary carries a tag: **IDENTIFIER** (one of HIPAA's 18 Safe Harbor identifiers, with its letter), **QUASI-IDENTIFIER**, **HEALTH DATA**, **FREE TEXT** or **NOT PATIENT DATA**. `created_at` and `updated_at` exist in both files and are tagged as identifier (C), dates tied to a person. See the top of the dictionary for the reasoning.

## Opening the CSVs
Excel drops leading zeros (ZIP codes, MRNs) unless you import the columns as text. Use "Data > From Text/CSV" and set those columns to Text.

## Regenerating
```
cd prior-auth-pack
python3 -m generator.build        # rewrites both CSVs (same seed = same data)
python3 -m generator.validate     # consistency checks (ids, dates, status logic, schema)
python3 -m generator.dictionary   # rewrites the dictionary from the real files
```
The dictionary is generated from the same column definitions that write the CSVs (`generator/schema_*.py`), so they cannot disagree. Privacy tags live in `generator/privacy.py`. To change the seed or the window, edit `generator/config.py`.

## Known limits
- The payer rules are plain-language versions of common policy ideas, not any real payer's policy. InterQual and MCG are licensed and not reproduced.
- Approval, denial and timing rates are tuned to give you plenty of denials to study. They are not industry benchmarks.
- ICD-10, CPT, HCPCS, MS-DRG and revenue codes are real codes, but check them against the current code sets before using them for anything beyond practice. Length-of-stay benchmarks are approximate.
- NPIs pass the NPI check digit but are random; a chance match with a real provider is possible.
