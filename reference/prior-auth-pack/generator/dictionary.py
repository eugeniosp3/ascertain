"""Writes the data dictionary (Markdown + CSV) from the schemas and the real data, so it cannot drift from the files."""
from __future__ import annotations

import csv
from collections import Counter
from typing import Dict, List

from . import config
from .privacy import FREE_TEXT, HEALTH, IDENTIFIER, ITEMS, NOT_PATIENT, QUASI, classify
from .schema import Column, Schema
from .schema_patient import PATIENT_SCHEMA
from .schema_request import REQUEST_SCHEMA
from .services import CATALOG

SHORT = {IDENTIFIER: "ID", QUASI: "QUASI", HEALTH: "HEALTH", FREE_TEXT: "TEXT", NOT_PATIENT: "NONE"}
ENUM_KINDS = ("enum", "flag")


def _load(path) -> List[Dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def _stats(col: Column, rows: List[Dict[str, str]]) -> Dict[str, str]:
    values = [r[col.name] for r in rows if r[col.name] != ""]
    pct = 100.0 * len(values) / len(rows)
    example = values[0] if values else ""
    if len(example) > 60:
        example = example[:57] + "..."
    allowed = ""
    if col.kind in ENUM_KINDS and values:
        counts = Counter(values).most_common(12)
        allowed = "; ".join("%s (%d)" % (v, n) for v, n in counts)
    return {"populated": "%d%%" % round(pct), "example": example, "values": allowed}


def build_records(schema: Schema, rows: List[Dict[str, str]], file_name: str) -> List[Dict[str, str]]:
    records = []
    for col in schema.columns:
        priv = classify(col)
        st = _stats(col, rows)
        records.append({
            "file": file_name, "group": col.group, "column": col.name, "type": col.kind, "description": col.description, "format_or_units": col.note,
            "privacy_tag": priv.tag, "hipaa_safe_harbor_item": priv.item, "safe_harbor_action": priv.action,
            "populated": st["populated"], "example": st["example"], "observed_values_with_counts": st["values"],
        })
    return records


def write_csv(records: List[Dict[str, str]]) -> None:
    with config.DICTIONARY_CSV.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(records[0].keys()), lineterminator="\n")
        w.writeheader()
        w.writerows(records)


def _esc(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def _table(records: List[Dict[str, str]]) -> List[str]:
    lines = ["| Column | Type | Privacy tag | What it means | Format / units | Filled | Example |", "|---|---|---|---|---|---|---|"]
    for r in records:
        tag = SHORT[r["privacy_tag"]]
        if r["hipaa_safe_harbor_item"]:
            tag = "**ID (%s)**" % r["hipaa_safe_harbor_item"].split(")")[0].strip("(")
        desc = r["description"]
        if r["observed_values_with_counts"]:
            desc += " *Values in this data:* " + r["observed_values_with_counts"] + "."
        lines.append("| `%s` | %s | %s | %s | %s | %s | %s |" % (r["column"], r["type"], tag, _esc(desc), _esc(r["format_or_units"]), r["populated"], _esc(r["example"])))
    return lines


def _legend(all_records: List[Dict[str, str]]) -> List[str]:
    counts = Counter(r["privacy_tag"] for r in all_records)
    lines = [
        "## How to read the privacy tags", "",
        "HIPAA does not use the term \"PII\". It protects **PHI** (protected health information): health information that can be tied to a specific person. "
        "The rule for de-identifying data (the \"Safe Harbor\" method, 45 CFR 164.514(b)(2)) lists **18 identifiers** that must be removed, "
        "and they apply to the patient **and to the patient's relatives, employers and household members**. Every tag below follows that list.", "",
        "| Tag in tables | Meaning | Count |", "|---|---|---|",
        "| **ID (A)** to **ID (R)** | One of the HIPAA identifiers. The letter is the item number in the regulation. Treat as PII *and* PHI. | %d |" % counts[IDENTIFIER],
        "| QUASI | Not on the list, but combinations (age + sex + rare condition + small town) can single someone out. | %d |" % counts[QUASI],
        "| HEALTH | Diagnoses, treatments, results, coverage and payment facts. Not identifiers alone, but PHI the moment they sit on a row tied to a person. | %d |" % counts[HEALTH],
        "| TEXT | Free-text narrative. Can accidentally contain names, dates or places, so it must be scrubbed before sharing. | %d |" % counts[FREE_TEXT],
        "| NONE | Describes a doctor's office, facility, payer rule or staff member, not the patient. | %d |" % counts[NOT_PATIENT], "",
        "**The 18 Safe Harbor identifiers** (the ones that appear in this data are marked *used*):", "",
        "| Item | Identifier | In this data? |", "|---|---|---|",
    ]
    used = {r["hipaa_safe_harbor_item"].split(")")[0].strip("(") for r in all_records if r["hipaa_safe_harbor_item"]}
    full = [("A", "Names"), ("B", "Geographic areas smaller than a state: street address, city, county, ZIP (first 3 digits allowed only if the area has over 20,000 people)"),
            ("C", "All elements of dates except year, if tied to the person: birth, admission, discharge, death, **service dates and record timestamps**; and all ages over 89"),
            ("D", "Telephone numbers"), ("E", "Fax numbers (the patient's own)"), ("F", "Email addresses"), ("G", "Social Security numbers"),
            ("H", "Medical record numbers"), ("I", "Health plan beneficiary numbers (member IDs)"), ("J", "Account numbers"), ("K", "Certificate or license numbers"),
            ("L", "Vehicle identifiers and license plates"), ("M", "Device identifiers and serial numbers"), ("N", "Web URLs"), ("O", "IP addresses"),
            ("P", "Biometric identifiers (fingerprints, voice prints)"), ("Q", "Full-face photographs and comparable images"),
            ("R", "Any other unique identifying number, characteristic or code (patient IDs, request IDs, authorization numbers, employer group numbers)")]
    for letter, text in full:
        lines.append("| (%s) | %s | %s |" % (letter, text, "**used**" if letter in used else "no"))
    lines += ["", "**About `created_at` and `updated_at`.** These are timestamps on a row about a patient, so they fall under item (C): "
              "they reveal when that person registered, was authorized or was treated. Under Safe Harbor you would drop them or keep only the year. "
              "This is the conservative reading; your privacy officer makes the final call. A timestamp on a row that is *not* tied to a person (for example a payer-rule table) would not be PHI.", "",
              "**Not in this data on purpose:** Social Security numbers (G), patient fax numbers (E), photos (Q), biometrics (P), URLs (N), IP addresses (O), device serial numbers (M), "
              "vehicle IDs (L), license numbers (K) and account numbers (J). Real authorization work almost never needs them. "
              "No age is above 89 (ages 90+ would have to be grouped as \"90 or older\").", "",
              "**All people, plans and hospitals here are invented.** The tags describe what each field *would be* if this were a real extract."]
    return lines


def _services_table() -> List[str]:
    lines = ["## Service keys (`service_key`)", "", "| Key | Request category | Code | Code system | What it is | Rule set used by the payer |", "|---|---|---|---|---|---|"]
    for s in CATALOG.values():
        lines.append("| `%s` | %s | %s | %s | %s | %s |" % (s.key, s.category, s.code or "NDC (see rx_ndc)", s.code_system, _esc(s.description), _esc(s.criteria_set)))
    return lines


def write_markdown(all_records: List[Dict[str, str]], n_req: int, n_pat: int) -> None:
    out = ["# Data dictionary: prior authorization practice data", "",
           "Two files, both **synthetic** (no real patients). Dataset date: **2026-11-18**.", "",
           "| File | Rows | Columns | One row is... |", "|---|---|---|---|",
           "| `data/patients_100.csv` | %d | %d | one patient |" % (n_pat, len(PATIENT_SCHEMA.names)),
           "| `data/prior_auth_requests_master.csv` | %d | %d | one authorization request (a patient has 1 or more) |" % (n_req, len(REQUEST_SCHEMA.names)),
           "| `data/data_dictionary.csv` | %d | 12 | one column of the two files above (same content as this page, for sorting and filtering) |" % len(all_records), "",
           "**Link between the files:** `patient_id`. **Link inside the requests file:** `related_request_id` points to the earlier request in the same care plan.", "",
           "**Blank cells** in the requests file mean \"does not apply to this kind of request\" (a knee replacement has no PD-L1 score). They do not mean missing data. "
           "The *Filled* column shows how many rows have a value.", "",
           "**Dates and times:** dates are `YYYY-MM-DD`; timestamps are `YYYY-MM-DDTHH:MM:SSZ` in UTC. **Money** is US dollars. "
           "**Codes** are real code systems (ICD-10-CM, CPT, HCPCS, MS-DRG, UB-04 revenue codes, CMS place-of-service) but the *combinations* are invented. "
           "NDC drug codes, policy numbers, member IDs, NPIs and tax IDs are random and not assigned to anyone on purpose.", ""]
    out += _legend(all_records) + [""]
    out += _services_table() + [""]
    out += ["## Patient file columns", ""]
    for g, _cols in PATIENT_SCHEMA.groups().items():
        out += ["### " + g, ""] + _table([r for r in all_records if r["file"] == "patients_100.csv" and r["group"] == g]) + [""]
    out += ["## Request file columns", ""]
    for g, _cols in REQUEST_SCHEMA.groups().items():
        out += ["### " + g, ""] + _table([r for r in all_records if r["file"] == "prior_auth_requests_master.csv" and r["group"] == g]) + [""]
    config.DICTIONARY_MD.parent.mkdir(parents=True, exist_ok=True)
    config.DICTIONARY_MD.write_text("\n".join(out), encoding="utf-8")


def main() -> None:
    pat, req = _load(config.PATIENTS_CSV), _load(config.REQUESTS_CSV)
    records = build_records(PATIENT_SCHEMA, pat, "patients_100.csv") + build_records(REQUEST_SCHEMA, req, "prior_auth_requests_master.csv")
    write_csv(records)
    write_markdown(records, len(req), len(pat))
    print("dictionary: %d columns documented" % len(records))
    print({k: v for k, v in Counter(r["privacy_tag"] for r in records).items()})


if __name__ == "__main__":
    main()
