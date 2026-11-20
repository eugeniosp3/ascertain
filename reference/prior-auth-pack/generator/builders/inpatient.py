"""Hospital stays: admission review, continued-stay review and inpatient rehab."""
from __future__ import annotations

from datetime import datetime, timedelta

from ..context import Ctx, inherit, story, yn
from ..config import AS_OF

# (MS-DRG, benchmark length of stay in days). Benchmarks are approximate.
DRGS = {
    "I50": [("291", 3.9), ("292", 3.4), ("293", 2.5)],
    "J18": [("193", 4.3), ("194", 3.4), ("195", 2.7)],
    "J44": [("190", 3.9), ("191", 3.3), ("192", 2.5)],
    "I63": [("064", 5.0), ("065", 3.4), ("066", 2.5)],
}
CLINICAL = {
    "I50": ("Dyspnea at rest, SpO2 %d%% on room air, BNP %d pg/mL, weight up %.1f kg, pulmonary edema on chest X-ray",
            "IV furosemide twice daily, continuous telemetry, strict intake and output, oxygen %d L/min", "Heart failure"),
    "J18": ("Temp %.1f C, respiratory rate %d, SpO2 %d%% on room air, WBC %.1f, infiltrate on chest X-ray, CURB-65 score %d",
            "IV ceftriaxone plus azithromycin, supplemental oxygen, blood cultures, repeat labs in 24 hours", "Pneumonia"),
    "J44": ("Severe wheeze, ABG pH 7.%d pCO2 %d, SpO2 %d%% on room air, accessory muscle use",
            "Scheduled nebulizers every 4 hours, IV methylprednisolone, BiPAP, continuous pulse oximetry", "COPD exacerbation"),
    "I63": ("Acute ischemic stroke, NIHSS %d, MRI diffusion restriction, SpO2 %d%%",
            "Neuro checks every hour for 24 hours, telemetry, swallow evaluation, PT/OT/speech therapy, blood pressure targets", "Stroke"),
}
BARRIERS = ["Awaiting skilled nursing facility bed", "Home oxygen not yet delivered", "Awaiting physical therapy evaluation",
            "Family meeting on goals of care pending", "Awaiting echocardiogram result", "Insurance authorization for next level of care pending", "None"]
FAMILY = lambda code: code[:3] if code[:3] in DRGS else "J18"


def _stay(c: Ctx) -> dict:
    """Create the stay on the admission request; reuse it on later reviews."""
    if c.related and "_stay" in c.related:
        return c.related["_stay"]
    r = c.rng
    fam = FAMILY(c.dx[0])
    drg, gm = r.choices(DRGS[fam], weights=[.3, .45, .25])[0]
    los = max(2, int(round(r.gauss(gm + 0.6, 1.4))))
    admit = datetime.combine(c.request_date, datetime.min.time()) + timedelta(hours=r.randint(1, 23), minutes=r.randint(0, 59))
    return {"drg": drg, "gmlos": gm, "los": los, "admit": admit, "fam": fam, "source": r.choices(["Emergency department", "Direct admit", "Transfer"], weights=[.8, .12, .08])[0]}


def _clinical_text(c: Ctx, fam: str, severe: bool) -> tuple:
    r = c.rng
    si, is_, name = CLINICAL[fam]
    if fam == "I50": si = si % ((r.randint(84, 89) if severe else r.randint(90, 94)), r.randint(900, 3200), r.uniform(2.0, 6.5)); is_ = is_ % r.randint(2, 4)
    if fam == "J18": si = si % (r.uniform(38.0, 39.6), r.randint(22, 32), (r.randint(84, 89) if severe else r.randint(90, 94)), r.uniform(12, 22), r.randint(2, 4) if severe else r.randint(0, 1))
    if fam == "J44": si = si % (r.randint(25, 33), r.randint(55, 72), r.randint(80, 88))
    if fam == "I63": si = si % (r.randint(4, 18), r.randint(94, 98))
    return si, is_, name


def _common(c: Ctx, st: dict) -> None:
    o = c.out
    o["_stay"] = st
    o.update(ip_admit_datetime=st["admit"].strftime("%Y-%m-%dT%H:%M:%SZ"), ip_admit_source=st["source"], ip_gmlos_days=st["gmlos"],
             ip_criteria_vendor=c.rng.choice(["InterQual", "MCG"]), ip_expected_total_los_days=st["los"])
    c.units_override = None
    c.out["procedure_code"] = st["drg"]
    c.out["_drg"] = st["drg"]


def admit(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    st = _stay(c)
    fam = st["fam"]
    c.orderer = "HOSP"
    severe = s.check("Severity of illness findings meet criteria")
    si, is_, name = _clinical_text(c, fam, severe)
    s.check("Intensity of service meets criteria (hospital-level treatment ordered)")
    two = s.check("Doctor expects care to cross two midnights")
    s.check("Admission order and H&P documented within 24 hours")
    _common(c, st)
    st_loc = "ICU" if fam == "I63" and r.random() < .5 else "Telemetry"
    o.update(ip_status_requested="Inpatient", ip_level_of_care=st_loc, ip_two_midnight_expectation=yn(two), ip_review_type="Admission review",
             ip_review_day=1, ip_current_los_days=1, ip_days_requested=min(3, st["los"]), ip_severity_of_illness=si, ip_intensity_of_service=is_,
             ip_criteria_subset=name, ip_discharge_barriers="None yet", ip_post_acute_plan="Home with home health" if r.random() < .5 else "To be determined")
    c.units_override = o["ip_days_requested"]
    c.allowed_override = r.uniform(2500, 4000) * st["los"]
    story(c, "Admitted with %s" % name.lower(), "%s presented to the emergency department with %s. %s." % (c.person, name.lower(), si),
          "Unable to manage at home", r.randint(1, 3) * 7 // 7, r.randint(0, 6))
    o["symptom_duration_weeks"] = ""; o["pain_score_0_10"] = ""


def continued_stay(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    st = _stay(c)
    fam = st["fam"]
    c.orderer = "HOSP"
    day = max(2, (c.request_date - st["admit"].date()).days + 1)
    still = s.check("Findings today still need hospital-level care")
    si, is_, name = _clinical_text(c, fam, still)
    s.check("Discharge planning is under way (case management note)")
    s.check("Requested days are within the expected stay for this diagnosis group (benchmark %.1f days)" % st["gmlos"], p=0.8 if day <= st["gmlos"] + 1 else 0.45)
    _common(c, st)
    barrier = r.choice(BARRIERS)
    o.update(ip_status_requested="Inpatient", ip_level_of_care="Medical/surgical" if r.random() < .6 else "Telemetry", ip_two_midnight_expectation="Y",
             ip_review_type="Continued-stay review", ip_review_day=day, ip_current_los_days=day, ip_days_requested=r.randint(1, 3),
             ip_severity_of_illness=si if still else "Vital signs near baseline; oxygen weaned to room air", ip_intensity_of_service=is_ if still else "Oral medicines; mobility with therapy",
             ip_criteria_subset=name, ip_discharge_barriers=barrier,
             ip_post_acute_plan=r.choice(["Home with home health", "Skilled nursing facility", "Home", "Inpatient rehabilitation" if fam == "I63" else "Home with home health"]))
    c.units_override = o["ip_days_requested"]
    c.allowed_override = r.uniform(2500, 4400) * o["ip_days_requested"]
    story(c, "Hospital day %d: %s" % (day, name.lower()), "Hospital day %d for %s in a %s. Barrier to discharge: %s." % (day, name.lower(), c.person, barrier.lower()),
          "Needs help with walking and daily tasks", 1, r.randint(0, 4))
    o["symptom_duration_weeks"] = ""; o["pain_score_0_10"] = ""


def irf(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    st = _stay(c)
    c.orderer = r.choice(["PMR", "HOSP"])
    s.check("Needs active physician supervision and 24-hour rehabilitation nursing")
    s.check("Needs two or more therapy types (PT, OT, speech), including PT or OT")
    tol = s.check("Can take part in 3 hours of therapy a day, 5 days a week")
    s.check("Expected to improve measurably in a reasonable time")
    stable = s.check("Medically stable for transfer")
    s.check("Realistic plan to return home or to the community")
    _common(c, st)
    o["procedure_code"] = "0128"
    o["ip_admit_datetime"] = (datetime.combine(c.request_date, datetime.min.time()) + timedelta(days=1, hours=r.randint(9, 15))).strftime("%Y-%m-%dT%H:%M:%SZ")
    o["ip_admit_source"] = "Transfer from acute care hospital"
    nih = r.randint(5, 18)
    o.update(ip_status_requested="Inpatient", ip_level_of_care="Inpatient rehab", ip_two_midnight_expectation="Y", ip_review_type="Admission review",
             ip_review_day=1, ip_current_los_days=0, ip_days_requested=r.choice([12, 14, 16]), ip_rehab_therapy_hours_per_day=3.0 if tol else r.choice([1.5, 2.0]),
             ip_functional_score_admit=r.randint(30, 60) if tol else r.randint(10, 22), ip_nihss_admit=nih, ip_medical_stability_for_irf=yn(stable),
             ip_severity_of_illness="Right hemiparesis, aphasia, needs assistance for transfers and bathing", ip_intensity_of_service="PT, OT and speech therapy daily; physician visits 3 days a week; rehab nursing",
             ip_criteria_subset="Inpatient rehabilitation: stroke", ip_discharge_barriers="None", ip_post_acute_plan="Home with spouse and outpatient therapy")
    o["ip_expected_total_los_days"] = o["ip_days_requested"]      # rehab stay, not the acute stay
    o["ip_gmlos_days"] = ""                                       # DRG benchmark does not apply to rehab
    c.units_override = o["ip_days_requested"]
    c.allowed_override = r.uniform(1000, 1800) * o["ip_days_requested"]
    story(c, "Stroke recovery", "%s after acute ischemic stroke (NIHSS %d at admission) now medically stable and needing intensive rehabilitation." % (c.person, nih),
          "Cannot walk or dress independently", 2, r.randint(0, 3))
    o["symptom_duration_weeks"] = ""; o["pain_score_0_10"] = ""
