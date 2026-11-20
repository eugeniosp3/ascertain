"""Which documents a request needs, which were attached, and how many pages were sent."""
from __future__ import annotations

import random
from typing import Dict, List, Tuple

from .services import DOCS, Service

MISSING_P = {"visit_note": .04, "imaging_report": .08, "lab_report": .10, "pt_notes": .20, "medical_necessity_letter": .15,
             "pathology_report": .08, "sleep_study_report": .06, "cardiac_testing_report": .07, "specialist_consult": .15,
             "inpatient_record": .03}
PAGES = {"visit_note": (3, 8), "imaging_report": (1, 3), "lab_report": (2, 5), "pt_notes": (6, 20), "medical_necessity_letter": (1, 2),
         "pathology_report": (2, 4), "sleep_study_report": (6, 12), "cardiac_testing_report": (2, 6), "specialist_consult": (3, 6),
         "inpatient_record": (20, 60)}
NAMES = {"visit_note": "Visit note", "imaging_report": "Imaging report", "lab_report": "Lab report", "pt_notes": "Physical therapy notes",
         "medical_necessity_letter": "Letter of medical necessity", "pathology_report": "Pathology report", "sleep_study_report": "Sleep study report",
         "cardiac_testing_report": "Cardiac testing report", "specialist_consult": "Specialist consult", "inpatient_record": "Inpatient record (H&P, notes, orders, MAR)"}
STRENGTH_FACTOR = {"strong": 0.6, "borderline": 1.0, "weak": 2.0}


def evaluate(rng: random.Random, service: Service, strength: str) -> Tuple[Dict[str, object], List[str]]:
    """Returns the dc_* columns and the list of missing document names."""
    out: Dict[str, object] = {}
    missing: List[str] = []
    attached = 0
    pages = 0
    for doc in DOCS:
        col = "dc_" + doc if doc != "medical_necessity_letter" else "dc_medical_necessity_letter"
        if doc not in service.docs:
            out[col] = "Not required"
            continue
        if rng.random() < MISSING_P[doc] * STRENGTH_FACTOR[strength]:
            out[col] = "Missing"
            missing.append(NAMES[doc])
        else:
            out[col] = "Attached"
            attached += 1
            pages += rng.randint(*PAGES[doc])
    required = len(service.docs)
    out.update(dc_required_count=required, dc_attached_count=attached, dc_completeness_pct=int(round(100.0 * attached / required)) if required else 100,
               dc_missing_documents="; ".join(missing), dc_attachment_pages=pages)
    return out, missing
