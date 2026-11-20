"""Turns patients and their care plans into authorization request rows."""
from __future__ import annotations

import random
from datetime import date, datetime, time, timedelta
from typing import Dict, List, Optional, Tuple

from . import documents, reference as ref
from .builders import BUILDERS
from .config import AS_OF, FIRST_REQUEST_DATE, LAST_REQUEST_DATE
from .context import Ctx, yn
from .criteria import CriteriaSheet, pick_strength
from .outcomes import DecisionInput, decide, fmt
from .profiles import Step
from .services import CATALOG, Service
from .snapshot import fill_snapshot

REFERRAL_CATEGORIES = {"Surgery", "Outpatient procedure", "Cardiac procedure", "Advanced imaging", "Therapy", "Genetic testing", "Diagnostic testing"}
SURGEON_SOURCE = {"Surgery", "Outpatient procedure", "Cardiac procedure"}
CHANNELS = [("Payer portal", .46), ("X12 278 electronic transaction", .17), ("Fax", .22), ("Phone", .10), ("FHIR prior-authorization API", .05)]
INPATIENT_CHANNELS = [("Payer portal", .55), ("Phone", .2), ("X12 278 electronic transaction", .25)]
ATTACH_BY_CHANNEL = {"Payer portal": "Portal upload", "X12 278 electronic transaction": "X12 275 attachment", "Fax": "Fax", "Phone": "Fax",
                     "FHIR prior-authorization API": "FHIR DocumentReference"}
URGENT_WHY = {"Inpatient admission": "Patient is currently in the hospital", "Inpatient continued stay": "Patient is currently in the hospital",
              "Post-acute care": "Patient is medically ready and waiting in an acute bed", "Cardiac procedure": "Worsening symptoms or high-risk test result",
              "Cardiac diagnostics": "Active chest pain symptoms", "Advanced imaging": "Cancer staging; treatment cannot start without it",
              "Specialty drug (medical benefit)": "Cancer treatment cannot be delayed", "Surgery": "Delay could seriously harm the patient's health"}
STAFF_BY_QUEUE = {q: [ref.STAFF[(i * 2) % 12], ref.STAFF[(i * 2 + 1) % 12]] for i, q in enumerate(ref.WORK_QUEUES)}
WEEKDAY_SHIFT = {5: 2, 6: 1}


def _weighted(rng: random.Random, pairs) -> str:
    return rng.choices([p[0] for p in pairs], weights=[p[1] for p in pairs])[0]


def _age_on(dob: date, when: date) -> int:
    return when.year - dob.year - ((when.month, when.day) < (dob.month, dob.day))


def _weekday(d: date) -> date:
    """Move a weekend date to the next Monday, or back to Friday if that would pass the end of the window."""
    shifted = d + timedelta(days=WEEKDAY_SHIFT.get(d.weekday(), 0))
    if shifted <= LAST_REQUEST_DATE:
        return shifted
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


# --------------------------------------------------------------------------- scheduling
def plan_chain(rng: random.Random, patient: Dict[str, object]) -> List[Tuple[Step, date]]:
    """Pick which steps of the care plan happen and when. Dates stay inside the reporting window."""
    steps = [s for s in patient["_profile"].chain if rng.random() < s.prob]
    if not steps:
        steps = [patient["_profile"].chain[0]]
    spread = sum(s.gap_days[1] for s in steps[1:])
    latest_start = LAST_REQUEST_DATE - timedelta(days=min(spread, 200))
    span = (latest_start - FIRST_REQUEST_DATE).days
    cur = FIRST_REQUEST_DATE + timedelta(days=rng.randint(0, max(span, 1)))
    if rng.random() < 0.14:                    # a live queue: some care plans start in the last ten days
        cur = LAST_REQUEST_DATE - timedelta(days=rng.randint(0, 9))
    plan = []
    for i, step in enumerate(steps):
        if i > 0:
            cur = cur + timedelta(days=rng.randint(*step.gap_days))
        if cur > LAST_REQUEST_DATE:
            break
        plan.append((step, cur))
    return plan


# --------------------------------------------------------------------------- coverage
def _coverage(rng: random.Random, p: Dict[str, object], when: date) -> Dict[str, object]:
    cov_rng = random.Random("coverage-" + str(p["patient_id"]))
    lob = p["_lob"]
    ded = {"Commercial": cov_rng.choice([500, 1500, 2500, 3500, 5000]), "ACA Marketplace": cov_rng.choice([3000, 5000, 7000, 8500])}.get(lob, 0)
    oop = {"Commercial": cov_rng.choice([4000, 6000, 8000]), "ACA Marketplace": cov_rng.choice([7000, 9200]),
           "Medicare Advantage": cov_rng.choice([4500, 5900, 8300])}.get(lob, 0)
    coins = {"Commercial": cov_rng.choice([10, 20, 20, 30]), "ACA Marketplace": cov_rng.choice([20, 30, 40]), "Medicare Advantage": 20}.get(lob, 0)
    frac = min(1.0, max(0.0, (when.timetuple().tm_yday / 365.0) * cov_rng.uniform(0.4, 1.4)))
    return {"deductible_individual_usd": ded, "deductible_met_ytd_usd": round(ded * frac, 2), "oop_max_usd": oop,
            "oop_met_ytd_usd": round(oop * frac * cov_rng.uniform(0.3, 1.0), 2) if oop else 0, "coinsurance_pct": coins}


def _patient_share(allowed: float, cov: Dict[str, object]) -> float:
    ded_left = max(0.0, cov["deductible_individual_usd"] - cov["deductible_met_ytd_usd"])
    share = min(allowed, ded_left) + max(0.0, allowed - ded_left) * cov["coinsurance_pct"] / 100.0
    if cov["oop_max_usd"]:
        share = min(share, max(0.0, cov["oop_max_usd"] - cov["oop_met_ytd_usd"]))
    return round(share, 2)


# --------------------------------------------------------------------------- facility and provider
def _facility_for(c: Ctx) -> Tuple[ref.Facility, str]:
    svc = c.service
    fac = ref.FACILITIES[svc.facility]
    dept = svc.department
    if svc.key in ("INPT_ADMIT", "INPT_CONT_STAY"):
        fac = ref.FACILITIES[c.patient["home_facility_key"]]            # nearest hospital for this patient
        icu = c.out.get("ip_level_of_care") == "ICU"
        stroke = c.out.get("_stay", {}).get("fam") == "I63"
        if fac.key == "RMC":
            dept = "Neuro ICU" if (stroke and icu) else "Telemetry" if c.out.get("ip_level_of_care") == "Telemetry" else "Inpatient Medicine"
        else:
            dept = "Telemetry" if c.out.get("ip_level_of_care") == "Telemetry" else "Inpatient Medicine"
    return fac, dept


def _service_end(c: Ctx, start: date) -> date:
    o, key = c.out, c.service.key
    if key in ("INPT_ADMIT", "INPT_CONT_STAY"):
        st = o["_stay"]
        return (st["admit"] + timedelta(days=st["los"])).date()
    if key == "IRF_ADMIT":
        return start + timedelta(days=int(o["ip_days_requested"]))
    if key == "PT":
        return start + timedelta(weeks=max(1, int(o["pt_visits_requested"]) // int(o["pt_visits_per_week"])))
    if key in ("ADALIMUMAB", "SEMAGLUTIDE", "USTEKINUMAB", "OCRELIZUMAB", "CGM"):
        return start + timedelta(days=365)
    if key in ("CPAP", "CPAP_CONT"):
        return start + timedelta(days=395)
    if key == "PEMBROLIZUMAB":
        return start + timedelta(weeks=3 * int(o["onc_planned_cycles"]))
    los = o.get("or_planned_los_days")
    return start + timedelta(days=int(los)) if los not in ("", None) else start


# --------------------------------------------------------------------------- one request
def build_request(rng: random.Random, p: Dict[str, object], step: Step, req_date: date, related: Optional[Dict[str, object]],
                  providers: Dict[str, List[ref.Provider]], request_type: Optional[str] = None, strength: Optional[str] = None) -> Dict[str, object]:
    svc: Service = CATALOG[step.service]
    prof = p["_profile"]
    dx = (prof.dx_override.get(step.service) or (p["_dx"],))[0]
    inpatient = svc.key.startswith("INPT") or svc.key == "IRF_ADMIT"
    strength = strength or pick_strength(rng, (0.84, 0.12, 0.04) if inpatient else (0.74, 0.20, 0.06))
    # A resubmission replays the same chart (same seed); the strong case strength fixes the rules that failed.
    seed = related["_builder_seed"] if (request_type == "Resubmission" and related) else rng.random()
    brng = random.Random(seed)
    sheet = CriteriaSheet(brng, strength, boost=(request_type == "Resubmission"))
    age = _age_on(p["_dob"], req_date)
    c = Ctx(rng=brng, patient=p, service=svc, sheet=sheet, step=step, request_date=req_date, age=age, dx=dx, related=related)
    c.resubmission = request_type == "Resubmission"
    fill_snapshot(c)
    BUILDERS[svc.key](c)
    o = c.out
    payer: ref.Payer = p["_payer"]
    lob = p["_lob"]

    # --- timing
    exp = rng.random() < svc.urgent_prob
    urgency = "Expedited" if exp else "Standard"
    received = datetime.combine(req_date, time(rng.randint(7, 16), rng.randint(0, 59), rng.randint(0, 59))) if not inpatient else \
        datetime.combine(req_date, time(rng.randint(6, 21), rng.randint(0, 59), rng.randint(0, 59)))
    if svc.key == "INPT_ADMIT":
        received = o["_stay"]["admit"] + timedelta(minutes=rng.randint(20, 300))
    wait = rng.uniform(0.2, 3) if exp else rng.uniform(0.5, 26)
    submitted = min(received + timedelta(hours=wait), AS_OF - timedelta(minutes=5))
    lead = rng.randint(*svc.lead_days)
    planned = req_date + timedelta(days=lead)
    if svc.key in ("INPT_ADMIT", "INPT_CONT_STAY"):
        planned = o["_stay"]["admit"].date() if svc.key == "INPT_ADMIT" else req_date
    if svc.key == "IRF_ADMIT":
        planned = datetime.strptime(o["ip_admit_datetime"], "%Y-%m-%dT%H:%M:%SZ").date()
    start = planned
    end = _service_end(c, start)

    # --- coverage and intake checks
    cov = _coverage(rng, p, req_date)
    plan_name, plan_type = p["_plan"]
    secondary = p["_secondary"]
    needs_ref = plan_type in ("HMO", "HMO-POS") and svc.category in REFERRAL_CATEGORIES
    ref_on_file = rng.random() < 0.88
    fac, dept = _facility_for(c)
    fac_oon = rng.random() < 0.035
    exc = fac_oon and rng.random() < 0.6
    prov_oon = rng.random() < 0.05
    inactive = rng.random() < 0.012
    pa_required = not (rng.random() < 0.04 and svc.category in ("Therapy", "Diagnostic testing", "DME") or rng.random() < 0.02 and svc.key in ("MRI_KNEE", "MRI_LSPINE"))
    admin_issue = None
    if inactive: admin_issue = "Eligibility: coverage not active"
    elif fac_oon and not exc: admin_issue = "Out-of-network provider or facility"
    elif needs_ref and not ref_on_file: admin_issue = "Referral not on file"
    eligibility = "Inactive" if inactive else ("Active - COB on file" if secondary else "Active")
    gold = (lob in ("Commercial", "Medicare Advantage") and svc.category in ("Advanced imaging", "Surgery", "Outpatient procedure", "Therapy") and rng.random() < 0.07)

    # --- documents
    docs, missing = documents.evaluate(rng, svc, strength)
    channels = INPATIENT_CHANNELS if inpatient else CHANNELS
    channel = _weighted(rng, channels)
    docs["dc_attachment_method"] = ATTACH_BY_CHANNEL[channel]

    # --- units and money
    units = c.units_override if c.units_override is not None else rng.randint(*svc.units)
    allowed = round(c.allowed_override if c.allowed_override is not None else rng.uniform(*svc.allowed), 2)
    duration = o.get("rx_requested_duration_months")

    # --- decision
    decision = decide(DecisionInput(rng=rng, service=svc, payer=payer, lob=lob, urgency=urgency, submitted=submitted, planned_service=planned,
                                    sheet=sheet, missing_docs=missing, units_requested=int(units), allowed=allowed, pa_required=pa_required,
                                    gold_card=gold, admin_issue=admin_issue, duration_months=duration, service_end=end))

    # --- facility, provider
    spec = c.orderer or rng.choice(svc.orderers)
    ordering = rng.choice(providers[spec])
    rendering = ordering
    if svc.category in ("Advanced imaging", "Cardiac diagnostics"): rendering = rng.choice(providers["RAD"] if svc.facility == "RII" else providers["CARD"])
    if svc.key == "PT": rendering = rng.choice(providers["PT"])
    contact_area = ordering.phone[1:4]
    setting_idx = rng.choices(range(len(svc.settings)), weights=[.55, .45][:len(svc.settings)] or [1])[0] if len(svc.settings) > 1 else 0
    pos, pos_name, bill = svc.settings[setting_idx]
    if svc.key in ("TKA", "THA") and age >= 72: setting_idx = 1; pos, pos_name, bill = svc.settings[1]
    rev = svc.revenue_codes[setting_idx]

    # --- criteria summary
    prescreen_docs_ok = not missing
    if sheet.met == sheet.total and prescreen_docs_ok: prescreen = "Likely approve"
    elif sheet.total - sheet.met <= 1 or not prescreen_docs_ok and sheet.met == sheet.total: prescreen = "Needs more documentation"
    else: prescreen = "Likely deny"
    risk = int(min(100, max(0, 80.0 * (1 - sheet.met / float(sheet.total)) + 20.0 * (1 - docs["dc_completeness_pct"] / 100.0) + rng.uniform(-4, 6))))
    met_labels = [l for l, m in sheet.items if m][:2]
    necessity = "%s with %s. Requesting %s. Chart supports: %s. %d of %d payer criteria met." % (
        c.person.capitalize(), c.dx[1].lower(), svc.description.lower(), "; ".join(x.lower() for x in met_labels) or "see note", sheet.met, sheet.total)

    # --- diagnoses
    others = [d for d in p["_problems"] if d[0] != dx[0]][:3]
    sec = {}
    for i in range(3):
        code, text = others[i] if i < len(others) else ("", "")
        sec["secondary_dx_%d_icd10" % (i + 1)] = code
        sec["secondary_dx_%d_description" % (i + 1)] = text

    # --- inpatient discharge fields
    if inpatient:
        o["ip_criteria_vendor"] = "InterQual" if fac.key == "RMC" else "MCG"      # one vendor per hospital, constant through a stay
        admit_dt = datetime.strptime(o["ip_admit_datetime"], "%Y-%m-%dT%H:%M:%SZ")
        los = int(o["ip_days_requested"]) if svc.key == "IRF_ADMIT" else o["_stay"]["los"]
        dis = admit_dt + timedelta(days=los, hours=rng.randint(-3, 5))
        plan_txt = str(o.get("ip_post_acute_plan", "Home"))
        if dis <= AS_OF:
            o["ip_discharge_datetime"] = fmt(dis)
            o["ip_discharge_disposition"] = "Discharged to inpatient rehabilitation" if svc.key == "INPT_ADMIT" and o["_stay"]["fam"] == "I63" and rng.random() < .5 else \
                "Discharged home" if svc.key == "IRF_ADMIT" else plan_txt
            o["ip_readmission_30d"] = yn(rng.random() < 0.13) if dis + timedelta(days=30) <= AS_OF else ""
        if decision.get("units_approved") not in ("", None):
            o["ip_days_approved"] = decision["units_approved"]

    rtype = request_type or step.request_type or svc.default_type
    if o.get("rx_renewal_request") == "Y":
        rtype = "Extension"                      # a drug renewal is an extension of an earlier approval

    # --- assemble the row
    row: Dict[str, object] = dict(o)
    row.update(decision)
    row.update(docs)
    row.update(cov)
    ref_status = "In network" if not fac_oon else "Out of network"
    row.update({
        "related_request_id": related["_temp_id"] if related else "", "patient_id": p["patient_id"], "request_type": rtype,
        "request_category": svc.category, "service_key": svc.key, "urgency": urgency,
        "urgency_reason": URGENT_WHY.get(svc.category, "Delay could seriously harm the patient's health") if exp else "",
        "request_source": "Surgeon scheduling office" if svc.category in SURGEON_SOURCE else svc.source, "work_queue": svc.queue,
        "assigned_specialist_id": rng.choice(STAFF_BY_QUEUE[svc.queue]), "received_datetime": fmt(received), "submitted_datetime": fmt(submitted),
        "submission_channel": channel, "payer_case_number": "%s-%09d" % (payer.id_prefix, rng.randint(0, 999999999)),
        "planned_service_date": planned.isoformat(), "days_submission_to_service": (planned - submitted.date()).days,
        "mrn": p["mrn"], "patient_first_name": p["first_name"], "patient_last_name": p["last_name"], "patient_dob": p["date_of_birth"],
        "patient_age_at_request": age, "patient_sex": p["sex_at_birth"], "patient_race": p["race"], "patient_ethnicity": p["ethnicity"],
        "patient_preferred_language": p["preferred_language"], "patient_interpreter_needed": p["interpreter_needed"],
        "patient_address_line1": p["address_line1"], "patient_city": p["city"], "patient_state": p["state"], "patient_zip": p["zip"], "patient_phone": p["mobile_phone"],
        "payer_name": payer.name, "line_of_business": lob, "plan_name": plan_name, "plan_type": plan_type, "member_id": p["primary_member_id"],
        "group_number": p["primary_group_number"], "subscriber_relationship": "Self" if p["age_years"] >= 26 or rng.random() < .9 else "Child",
        "coverage_effective_date": p["primary_coverage_effective_date"],
        "coverage_termination_date": (req_date - timedelta(days=rng.randint(3, 40))).isoformat() if inactive else "",
        "eligibility_checked_datetime": fmt(submitted - timedelta(hours=rng.uniform(0.5, 40))), "eligibility_status": eligibility,
        "pa_required": yn(pa_required),
        "pa_requirement_source": ("Formulary / pharmacy policy" if svc.channel == "Pharmacy" else "Site-of-care policy" if svc.key in ("USTEKINUMAB", "OCRELIZUMAB")
                                  else "Admission notification rule" if inpatient else "Medical policy" if svc.channel == "DME" else "Payer prior authorization list"),
        "pa_requirement_policy_id": svc.policy, "payer_portal": payer.portal, "secondary_payer_name": p["secondary_payer_name"],
        "secondary_member_id": p["secondary_member_id"], "referral_required": yn(needs_ref), "referral_on_file": yn(ref_on_file) if needs_ref else "",
        "facility_network_status": ref_status, "ordering_provider_network_status": "Out of network" if prov_oon else "In network",
        "out_of_network_exception_requested": yn(exc) if fac_oon else "N",
        "ordering_provider_name": ordering.name, "ordering_provider_npi": ordering.npi, "ordering_provider_specialty": ordering.specialty,
        "ordering_provider_phone": ordering.phone, "ordering_provider_fax": ordering.fax, "ordering_provider_tin": ordering.tin, "ordering_practice_name": ordering.practice,
        "rendering_provider_name": rendering.name, "rendering_provider_npi": rendering.npi, "pcp_name": p["pcp_name"], "pcp_npi": p["pcp_npi"],
        "office_contact_name": "%s %s" % (rng.choice(ref.FEMALE_FIRST), rng.choice(ref.LAST_NAMES)), "office_contact_phone": ref.fake_phone(rng, contact_area),
        "facility_name": fac.name, "facility_npi": fac.npi, "facility_tin": fac.tin, "facility_type": fac.facility_type, "facility_department": dept,
        "place_of_service_code": pos, "place_of_service_desc": pos_name, "bill_type_code": bill, "revenue_code": rev,
        "procedure_code": o.get("procedure_code") or svc.code or o.get("rx_ndc", ""), "code_system": svc.code_system, "code_modifier": "",
        "procedure_description": svc.description, "units_requested": int(units), "service_start_date": start.isoformat(), "service_end_date": end.isoformat(),
        "laterality": o.get("laterality", "Not applicable"), "benefit_channel": svc.channel, "estimated_allowed_amount_usd": allowed,
        "estimated_patient_responsibility_usd": _patient_share(allowed, cov), "primary_dx_icd10": dx[0], "primary_dx_description": dx[1],
        "dc_criteria_set": svc.criteria_set, "dc_policy_id": svc.policy, "dc_medical_necessity_summary": necessity,
        "cr_total": sheet.total, "cr_met": sheet.met, "cr_met_pct": int(round(100.0 * sheet.met / sheet.total)), "cr_detail": sheet.detail(),
        "cr_unmet": "; ".join(sheet.unmet_labels), "cr_medical_necessity_met": yn(sheet.met == sheet.total), "cr_gold_card_exempt": yn(gold),
        "cr_internal_prescreen": prescreen, "cr_denial_risk_score": risk,
    })
    row.update(sec)
    prior_denied = request_type == "Resubmission"
    prior_ext = (rtype == "Extension") and not prior_denied
    planned_ext = prior_denied or step.request_type == "Extension"        # keeps the random draw order stable
    roll = None if planned_ext else rng.random()
    row["prior_pa_same_service"] = yn(prior_denied or prior_ext or (roll is not None and roll < 0.05))
    row["prior_pa_outcome"] = ("Denied; resubmitted with additional documentation" if prior_denied else "Approved; authorization expired or used up" if prior_ext
                               else ("Denied; resubmitted with additional documentation" if row["prior_pa_same_service"] == "Y" else ""))
    row["wk_fax_pages"] = (row["dc_attachment_pages"] + 2 + (4 if row.get("dt_info_requested") == "Y" else 0)) if docs["dc_attachment_method"] == "Fax" else 0
    if svc.key == "PT": row["code_modifier"] = "GP"
    if svc.key in ("TKA", "THA") and row["laterality"] in ("Right", "Left"): row["code_modifier"] = "RT" if row["laterality"] == "Right" else "LT"
    if inpatient:
        row["place_of_service_code"] = pos
    created = received + timedelta(minutes=rng.randint(0, 8), seconds=rng.randint(0, 59))
    touched = max(decision.pop("_touched", submitted), created)
    row["created_at"] = fmt(created)
    row["updated_at"] = fmt(min(AS_OF, touched + timedelta(minutes=rng.randint(0, 3), seconds=rng.randint(0, 59))))
    row["_received"] = received
    row["_builder_seed"] = seed
    return row


OPEN_OR_OK = ("Approved", "Partially approved", "No authorization required")


def _blocks_care_plan(row: Dict[str, object]) -> bool:
    """A denied, withdrawn or still-open prerequisite (scan, stress test, cath) stops the later steps.
    Inpatient stays and therapy do not block: the patient is already in the hospital, or therapy is optional."""
    if row["service_key"] in ("PT", "INPT_ADMIT", "INPT_CONT_STAY"):
        return False
    return row["request_status"] not in OPEN_OR_OK


def _maybe_resubmit(rng, p, step, row, providers):
    """After a denial nobody appealed, the team often fixes the documentation and sends a new request."""
    denied = row["dt_first_decision"] == "Denied" and row["request_status"] == "Denied"
    fixable = row["dt_denial_category"] in ("Insufficient clinical documentation", "Medical necessity criteria not met", "Referral not on file", "Site of care (use a lower-cost site)")
    if not (denied and fixable and row["decision_datetime"]) or rng.random() > 0.4:
        return None
    when = datetime.strptime(row["decision_datetime"], "%Y-%m-%dT%H:%M:%SZ").date() + timedelta(days=rng.randint(4, 16))
    when = _weekday(when)
    if when > LAST_REQUEST_DATE:
        return None
    # the earlier row is the 'related' request; strong case because the documentation was repaired
    return build_request(rng, p, step, when, row, providers, request_type="Resubmission", strength="strong")


def build_requests(rng: random.Random, patients: List[Dict[str, object]], providers: Dict[str, List[ref.Provider]]) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    counter = 0
    for p in patients:
        prev: Optional[Dict[str, object]] = None
        for step, d in plan_chain(rng, p):
            if step.service == "INPT_CONT_STAY" and prev is not None and "_stay" in prev:
                los = prev["_stay"]["los"]
                if los <= 2:
                    continue
                d = prev["_stay"]["admit"].date() + timedelta(days=rng.randint(1, los - 1))
            if step.service == "IRF_ADMIT" and prev is not None and "_stay" in prev:
                d = (prev["_stay"]["admit"] + timedelta(days=prev["_stay"]["los"])).date()
            if CATALOG[step.service].category not in ("Inpatient admission", "Inpatient continued stay", "Post-acute care"):
                d = _weekday(d)
            if d > LAST_REQUEST_DATE:
                continue
            counter += 1
            row = build_request(rng, p, step, d, prev, providers)
            row["_temp_id"] = counter
            rows.append(row)
            prev = row
            resub = _maybe_resubmit(rng, p, step, row, providers)
            if resub is not None:
                counter += 1
                resub["_temp_id"] = counter
                rows.append(resub)
                prev = resub
            if _blocks_care_plan(prev):
                break
    rows.sort(key=lambda r: r["_received"])
    mapping = {}
    for i, r in enumerate(rows, 1):
        mapping[r["_temp_id"]] = "PA-2026-%06d" % i
        r["pa_request_id"] = mapping[r["_temp_id"]]
    for r in rows:
        r["related_request_id"] = mapping.get(r["related_request_id"], "") if r["related_request_id"] != "" else ""
    return rows
