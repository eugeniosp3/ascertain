"""Imaging, injections, joint and spine surgery, and physical therapy."""
from __future__ import annotations

from ..context import Ctx, imaging_fields, prior_imaging, story, treatment, yn

RED_FLAGS = ["Progressive leg weakness", "Bowel or bladder change", "Saddle numbness", "Unexplained weight loss with cancer history",
             "Fever with recent spinal procedure"]
BACK_ACR = "ACR Appropriateness Criteria: Low Back Pain"


def _smoking_rule(c: Ctx, label: str, weeks_needed: int) -> None:
    """Current smokers only pass if they have quit long enough; everyone else passes."""
    smoking = c.out.get("smoking_status") or c.patient["_smoking"]
    if smoking == "Current":
        met = c.sheet.check(label, p=0.35)
        c.out["or_smoking_cessation_weeks"] = c.rng.randint(weeks_needed, weeks_needed + 10) if met else c.rng.randint(0, 2)
    else:
        c.sheet.add(label, True)
        c.out["or_smoking_cessation_weeks"] = ""


def _a1c_rule(c: Ctx) -> None:
    diabetic = c.flags["diabetes"] != "None"
    a1c = c.out.get("hba1c_pct") or c.patient["_labs"]["a1c"]
    c.sheet.add("HbA1c under 8.0% (diabetics only)", (not diabetic) or a1c < 8.0)


def mri_lspine(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    label = "Red flag documented, or at least 6 weeks of failed conservative care"
    red = r.random() < 0.12
    if red:
        s.add(label, True); weeks = r.randint(1, 5); o["red_flag_detail"] = r.choice(RED_FLAGS)
    else:
        weeks = r.randint(6, 22) if s.check(label) else r.randint(1, 5)
    o["red_flag_present"] = yn(red)
    leg = s.check("Leg pain or a nerve finding is documented")
    o["neuro_deficit_present"] = yn(leg and r.random() < 0.4)
    no_prior = s.check("No MRI or CT of the lumbar spine in the last 12 months")
    prior_imaging(c, "MRI lumbar spine", not no_prior, "Multilevel disc degeneration; no nerve compression described")
    changes = s.check("Note states how the result will change treatment")
    treatment(c, weeks, parts=["NSAIDs", "activity modification"])
    imaging_fields(c, "MRI", "Lumbar spine", "Without contrast", r.random() < 0.75, changes, BACK_ACR)
    story(c, "Low back pain" + (" radiating to the leg" if leg else ""),
          "%s with %s for %d weeks%s. %s" % (c.person, c.dx[1].lower(), weeks, ", pain radiating below the knee" if leg else "",
                                            "Red flag: %s." % o["red_flag_detail"] if red else "Tried conservative care without lasting relief."),
          "Difficulty standing more than 15 minutes; cannot lift groceries", weeks, r.randint(5, 9))


def mri_knee(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    xray = s.check("Weight-bearing knee X-rays done first")
    mech = r.random() < 0.3
    label = "At least 6 weeks of failed conservative care, or mechanical symptoms (locking, catching)"
    if mech:
        s.add(label, True); weeks = r.randint(2, 8)
    else:
        weeks = r.randint(6, 20) if s.check(label) else r.randint(1, 5)
    s.check("Exam findings documented (joint-line tenderness, McMurray test, swelling)")
    no_prior = s.check("No MRI of the same knee in the last 12 months")
    prior_imaging(c, "MRI knee", not no_prior, "Medial meniscus degeneration")
    changes = r.random() < 0.8
    treatment(c, weeks, parts=["bracing", "activity modification"])
    imaging_fields(c, "MRI", "Knee", "Without contrast", xray, changes, "ACR Appropriateness Criteria: Acute Trauma to the Knee / Chronic Knee Pain")
    o["red_flag_present"] = "N"
    story(c, "Knee pain with catching", "%s with %s for %d weeks%s." % (
        c.person, c.dx[1].lower(), weeks, ", reports locking and giving way" if mech else ", pain with twisting and stairs"),
          "Cannot squat, avoids stairs", weeks, r.randint(4, 8))


def esi(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    pain_wk = r.randint(6, 20) if s.check("Nerve-root (radicular) leg pain for at least 4 weeks") else r.randint(1, 3)
    weeks = r.randint(6, 20) if s.check("At least 4 weeks of failed conservative care") else r.randint(1, 3)
    s.check("MRI or CT shows nerve compression that matches the symptoms")
    inj = r.randint(0, 2) if s.check("Fewer than 4 epidural injections in the last 12 months") else r.randint(4, 6)
    s.check("Pain and function scores documented before the injection")
    treatment(c, weeks, injections=inj, parts=["NSAIDs", "gabapentin"])
    prior_imaging(c, "MRI lumbar spine", True, "L4-5 disc protrusion contacting the right L5 nerve root")
    o["red_flag_present"] = "N"; o["neuro_deficit_present"] = yn(r.random() < 0.3)
    o.update(or_functional_score_name="Oswestry Disability Index", or_functional_score_value=r.randint(26, 58))
    story(c, "Leg pain from the back", "%s with %s and leg pain for %d weeks despite conservative care." % (c.person, c.dx[1].lower(), pain_wk),
          "Pain wakes the patient at night; limited walking", max(pain_wk, weeks), r.randint(6, 9))


def _joint(c: Ctx, joint: str) -> None:
    r, s, o = c.rng, c.sheet, c.out
    kl_ok = s.check("X-ray shows severe arthritis (Kellgren-Lawrence grade 3 or 4)")
    kl = r.choice([3, 4, 4]) if kl_ok else r.choice([1, 2, 2])
    weeks = r.randint(14, 60) if s.check("At least 3 months of documented failed conservative care") else r.randint(3, 10)
    s.check("Pain and function loss documented with a score")
    s.add("BMI under 40", c.patient["_bmi"] < 40)
    _a1c_rule(c)
    _smoking_rule(c, "Nicotine-free for at least 4 weeks", 4)
    s.check("Pre-operative medical clearance on file")
    inj = r.randint(0, 3)
    treatment(c, weeks, injections=inj, parts=["weight-bearing exercise", "cane", "acetaminophen"])
    narrowing = {1: "None", 2: "Mild", 3: "Moderate", 4: "Severe"}.get(kl, "None")
    o.update(or_imaging_confirmation="Standing X-ray: %s joint-space narrowing, osteophytes, KL grade %d" % (narrowing.lower(), kl),
             or_kl_grade=kl, or_joint_space_narrowing=narrowing,
             or_functional_score_name="WOMAC", or_functional_score_value=r.randint(52, 88) if kl_ok else r.randint(20, 44),
             or_asa_class=r.choice([2, 2, 3]) if c.patient["_flags"]["diabetes"] != "None" or c.flags["htn"] else 2,
             or_preop_clearance_done="Y", or_planned_implant="Cemented cobalt-chrome / polyethylene system",
             or_planned_los_days=r.choice([0, 1, 2]))
    o["red_flag_present"] = "N"; o["prior_surgery_same_site"] = yn(r.random() < 0.08)
    prior_imaging(c, "X-ray", True, "Joint-space narrowing")
    total = weeks + r.randint(10, 60)
    story(c, "%s pain" % joint, "%s with %s. Symptoms for %d weeks; %d weeks of conservative treatment have not given lasting relief." % (
        c.person, c.dx[1].lower(), total, weeks), "Cannot walk more than one block; difficulty with stairs and sleep", total, r.randint(6, 9))


def tka(c: Ctx) -> None:
    _joint(c, "Knee")
    c.out["laterality"] = "Right" if c.dx[0].endswith("1") else "Left"


def tha(c: Ctx) -> None:
    _joint(c, "Hip")
    c.out["laterality"] = "Right" if c.dx[0].endswith("1") else "Left"
    c.out["or_planned_implant"] = "Cementless titanium stem, ceramic-on-polyethylene bearing"


def fusion(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    instab = s.check("X-ray or MRI shows instability, or a vertebral slip of grade 2 or more, or stenosis needing decompression with instability")
    slip = r.choice([2, 2, 3]) if instab else r.choice([0, 1])
    weeks = r.randint(26, 70) if s.check("At least 6 months of failed conservative care") else r.randint(8, 20)
    odi = r.randint(42, 70) if s.check("Disabling pain: Oswestry score of 40 or higher") else r.randint(18, 36)
    psych = s.check("Psychological screening completed")
    _smoking_rule(c, "Nicotine-free for at least 6 weeks (cotinine confirmed)", 6)
    s.add("BMI under 40", c.patient["_bmi"] < 40)
    s.check("Imaging within the last 12 months")
    inj = r.randint(1, 3)
    treatment(c, weeks, pt=r.randint(10, 24), injections=inj, parts=["epidural steroid injections", "NSAIDs", "gabapentin"])
    o.update(or_imaging_confirmation="Flexion-extension films: %s" % ("4 mm motion at L4-5" if instab else "no abnormal motion"),
             or_radiographic_instability=yn(instab), or_spondylolisthesis_grade=slip, or_levels_requested=1,
             or_functional_score_name="Oswestry Disability Index", or_functional_score_value=odi,
             or_asa_class=r.choice([2, 3, 3]), or_preop_clearance_done=yn(r.random() < 0.9),
             or_psych_screen_done=yn(psych), or_planned_implant="Pedicle screw and rod construct with interbody cage",
             or_planned_los_days=r.choice([2, 3, 3, 4]))
    o["neuro_deficit_present"] = yn(r.random() < 0.5); o["red_flag_present"] = "N"
    prior_imaging(c, "MRI lumbar spine", True, "Grade %d spondylolisthesis at L4-5 with severe central stenosis" % slip)
    story(c, "Back and leg pain", "%s with %s. Pain for %d weeks despite epidural injections, therapy and medicines." % (
        c.person, c.dx[1].lower(), weeks + 20), "Cannot stand more than 5 minutes; walks with a cane", weeks + 20, r.randint(7, 9))


def pt(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    ext = c.step.request_type == "Extension"
    requested = 8 if ext else 12
    cap = r.choice([20, 30, 30, 40, 60])
    fits = s.check("Visits requested fit inside the plan's yearly therapy limit")
    used = r.randint(0, max(0, cap - requested)) if fits else cap - requested + r.randint(2, 10)
    s.check("Functional deficits documented with an objective measure")
    signed = s.check("Physician-signed plan of care with measurable goals")
    s.check("Skilled therapy needed (more than a home exercise program)")
    if ext:
        s.check("Measurable progress documented since the last authorization")
    c.units_override = requested
    o.update(pt_visits_requested=requested, pt_visits_per_week=r.choice([2, 2, 3]), pt_visits_used_ytd=used, pt_annual_visit_cap=cap,
             pt_plan_of_care_signed=yn(signed), pt_measurable_goals_documented=yn(r.random() < 0.85),
             or_functional_score_name="DASH" if "75" in c.dx[0] else "LEFS", or_functional_score_value=r.randint(30, 70))
    weeks = r.randint(3, 14)
    treatment(c, weeks, pt=0, parts=["NSAIDs", "activity modification"])
    story(c, "Shoulder pain and weakness" if "75" in c.dx[0] else "Knee pain",
          "%s with %s. %s" % (c.person, c.dx[1].lower(), "Requesting additional therapy after partial improvement." if ext else "Therapy ordered to restore motion and strength."),
          "Cannot reach overhead or sleep on the affected side" if "75" in c.dx[0] else "Pain with walking and stairs", weeks + 8, r.randint(4, 7))
