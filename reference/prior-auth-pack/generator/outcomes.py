"""Simulates what the payer does with a request: timing, decision, peer-to-peer, appeal, and the hospital's effort.

All events are placed on a timeline and only those on or before the dataset date (AS_OF) are visible,
so recent requests are still pending, just as they would be in a live work queue.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional

from .config import AS_OF
from .criteria import CriteriaSheet
from .reference import Payer
from .services import Service

FMT = "%Y-%m-%dT%H:%M:%SZ"
AUTO_CATEGORIES = {"Advanced imaging", "Pharmacy drug", "DME", "Therapy", "Diagnostic testing"}
MEDIAN_STANDARD_HOURS = {"Commercial": 84, "Medicare Advantage": 72, "Medicaid Managed Care": 96, "ACA Marketplace": 90}
VALIDITY_DAYS = {"MRI_LSPINE": 90, "MRI_KNEE": 90, "ESI": 90, "TKA": 180, "THA": 180, "FUSION": 180, "PT": 90, "ADALIMUMAB": 365,
                 "USTEKINUMAB": 365, "OCRELIZUMAB": 365, "SEMAGLUTIDE": 365, "PET_CT": 60, "PEMBROLIZUMAB": 120, "BRCA_TEST": 90,
                 "SLEEP_STUDY": 90, "CPAP": 400, "CPAP_CONT": 400, "CGM": 365, "SPECT_MPI": 60, "CARDIAC_CATH": 90, "PCI": 30,
                 "TAVR": 120, "BARIATRIC": 180}
CATEGORY_CODES = {
    "Medical necessity criteria not met": "MN-01", "Insufficient clinical documentation": "AD-02", "Plan exclusion (not a covered benefit)": "BX-03",
    "Out-of-network provider or facility": "NW-04", "Eligibility: coverage not active": "EL-05",
    "Level of care (observation instead of inpatient)": "LC-06", "Site of care (use a lower-cost site)": "SC-07",
    "Step therapy not completed": "ST-08", "Referral not on file": "RF-09", "Continued stay not supported": "CS-10",
}


def fmt(dt: Optional[datetime]) -> str:
    return dt.strftime(FMT) if dt else ""


@dataclass
class DecisionInput:
    rng: random.Random
    service: Service
    payer: Payer
    lob: str
    urgency: str
    submitted: datetime
    planned_service: date
    sheet: CriteriaSheet
    missing_docs: List[str]
    units_requested: int
    allowed: float
    pa_required: bool
    gold_card: bool
    admin_issue: Optional[str]          # a non-clinical problem found at intake (network, eligibility, referral)
    duration_months: Optional[int] = None
    service_end: Optional[date] = None


def denial_category(service: Service, unmet: List[str]) -> str:
    text = " ".join(unmet).lower()
    if "exclusion" in text: return "Plan exclusion (not a covered benefit)"
    if "site-of-care" in text: return "Site of care (use a lower-cost site)"
    if any(label.startswith("Failed") for label in unmet) and (service.channel == "Pharmacy" or service.key in ("USTEKINUMAB", "OCRELIZUMAB")):
        return "Step therapy not completed"
    if service.key == "INPT_ADMIT": return "Level of care (observation instead of inpatient)"
    if service.key == "INPT_CONT_STAY": return "Continued stay not supported"
    return "Medical necessity criteria not met"


def _ln(rng: random.Random, median: float, sigma: float = 0.55) -> float:
    return rng.lognormvariate(math.log(median), sigma)


def _blank_dt() -> Dict[str, object]:
    keys = ["dt_first_decision", "dt_reason_code", "dt_denial_category", "dt_denial_rationale", "dt_reviewer_type", "dt_reviewer_specialty_match",
            "dt_info_requested", "dt_info_requested_datetime", "dt_info_received_datetime", "dt_pend_hours", "dt_p2p_offered", "dt_p2p_completed",
            "dt_p2p_datetime", "dt_p2p_outcome", "dt_appeal_filed", "dt_appeal_level", "dt_appeal_filed_date", "dt_appeal_decision",
            "dt_appeal_decision_date", "dt_final_outcome"]
    return {k: "" for k in keys}


def decide(d: DecisionInput) -> Dict[str, object]:
    r, s, svc, payer = d.rng, d.sheet, d.service, d.payer
    out: Dict[str, object] = _blank_dt()
    exp = d.urgency == "Expedited"
    deadline_h = payer.expedited_deadline_hours if exp else payer.standard_deadline_hours
    out["payer_deadline_hours"] = deadline_h
    out["payer_decision_deadline"] = fmt(d.submitted + timedelta(hours=deadline_h))
    touched: List[datetime] = [d.submitted]            # for updated_at

    # ---- no authorization needed -------------------------------------------------
    if not d.pa_required:
        dec = d.submitted + timedelta(hours=r.uniform(0.1, 3))
        out.update(dt_first_decision="No authorization required", dt_reviewer_type="Automated rules engine", decision_datetime=fmt(dec),
                   turnaround_hours=round((dec - d.submitted).total_seconds() / 3600, 1), within_timeframe="Y", request_status="No authorization required",
                   dt_final_outcome="No authorization required", units_approved="")
        touched.append(dec)
        return _finish(d, out, touched, final_approved=False, approved=False, denied=False, pending=False, resolved_dt=dec, appeals=0, p2p=0, info=False)

    # ---- withdrawn ---------------------------------------------------------------
    if r.random() < 0.02:
        wd = d.submitted + timedelta(hours=r.uniform(6, 120))
        if wd <= AS_OF:
            out.update(dt_first_decision="Withdrawn by provider", request_status="Withdrawn", units_approved="")
            touched.append(wd)
            return _finish(d, out, touched, final_approved=False, approved=False, denied=False, pending=False, resolved_dt=wd, appeals=0, p2p=0, info=False)

    # ---- processing time and automatic approval ----------------------------------
    all_met = s.met == s.total
    auto = (svc.category in AUTO_CATEGORIES and all_met and not d.missing_docs and d.lob != "Medicaid Managed Care" and r.random() < 0.4) or d.gold_card
    if auto:
        processing = r.uniform(0.03, 1.5)
        reviewer = "Automated rules engine"
    else:
        median = (6 if svc.key.startswith("INPT") or svc.key == "IRF_ADMIT" else 16) if exp else MEDIAN_STANDARD_HOURS[d.lob]
        processing = _ln(r, median)
        reviewer = "Nurse reviewer"

    # ---- request for more information --------------------------------------------
    asked = (bool(d.missing_docs) and r.random() < 0.85) or (r.random() < 0.05 and not auto)
    unanswered = False
    pend = 0.0
    if asked and not auto:
        ask_dt = d.submitted + timedelta(hours=max(1.0, processing * 0.4))
        pend = min(300.0, max(4.0, _ln(r, 30, 0.8)))
        unanswered = bool(d.missing_docs) and r.random() < 0.15
        if unanswered:
            pend = 336.0
            recv_dt = None
            decision_dt = ask_dt + timedelta(hours=pend)
        else:
            recv_dt = ask_dt + timedelta(hours=pend)
            decision_dt = recv_dt + timedelta(hours=max(1.0, processing * 0.5))
        out.update(dt_info_requested="Y", dt_info_requested_datetime=fmt(ask_dt) if ask_dt <= AS_OF else "",
                   dt_info_received_datetime=fmt(recv_dt) if recv_dt and recv_dt <= AS_OF else "", dt_pend_hours=round(pend, 1))
        if ask_dt <= AS_OF: touched.append(ask_dt)
        if recv_dt and recv_dt <= AS_OF: touched.append(recv_dt)
    else:
        asked = False
        decision_dt = d.submitted + timedelta(hours=processing)
        out["dt_info_requested"] = "N"
    turnaround = (decision_dt - d.submitted).total_seconds() / 3600
    out["_pend_hours"] = pend

    # ---- not yet decided ---------------------------------------------------------
    if decision_dt > AS_OF:
        ask_visible = out["dt_info_requested_datetime"] != ""
        answered_visible = out["dt_info_received_datetime"] != ""
        out["request_status"] = "Pended - awaiting documentation" if (ask_visible and not answered_visible) else "Submitted - awaiting decision"
        out["dt_info_requested"] = "Y" if ask_visible else "N"
        out["dt_pend_hours"] = out["dt_pend_hours"] if ask_visible else ""
        out["units_approved"] = ""
        out["_pending"] = True
        return _finish(d, out, touched, final_approved=False, approved=False, denied=False, pending=True, resolved_dt=None, appeals=0, p2p=0, info=asked)

    # ---- first decision ----------------------------------------------------------
    unmet_labels = s.unmet_labels
    unmet = len(unmet_labels)
    category = None
    decision = "Approved"
    lob_penalty = 0.04 if d.lob == "Medicaid Managed Care" else 0.0
    if unanswered:
        decision, category = "Denied", "Insufficient clinical documentation"
    elif d.admin_issue and r.random() < {"Out-of-network provider or facility": .6, "Eligibility: coverage not active": 1.0, "Referral not on file": .7}[d.admin_issue]:
        decision, category = "Denied", d.admin_issue
    elif auto:
        decision = "Approved"
    elif unmet == 0:
        decision = "Approved" if r.random() > 0.035 + lob_penalty else "Denied"
        if decision == "Denied": category = denial_category(svc, [])
    elif unmet == 1:
        roll = r.random()
        decision = "Approved" if roll < 0.38 - lob_penalty else "Partially approved" if roll < 0.50 else "Denied"
    else:
        roll = r.random()
        decision = "Approved" if roll < 0.04 else "Partially approved" if roll < 0.12 else "Denied"
    partial_kind = None
    if decision == "Partially approved":
        if svc.channel == "Pharmacy" or svc.key in ("USTEKINUMAB", "OCRELIZUMAB", "PEMBROLIZUMAB"): partial_kind = "duration"
        elif d.units_requested >= 2: partial_kind = "units"
        else: decision = "Denied" if unmet else "Approved"
    if decision in ("Denied", "Partially approved") and category is None:
        category = denial_category(svc, unmet_labels) if unmet_labels else "Medical necessity criteria not met"

    reviewer = "Automated rules engine" if auto else ("Medical director (physician)" if decision != "Approved" else r.choices(["Nurse reviewer", "Medical director (physician)"], weights=[.75, .25])[0])
    out.update(dt_first_decision=decision, dt_reviewer_type=reviewer, decision_datetime=fmt(decision_dt), turnaround_hours=round(turnaround, 1),
               within_timeframe="Y" if turnaround - pend <= deadline_h else "N")
    touched.append(decision_dt)

    # ---- approval details --------------------------------------------------------
    final_approved = decision in ("Approved", "Partially approved")
    units_approved = d.units_requested
    if decision == "Partially approved":
        if partial_kind == "units":
            units_approved = max(1, int(d.units_requested * r.choice([0.5, 0.67, 0.75])))
            out["dt_denial_rationale"] = "Approved %d of %d requested units; remainder not supported by documentation." % (units_approved, d.units_requested)
        else:
            out["dt_denial_rationale"] = "Approved for %d months instead of %d; reauthorization with response documentation required." % (
                max(3, (d.duration_months or 12) // 2), d.duration_months or 12)
    approved = decision == "Approved"
    denied = decision == "Denied"
    resolved_dt = decision_dt
    p2p = appeals = 0
    final_label = "Approved" if approved else "Partially approved" if decision == "Partially approved" else ""
    status = decision if decision != "Denied" else "Denied"

    # ---- denial details, peer-to-peer, appeal ------------------------------------
    if decision in ("Denied", "Partially approved"):
        out.update(dt_denial_category=category, dt_reason_code=CATEGORY_CODES[category])
        if decision == "Denied":
            out["dt_denial_rationale"] = _rationale(category, unmet_labels, svc, d.admin_issue, d.missing_docs)
        out["dt_reviewer_specialty_match"] = "Y" if r.random() < 0.55 else "N"
    if decision == "Denied":
        offered = category not in ("Insufficient clinical documentation", "Eligibility: coverage not active") and r.random() < 0.8
        out["dt_p2p_offered"] = "Y" if offered else "N"
        overturned = False
        if offered:
            done = r.random() < 0.55
            out["dt_p2p_completed"] = "Y" if done else "N"
            if done:
                p2p_dt = decision_dt + timedelta(hours=r.uniform(20, 96))
                if p2p_dt <= AS_OF:
                    overturned = r.random() < (0.55 if unmet <= 1 else 0.35)
                    out["dt_p2p_datetime"] = fmt(p2p_dt)
                    out["dt_p2p_outcome"] = "Overturned" if overturned else "Upheld"
                    touched.append(p2p_dt); p2p = 1
                    if overturned:
                        final_approved, approved, denied, resolved_dt = True, True, False, p2p_dt
                        final_label, status = "Approved after peer-to-peer", "Approved"
                else:
                    out["dt_p2p_completed"] = "Scheduled"
        if denied:
            file_p = 0.6 if d.allowed > 10000 else 0.4
            if r.random() < (file_p if category != "Insufficient clinical documentation" else 0.3):
                level = "Reconsideration" if d.lob == "Medicare Advantage" else "First-level appeal"
                filed = decision_dt + timedelta(days=r.randint(3, 25))
                if filed <= AS_OF:
                    appeals = 1
                    out.update(dt_appeal_filed="Y", dt_appeal_level=level, dt_appeal_filed_date=filed.date().isoformat())
                    touched.append(filed)
                    win = r.random() < (0.72 if d.lob == "Medicare Advantage" else 0.42)
                    adec = filed + timedelta(days=r.randint(5, 30))
                    if not win and r.random() < 0.15:
                        level = "External independent review"; win = r.random() < 0.4; adec += timedelta(days=r.randint(20, 40))
                        out["dt_appeal_level"] = level
                    if adec <= AS_OF:
                        out.update(dt_appeal_decision="Overturned (approved)" if win else "Upheld (denial stands)", dt_appeal_decision_date=adec.date().isoformat())
                        touched.append(adec)
                        if win:
                            final_approved, approved, denied, resolved_dt = True, True, False, adec
                            final_label = "Approved on external review" if level == "External independent review" else "Approved on appeal"
                            status = "Approved"
                        else:
                            final_label, status = "Denied - upheld", "Denied"
                    else:
                        status = "Denied - appeal pending"
                else:
                    out["dt_appeal_filed"] = "N"
            else:
                out["dt_appeal_filed"] = "N"
                final_label = "Denied - no further action" if (decision_dt + timedelta(days=30)) <= AS_OF else ""
    out["request_status"] = status
    out["dt_final_outcome"] = final_label
    out["units_approved"] = units_approved if final_approved else 0
    return _finish(d, out, touched, final_approved=final_approved, approved=approved, denied=denied, pending=False, resolved_dt=resolved_dt, appeals=appeals, p2p=p2p, info=asked, partial_kind=partial_kind)


def _rationale(category: str, unmet: List[str], svc: Service, admin: Optional[str], missing: List[str]) -> str:
    if category == "Insufficient clinical documentation":
        return "Requested information not received within 14 days. Missing: %s." % ("; ".join(missing) if missing else "clinical notes")
    if category == "Plan exclusion (not a covered benefit)":
        return "Plan contract excludes this drug class when used for weight loss."
    if category in ("Out-of-network provider or facility", "Eligibility: coverage not active", "Referral not on file"):
        return {"Out-of-network provider or facility": "Provider or facility is out of network and no network exception was approved.",
                "Eligibility: coverage not active": "Member coverage was not active on the date of service.",
                "Referral not on file": "Required primary care referral was not on file."}[category]
    if not unmet:
        return "Reviewer determined the request did not meet %s." % svc.criteria_set
    return "Clinical criteria not met (%s). Not met: %s." % (svc.criteria_set, "; ".join(unmet))


def _finish(d: DecisionInput, out: Dict[str, object], touched: List[datetime], *, final_approved: bool, approved: bool, denied: bool,
            pending: bool, resolved_dt: Optional[datetime], appeals: int, p2p: int, info: bool, partial_kind: Optional[str] = None) -> Dict[str, object]:
    """Authorization numbers, service status, effort and money."""
    r, svc = d.rng, d.service
    out.setdefault("decision_datetime", "")
    out.setdefault("turnaround_hours", "")
    out.setdefault("within_timeframe", "")
    out.setdefault("units_approved", "")
    out["auth_number"] = out["auth_effective_date"] = out["auth_expiration_date"] = ""
    status = out["request_status"]
    if final_approved and resolved_dt is not None:
        out["auth_number"] = "A%010d" % r.randint(0, 9999999999)
        eff = d.planned_service if resolved_dt.date() <= d.planned_service else resolved_dt.date()
        days = VALIDITY_DAYS.get(svc.key)
        units = out.get("units_approved") or d.units_requested
        if days is None:
            days = max(1, int(units))
        if partial_kind == "duration":
            days = days // 2
        out["auth_effective_date"] = eff.isoformat()
        out["auth_expiration_date"] = (eff + timedelta(days=days)).isoformat()
    # service status
    delay = ""
    if status == "No authorization required":
        sstat = "Completed" if d.planned_service <= AS_OF.date() else "Scheduled"
    elif svc.category in ("Inpatient admission", "Inpatient continued stay", "Post-acute care") and status not in ("Submitted - awaiting decision", "Pended - awaiting documentation", "Withdrawn"):
        sstat = "Completed" if d.service_end <= AS_OF.date() else "In progress"
        delay = max(0, (resolved_dt.date() - d.planned_service).days) if (final_approved and resolved_dt is not None) else ""
    elif final_approved and resolved_dt is not None:
        if d.planned_service > AS_OF.date():
            sstat = "Scheduled"
        else:
            sstat = r.choices(["Completed", "Cancelled by patient", "Rescheduled"], weights=[.93, .04, .03])[0]
        delay = max(0, (resolved_dt.date() - d.planned_service).days)
    elif pending or status in ("Submitted - awaiting decision", "Pended - awaiting documentation"):
        sstat = "Pending authorization"
    elif status == "Withdrawn":
        sstat = "Cancelled by patient" if r.random() < .5 else "Not performed"
    else:
        sstat = r.choices(["Not performed", "Delayed", "Alternative treatment", "Performed without authorization"], weights=[.5, .2, .27, .03])[0]
    out["dt_service_status"] = sstat
    out["dt_service_delay_days"] = delay
    # claim status
    if sstat == "Completed" and final_approved:
        claim = "Paid" if (r.random() < .87 and d.planned_service + timedelta(days=14) <= AS_OF.date()) else "Pending payment"
    elif sstat == "Completed" and status == "No authorization required":
        claim = "Paid" if (r.random() < .93 and d.planned_service + timedelta(days=14) <= AS_OF.date()) else "Pending payment"
    elif sstat == "Performed without authorization":
        claim = "Denied - no authorization"
    elif sstat == "Completed":
        claim = "Denied - no authorization"
    elif sstat in ("Scheduled", "Pending authorization", "In progress"):
        claim = "Not yet billed"
    else:
        claim = "Not billed"
    out["dt_claim_status"] = claim
    if claim == "Paid":
        paid_dt = datetime.combine(d.planned_service, datetime.min.time()) + timedelta(days=r.randint(14, 40), hours=r.randint(8, 16))
        if paid_dt <= AS_OF:
            touched.append(paid_dt)
    # effort
    touches = 3 + (2 if info else 0) + 3 * p2p + 6 * appeals + r.randint(0, 3)
    if out.get("dt_first_decision") == "Approved" and out.get("dt_reviewer_type") == "Automated rules engine":
        touches = r.randint(1, 3)
    minutes = int(touches * r.uniform(7, 13) + (40 if appeals else 0) + (25 if p2p else 0))
    out.update(wk_staff_touches=touches, wk_staff_minutes=minutes, wk_payer_calls=int(math.ceil(touches * r.uniform(.2, .45))),
               wk_first_pass_approved="Y" if (out.get("dt_first_decision") in ("Approved", "No authorization required") and not info and not p2p and not appeals) else "N",
               wk_revenue_at_risk_usd=round(d.allowed if (not final_approved and status not in ("Withdrawn", "No authorization required")) else 0.0, 2),
               wk_staff_cost_usd=round(minutes / 60.0 * 38.0, 2), _touched=max(touched))
    return out
