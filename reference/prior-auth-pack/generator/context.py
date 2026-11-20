"""Request context and the helpers every service builder shares."""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Dict, List, Optional, Tuple

from .criteria import CriteriaSheet
from .profiles import Step
from .services import Service


@dataclass
class Ctx:
    rng: random.Random
    patient: Dict[str, object]
    service: Service
    sheet: CriteriaSheet
    step: Step
    request_date: date
    age: int
    dx: Tuple[str, str]
    related: Optional[Dict[str, object]] = None     # output of the previous request in the same care plan
    out: Dict[str, object] = field(default_factory=dict)
    orderer: Optional[str] = None                    # provider specialty override
    allowed_override: Optional[float] = None
    units_override: Optional[int] = None
    resubmission: bool = False                       # a corrected request after a denial

    @property
    def sex(self) -> str:
        return self.patient["_sex"]

    @property
    def flags(self) -> Dict[str, object]:
        return self.patient["_flags"]

    @property
    def person(self) -> str:
        return "%d-year-old %s" % (self.age, "woman" if self.sex == "F" else "man")

    @property
    def pronoun(self) -> str:
        return "she" if self.sex == "F" else "he"

    def days_ago(self, days: int) -> date:
        return self.request_date - timedelta(days=days)

    def weeks_ago(self, weeks: int) -> date:
        return self.request_date - timedelta(weeks=weeks)


def yn(value: bool) -> str:
    return "Y" if value else "N"


def story(c: Ctx, chief: str, hpi: str, limitation: str, weeks: int, pain: int) -> None:
    """Narrative and symptom-timeline fields."""
    onset = c.weeks_ago(max(weeks, 1))
    c.out.update(chief_complaint=chief, history_of_present_illness=hpi, functional_limitation_summary=limitation,
                 symptom_onset_date=onset.isoformat(), symptom_duration_weeks=weeks, pain_score_0_10=pain,
                 dx_onset_date=onset.isoformat())


def treatment(c: Ctx, weeks: int, pt: Optional[int] = None, nsaid: Optional[int] = None, injections: int = 0,
              parts: Optional[List[str]] = None) -> None:
    """Conservative (non-surgical) treatment history."""
    r = c.rng
    if pt is None:
        pt = min(24, int(weeks * r.uniform(0.3, 0.9))) if weeks >= 4 else r.randint(0, 3)
    if nsaid is None:
        nsaid = min(weeks, r.randint(2, max(3, weeks)))
    desc = list(parts or [])
    if pt: desc.append("%d physical therapy sessions" % pt)
    if nsaid: desc.append("%d weeks of anti-inflammatory medicine" % nsaid)
    if injections: desc.append("%d steroid injection%s" % (injections, "s" if injections > 1 else ""))
    desc.append("home exercise program")
    c.out.update(conservative_therapy_weeks=weeks, conservative_pt_sessions=pt, nsaid_trial_weeks=nsaid,
                 steroid_injections_12mo=injections, conservative_therapy_description="; ".join(desc))


def prior_imaging(c: Ctx, modality: str, present: bool, result: str = "") -> None:
    r = c.rng
    c.out["prior_imaging_12mo"] = yn(present)
    if present:
        c.out.update(prior_imaging_modality=modality, prior_imaging_date=c.days_ago(r.randint(60, 330)).isoformat(),
                     prior_imaging_result=result or "Degenerative changes; no acute finding")


def imaging_fields(c: Ctx, modality: str, region: str, contrast: str, xray: bool, changes: bool, guideline: str) -> None:
    r = c.rng
    c.out.update(img_modality=modality, img_body_region=region, img_contrast=contrast,
                 img_xray_done_first=yn(xray), img_result_changes_management=yn(changes),
                 img_guideline_reference=guideline, img_benefit_manager="ImageWise Radiology Management (fictional)")
    if xray:
        c.out["img_xray_date"] = c.days_ago(r.randint(10, 60)).isoformat()


def inherit(c: Ctx, keys: List[str]) -> None:
    """Carry values from the previous request in the care plan (for example a stress test into the cath request)."""
    if c.related:
        for k in keys:
            if k in c.related and c.related[k] not in ("", None):
                c.out[k] = c.related[k]
