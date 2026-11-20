"""Consistency checks on the written CSVs. Run: python3 -m generator.validate"""
from __future__ import annotations

import csv
from collections import Counter
from datetime import datetime
from typing import Dict, List

from . import config
from .privacy import classify
from .schema_patient import PATIENT_SCHEMA
from .schema_request import REQUEST_SCHEMA

TS = "%Y-%m-%dT%H:%M:%SZ"


def load(path) -> List[Dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def check(cond: bool, message: str, problems: List[str]) -> None:
    if not cond:
        problems.append(message)


def main() -> int:
    patients, requests = load(config.PATIENTS_CSV), load(config.REQUESTS_CSV)
    problems: List[str] = []
    check(list(patients[0].keys()) == PATIENT_SCHEMA.names, "patient header differs from schema", problems)
    check(list(requests[0].keys()) == REQUEST_SCHEMA.names, "request header differs from schema", problems)
    pids = {p["patient_id"] for p in patients}
    check(len(pids) == len(patients) == 100, "patient ids", problems)
    check(len({r["pa_request_id"] for r in requests}) == len(requests), "request ids not unique", problems)
    as_of = config.AS_OF
    ids = {r["pa_request_id"] for r in requests}
    for p in patients:
        check(int(p["age_years"]) <= 89, "age over 89 %s" % p["patient_id"], problems)
        c, u = datetime.strptime(p["created_at"], TS), datetime.strptime(p["updated_at"], TS)
        check(c <= u <= as_of, "patient audit order %s" % p["patient_id"], problems)
        check(int(p["pa_request_count"]) >= 1, "patient without requests %s" % p["patient_id"], problems)
    for r in requests:
        rid = r["pa_request_id"]
        check(r["patient_id"] in pids, "orphan request " + rid, problems)
        check(r["related_request_id"] == "" or r["related_request_id"] in ids, "bad related id " + rid, problems)
        c, u = datetime.strptime(r["created_at"], TS), datetime.strptime(r["updated_at"], TS)
        check(c <= u <= as_of, "audit order " + rid, problems)
        sub = datetime.strptime(r["submitted_datetime"], TS)
        check(datetime.strptime(r["received_datetime"], TS) <= sub, "received after submitted " + rid, problems)
        if r["decision_datetime"]:
            check(datetime.strptime(r["decision_datetime"], TS) >= sub, "decision before submission " + rid, problems)
            check(datetime.strptime(r["decision_datetime"], TS) <= as_of, "decision in the future " + rid, problems)
        check(not (r["request_status"] == "Approved" and not r["auth_number"]), "approved without auth number " + rid, problems)
        check(not (r["auth_number"] and r["request_status"] not in ("Approved", "Partially approved")), "auth number on non-approved " + rid, problems)
        check(not (r["auth_effective_date"] and r["auth_expiration_date"] < r["auth_effective_date"]), "auth dates reversed " + rid, problems)
        check(int(r["cr_met"]) <= int(r["cr_total"]), "criteria counts " + rid, problems)
        if r["request_status"] == "Denied":
            check(r["dt_denial_category"] != "" and r["dt_denial_rationale"] != "", "denied without reason " + rid, problems)
        check(r["service_end_date"] >= r["service_start_date"], "service dates reversed " + rid, problems)
        check(int(r["patient_age_at_request"]) <= 89, "request age " + rid, problems)
    # every column has a privacy tag
    for schema in (PATIENT_SCHEMA, REQUEST_SCHEMA):
        for col in schema.columns:
            classify(col)

    print("rows: patients=%d requests=%d" % (len(patients), len(requests)))
    print("status:", dict(Counter(r["request_status"] for r in requests)))
    print("first decision:", dict(Counter(r["dt_first_decision"] for r in requests)))
    print("final outcome:", dict(Counter(r["dt_final_outcome"] for r in requests)))
    print("denial categories:", dict(Counter(r["dt_denial_category"] for r in requests if r["dt_denial_category"])))
    print("by service:", dict(Counter(r["service_key"] for r in requests)))
    print("by payer:", dict(Counter(r["line_of_business"] for r in requests)))
    print("urgency:", dict(Counter(r["urgency"] for r in requests)))
    print("within timeframe:", dict(Counter(r["within_timeframe"] for r in requests)))
    empty = [c for c in REQUEST_SCHEMA.names if all(r[c] == "" for r in requests)]
    print("request columns never populated:", empty)
    empty_p = [c for c in PATIENT_SCHEMA.names if all(p[c] == "" for p in patients)]
    print("patient columns never populated:", empty_p)
    print("PROBLEMS: %d" % len(problems))
    for p in problems[:25]:
        print(" -", p)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
