"""Sleep testing, home equipment and weight-loss surgery."""
from __future__ import annotations

from ..context import Ctx, inherit, story, yn

SUPPLIERS = ["Great Lakes Home Medical (fictional)", "Buckeye Respiratory Supply (fictional)", "Heartland DME Partners (fictional)"]


def _supplier(c: Ctx) -> None:
    r, s = c.rng, c.sheet
    from ..reference import make_npi
    in_net = s.check("Equipment supplier is in the patient's network")
    c.out.update(dm_supplier_name=r.choice(SUPPLIERS), dm_supplier_npi=make_npi(r), dm_supplier_in_network=yn(in_net))


def sleep_study(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    c.orderer = r.choice(["PULM", "PCP"])
    epworth = r.randint(11, 20) if s.check("Sleep apnea symptoms documented (snoring, witnessed pauses, daytime sleepiness)") else r.randint(3, 8)
    s.check("Clinical evaluation done before the test was ordered")
    s.check("No sleep study in the last 12 months", p=0.96)
    complex_pt = c.flags["heart_failure"] or c.flags["copd"] or c.patient["_bmi"] >= 45
    inlab = s.add("In-lab test justified (heart failure, COPD, severe obesity) or a home test failed", bool(complex_pt) or r.random() < 0.45)
    reason = "Heart failure" if c.flags["heart_failure"] else "COPD with low oxygen" if c.flags["copd"] else "BMI above 45" if c.patient["_bmi"] >= 45 else \
        "Home test inconclusive" if inlab else ""
    o.update(dm_epworth_score=epworth, dm_sleep_study_type="Attended in-lab polysomnography", dm_home_sleep_test_contraindication=reason,
             dm_sleep_study_date=c.request_date.isoformat(), dm_item="Sleep study", dm_face_to_face_date=c.days_ago(r.randint(7, 40)).isoformat())
    story(c, "Snoring and daytime sleepiness", "%s with BMI %.1f, loud snoring, witnessed apneas and daytime sleepiness (Epworth %d)." % (
        c.person, c.patient["_bmi"], epworth), "Falls asleep at work and while driving", r.randint(26, 160), 0)


def _pap_common(c: Ctx) -> None:
    inherit(c, ["dm_ahi_events_per_hr", "dm_epworth_score", "dm_sleep_study_type"])
    c.out["dm_item"] = "CPAP device"
    c.out["dm_rental_or_purchase"] = "Rental (13 months)"


def cpap(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    c.orderer = "PULM"
    ok = s.check("Sleep study shows AHI 15 or higher (or 5-14 with symptoms or heart/stroke disease)")
    ahi = round(r.uniform(15.5, 64), 1) if ok else round(r.uniform(1.5, 4.8), 1)
    s.check("In-person evaluation before the sleep study")
    signed = s.check("Signed order / certificate of medical necessity")
    _pap_common(c)
    o["dm_sleep_study_date"] = c.days_ago(r.randint(7, 35)).isoformat()
    o["dm_ahi_events_per_hr"] = ahi
    o["dm_cmn_signed"] = yn(signed)
    o.setdefault("dm_epworth_score", r.randint(9, 18))
    o.setdefault("dm_sleep_study_type", "Attended in-lab polysomnography")
    o["dm_face_to_face_date"] = c.days_ago(r.randint(30, 100)).isoformat()
    _supplier(c)
    story(c, "Sleep apnea treatment", "%s with %s. Sleep study AHI %.1f events/hour." % (c.person, c.dx[1].lower(), ahi), "Daytime sleepiness", r.randint(30, 160), 0)


def cpap_continued(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    c.orderer = "PULM"
    ok = s.check("Used CPAP 4+ hours on at least 70% of nights in a 30-day period during the first 90 days")
    pct = r.randint(72, 98) if ok else r.randint(20, 66)
    s.check("Follow-up visit between day 31 and 91 documenting benefit")
    _pap_common(c)
    inherit(c, ["dm_ahi_events_per_hr", "dm_sleep_study_date"])
    o.update(dm_cpap_adherence_pct_nights=pct, dm_cpap_avg_hours_per_night=round(r.uniform(5.0, 7.6) if ok else r.uniform(1.8, 3.9), 1),
             dm_face_to_face_date=c.days_ago(r.randint(5, 40)).isoformat(), dm_cmn_signed="Y")
    _supplier(c)
    story(c, "CPAP follow-up", "%s with %s on CPAP for about 90 days; device download shows use on %d%% of nights." % (c.person, c.dx[1].lower(), pct),
          "Sleeping better" if ok else "Mask discomfort limits use", r.randint(14, 60), 0)


def cgm(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    c.orderer = r.choice(["ENDO", "PCP"])
    s.add("Diabetes diagnosis documented", True)
    inj = r.randint(3, 5) if s.check("Insulin 3+ times daily or a pump, or problem low blood sugars") else r.randint(1, 2)
    lows = r.randint(2, 6) if inj >= 3 or r.random() < 0.5 else 0
    s.check("In-person visit in the last 6 months documenting the insulin plan")
    s.check("Training and a plan to review glucose data documented")
    o.update(dm_item="Continuous glucose monitor (receiver and sensors)", dm_insulin_injections_per_day=inj, dm_hypoglycemia_episodes_3mo=lows,
             dm_face_to_face_date=c.days_ago(r.randint(7, 150)).isoformat(), dm_cmn_signed="Y", dm_rental_or_purchase="Purchase (receiver) plus monthly sensors")
    _supplier(c)
    story(c, "Low blood sugars", "%s with %s on %d insulin injections daily; %d low-glucose episodes in 3 months." % (c.person, c.dx[1].lower(), inj, lows),
          "Fear of overnight lows; frequent fingersticks", r.randint(20, 300), 0)


def bariatric(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    c.orderer = "GENS"
    bmi = c.patient["_bmi"]
    conds = sum([bool(c.flags["htn"]), c.flags["diabetes"] != "None", bool(c.flags["osa"]), bool(c.flags["hld"])])
    s.add("BMI 40 or higher, or 35 or higher with a weight-related condition", bmi >= 40 or (bmi >= 35 and conds >= 1))
    months = r.randint(3, 8) if s.check("3 to 6 months in a supervised weight-management program") else r.randint(0, 2)
    psych = s.check("Psychological evaluation cleared the patient")
    nutr = s.check("Dietitian evaluation completed")
    s.add("Surgery program is accredited (MBSAQIP)", True)
    smoker = c.out.get("smoking_status") == "Current"
    free = s.check("Nicotine-free for at least 6 weeks", p=0.3) if smoker else s.add("Nicotine-free for at least 6 weeks", True)
    s.check("Medical clearance (heart and lung) on file")
    o.update(ba_procedure="Laparoscopic sleeve gastrectomy", ba_comorbidity_count=conds, ba_supervised_diet_months=months, ba_psych_eval_completed=yn(psych),
             ba_nutrition_eval_completed=yn(nutr), ba_program_accredited="Y", ba_prior_bariatric_surgery="N",
             ba_nicotine_free_weeks=r.randint(6, 40) if (free or not smoker) else r.randint(0, 3), or_asa_class=3, or_planned_los_days=r.choice([1, 2]))
    story(c, "Severe obesity", "%s with BMI %.1f and %d weight-related condition%s despite %d months of supervised weight management." % (
        c.person, bmi, conds, "" if conds == 1 else "s", months), "Cannot walk long distances; knee pain; sleep apnea symptoms", r.randint(150, 600), r.randint(2, 5))
