"""Entry point: python3 -m generator.build"""
from __future__ import annotations

import random
from datetime import datetime, timedelta
from typing import Dict, List

from . import config, reference as ref
from .outcomes import fmt
from .patients import build_patients
from .requests import build_requests
from .schema_patient import PATIENT_SCHEMA
from .schema_request import REQUEST_SCHEMA
from .writer import write_csv


def add_patient_audit_fields(rng: random.Random, patients: List[Dict[str, object]], requests: List[Dict[str, object]]) -> None:
    by_patient: Dict[str, List[Dict[str, object]]] = {}
    for r in requests:
        by_patient.setdefault(r["patient_id"], []).append(r)
    for p in patients:
        reqs = by_patient.get(p["patient_id"], [])
        p["pa_request_count"] = len(reqs)
        admits = [r for r in reqs if r["service_key"] == "INPT_ADMIT"]
        p["hospitalizations_12mo"] = len(admits) + (1 if p["has_heart_failure"] == "Y" and rng.random() < .3 else 0)
        created = datetime.strptime(p["first_registered_date"], "%Y-%m-%d") + timedelta(hours=rng.randint(7, 17), minutes=rng.randint(0, 59), seconds=rng.randint(0, 59))
        latest = [datetime.strptime(p["pcp_last_visit_date"], "%Y-%m-%d") + timedelta(hours=15),
                  datetime.strptime(p["last_labs_date"], "%Y-%m-%d") + timedelta(hours=11)]
        latest += [datetime.strptime(r["updated_at"], "%Y-%m-%dT%H:%M:%SZ") for r in reqs]
        updated = min(config.AS_OF, max(latest + [created]) + timedelta(minutes=rng.randint(1, 20)))
        p["created_at"], p["updated_at"] = fmt(created), fmt(updated)


def main() -> None:
    rng = random.Random(config.SEED)
    providers = ref.build_providers(rng)
    patients = build_patients(rng, providers)
    requests = build_requests(rng, patients, providers)
    add_patient_audit_fields(rng, patients, requests)
    write_csv(config.PATIENTS_CSV, PATIENT_SCHEMA, patients)
    write_csv(config.REQUESTS_CSV, REQUEST_SCHEMA, requests)
    print("patients: %d  requests: %d  request columns: %d  patient columns: %d" % (
        len(patients), len(requests), len(REQUEST_SCHEMA.names), len(PATIENT_SCHEMA.names)))


if __name__ == "__main__":
    main()
