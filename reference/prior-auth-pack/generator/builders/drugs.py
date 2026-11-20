"""Specialty and pharmacy-benefit drugs."""
from __future__ import annotations

from datetime import timedelta

from ..context import Ctx, story, yn


def _ndc(c: Ctx) -> str:
    r = c.rng
    return "%05d-%04d-%02d" % (r.randint(60000, 69999), r.randint(1000, 9999), r.randint(1, 99))


def _tb_and_hep(c: Ctx, tb_required: bool = True) -> None:
    r, s, o = c.rng, c.sheet, c.out
    if tb_required:
        ok = s.check("Tuberculosis test negative within the last 12 months")
        o["rx_tb_screen_result"] = "Negative (IGRA)" if ok else r.choice(["Not done", "Negative (IGRA)"])
        o["rx_tb_screen_date"] = c.days_ago(r.randint(20, 330) if ok else r.randint(400, 800)).isoformat() \
            if o["rx_tb_screen_result"] != "Not done" else ""
    ok = s.check("Hepatitis B screening completed")
    o["rx_hepb_screen_result"] = r.choice(["Negative", "Negative", "Immune (vaccinated)"]) if ok else "Not done"


def _site_of_care(c: Ctx, hospital_justified: bool) -> None:
    c.out["rx_site_of_care"] = "Hospital outpatient infusion"
    c.out["rx_site_of_care_policy_met"] = yn(c.sheet.add("Hospital infusion site meets the payer's site-of-care rule (or an exception reason is documented)", hospital_justified))


def adalimumab(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    ra = c.dx[0].startswith("M0")
    disease = "rheumatoid arthritis" if ra else "plaque psoriasis"
    right_doc = s.check("Prescribed by the required specialist (%s)" % ("rheumatologist" if ra else "dermatologist"))
    c.orderer = ("RHEUM" if ra else "DERM") if right_doc else "PCP"
    s.check("Diagnosis confirmed by a specialist exam and labs/biopsy")
    months = r.randint(3, 9) if s.check("Failed at least 3 months of methotrexate or another standard drug") else r.randint(0, 2)
    if ra:
        measure, value = "DAS28-CRP", round(r.uniform(3.3, 6.9), 1) if s.check("Moderate-to-severe disease activity documented with a score") else round(r.uniform(1.8, 3.1), 1)
    else:
        measure, value = "PASI", round(r.uniform(10, 28), 1) if s.check("Moderate-to-severe disease activity documented with a score") else round(r.uniform(3, 9), 1)
    _tb_and_hep(c)
    concurrent = not s.check("No other biologic being used at the same time", p=0.97)
    renewal = r.random() < 0.2
    response = ""
    if renewal:
        response = yn(s.check("Response to therapy documented (renewal requests)"))
    biosimilar = r.random() < (0.95 if c.resubmission else 0.6)      # a resubmission switches to the preferred product
    exception_roll = r.random()
    preferred_ok = biosimilar or exception_roll < 0.15
    s.add("Preferred biosimilar product requested (or an exception reason is documented)", preferred_ok)
    c.allowed_override = r.uniform(*((2400, 3300) if biosimilar else (5200, 6800))) * 12
    o.update(rx_drug_name="Hyrimoz (adalimumab-adaz)" if biosimilar else "Humira (adalimumab)",
             rx_generic_name="adalimumab-adaz" if biosimilar else "adalimumab",
             rx_product_type="Biosimilar" if biosimilar else "Reference brand", rx_ndc=_ndc(c),
             rx_strength_form="40 mg/0.4 mL autoinjector pen", rx_route="Subcutaneous", rx_dose_regimen="40 mg every 2 weeks",
             rx_quantity_per_30_days=2, rx_days_supply=28, rx_requested_duration_months=12, rx_site_of_care="Self-administered at home",
             rx_formulary_status="Preferred" if biosimilar else "Non-preferred", rx_preferred_alternative="" if biosimilar else "Hyrimoz (adalimumab-adaz)",
             rx_step_therapy_required="Y", rx_step_agents_tried="Methotrexate 20 mg weekly" + ("; sulfasalazine" if ra and r.random() < .4 else ""),
             rx_step_trial_months=months, rx_step_failure_reason="Inadequate response" if months >= 3 else "Still early in trial",
             rx_severity_measure=measure, rx_severity_value=value, rx_specialist_prescriber=yn(right_doc),
             rx_diagnosis_confirmed_by="Rheumatology exam, positive rheumatoid factor and anti-CCP, hand/foot X-rays" if ra else "Dermatology exam and skin biopsy",
             rx_renewal_request=yn(renewal), rx_response_documented=response, rx_benefit_exclusion="N", rx_concurrent_biologic=yn(concurrent),
             rx_monthly_cost_usd=round(c.allowed_override / 12, 2))
    story(c, "Joint pain and swelling" if ra else "Widespread skin plaques",
          "%s with %s despite %d months of methotrexate. Baseline %s %s." % (c.person, disease, months, measure, value),
          "Morning stiffness over an hour; cannot grip" if ra else "Plaques cover the trunk and scalp; sleep and work affected",
          r.randint(40, 150), r.randint(4, 8))


def ustekinumab(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    right_doc = s.check("Prescribed by a gastroenterologist")
    c.orderer = "GI" if right_doc else "PCP"
    s.check("Crohn's disease confirmed by endoscopy and biopsy")
    months = r.randint(3, 10) if s.check("Failed azathioprine/6-MP, steroids or an anti-TNF drug") else r.randint(0, 2)
    hbi = r.randint(8, 16) if s.check("Moderate-to-severe activity documented (Harvey-Bradshaw index 8 or higher)") else r.randint(2, 6)
    _tb_and_hep(c)
    _site_of_care(c, r.random() < 0.5)
    weight = c.patient["_weight"]
    dose = 260 if weight <= 55 else 390 if weight <= 85 else 520
    c.units_override = dose
    c.allowed_override = r.uniform(14000, 24000)
    o.update(rx_drug_name="Stelara (ustekinumab) IV induction", rx_generic_name="ustekinumab", rx_product_type="Reference brand",
             rx_ndc=_ndc(c), rx_strength_form="130 mg/26 mL vial", rx_route="Intravenous", rx_dose_regimen="%d mg IV once (about 6 mg/kg), then 90 mg subcutaneous every 8 weeks" % dose,
             rx_quantity_per_30_days=dose // 130, rx_days_supply=1, rx_requested_duration_months=12, rx_formulary_status="Preferred",
             rx_step_therapy_required="Y", rx_step_agents_tried="Azathioprine 150 mg daily; prednisone taper", rx_step_trial_months=months,
             rx_step_failure_reason="Inadequate response" if months >= 3 else "Still early in trial",
             rx_severity_measure="Harvey-Bradshaw index", rx_severity_value=hbi, rx_specialist_prescriber=yn(right_doc),
             rx_diagnosis_confirmed_by="Colonoscopy with biopsy: ileocolonic ulceration, granulomas", rx_renewal_request="N",
             rx_benefit_exclusion="N", rx_concurrent_biologic="N", rx_monthly_cost_usd=round(c.allowed_override / 12, 2))
    story(c, "Abdominal pain and diarrhea", "%s with %s. Flare despite %d months of standard therapy; Harvey-Bradshaw index %d." % (
        c.person, c.dx[1].lower(), months, hbi), "Six to eight loose stools a day; lost weight", r.randint(30, 200), r.randint(4, 7))


def ocrelizumab(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    c.orderer = "NEURO"
    s.check("Diagnosis confirmed by a neurologist with MRI (McDonald criteria)")
    s.check("Relapsing or primary progressive form documented")
    mri = s.check("Brain MRI within the last 12 months")
    hep = s.check("Hepatitis B screening negative before anti-CD20 therapy")
    s.check("Not taking another disease-modifying therapy at the same time", p=0.95)
    _site_of_care(c, r.random() < 0.6)
    c.allowed_override = r.uniform(24000, 38000) * 2
    c.units_override = 1200
    o.update(rx_drug_name="Ocrevus (ocrelizumab)", rx_generic_name="ocrelizumab", rx_product_type="Reference brand", rx_ndc=_ndc(c),
             rx_strength_form="300 mg/10 mL vial", rx_route="Intravenous", rx_dose_regimen="600 mg IV every 6 months (two infusions requested)",
             rx_quantity_per_30_days=0, rx_days_supply=1, rx_requested_duration_months=12, rx_formulary_status="Preferred",
             rx_step_therapy_required="N", rx_hepb_screen_result="Negative" if hep else "Not done",
             rx_severity_measure="EDSS", rx_severity_value=round(r.choice([1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.5, 6.0]), 1), rx_specialist_prescriber="Y",
             rx_diagnosis_confirmed_by="MRI brain and spine with lesions disseminated in space and time; CSF oligoclonal bands",
             rx_renewal_request="N", rx_benefit_exclusion="N", rx_concurrent_biologic="N", rx_monthly_cost_usd=round(c.allowed_override / 12, 2))
    o["prior_imaging_12mo"] = yn(mri)
    if mri:
        o.update(prior_imaging_modality="MRI brain with and without contrast", prior_imaging_date=c.days_ago(r.randint(30, 300)).isoformat(),
                 prior_imaging_result="Periventricular and juxtacortical T2 lesions; 2 enhancing lesions")
    story(c, "Relapse with leg weakness and vision change", "%s with relapsing multiple sclerosis, 2 relapses in the last 12 months." % c.person,
          "Needs a cane; fatigue limits work", r.randint(60, 300), r.randint(2, 5))


def semaglutide(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    diabetic = c.flags["diabetes"] != "None"
    a1c = c.patient["_labs"]["a1c"]
    c.allowed_override = r.uniform(950, 1450) * 12
    c.orderer = r.choice(["ENDO", "PCP"]) if diabetic else r.choice(["OBES", "PCP"])
    base = dict(rx_generic_name="semaglutide", rx_product_type="Brand", rx_ndc=_ndc(c), rx_route="Subcutaneous", rx_quantity_per_30_days=4,
                rx_days_supply=28, rx_requested_duration_months=12, rx_formulary_status="Preferred", rx_renewal_request="N",
                rx_specialist_prescriber="Y", rx_monthly_cost_usd=round(c.allowed_override / 12, 2))
    s.check("No other GLP-1 drug being used at the same time", p=0.97)
    if diabetic:
        s.add("Type 2 diabetes confirmed by A1c or glucose results", True)
        months = r.randint(3, 12) if s.check("A1c 7.0% or higher despite metformin for 3+ months (or metformin not tolerated)") else r.randint(0, 2)
        s.add("A1c supports need (7.0% or higher)", a1c >= 7.0)
        o.update(base, rx_drug_name="Ozempic (semaglutide)", rx_strength_form="2 mg/3 mL pen (1 mg weekly dose)", rx_dose_regimen="1 mg once weekly",
                 rx_step_therapy_required="Y", rx_step_agents_tried="Metformin 1000 mg twice daily", rx_step_trial_months=months,
                 rx_step_failure_reason="A1c above goal" if months >= 3 else "Still early in trial", rx_benefit_exclusion="N",
                 rx_diagnosis_confirmed_by="HbA1c %.1f%%" % a1c, rx_severity_measure="HbA1c", rx_severity_value=a1c)
        story(c, "High blood sugar", "%s with type 2 diabetes, A1c %.1f%% on metformin." % (c.person, a1c),
              "Frequent thirst and urination; fatigue", r.randint(100, 400), 0)
    else:
        bmi = c.patient["_bmi"]
        conds = sum([bool(c.flags["htn"]), bool(c.flags["osa"]), bool(c.flags["hld"])])
        s.add("BMI 30 or higher, or 27 or higher with a weight-related condition", bmi >= 30 or (bmi >= 27 and conds >= 1))
        months = r.randint(3, 8) if s.check("3 or more months in a supervised diet and exercise program") else r.randint(0, 2)
        excl = r.random() < {"Medicare Advantage": .6, "Medicaid Managed Care": .5, "Commercial": .3, "ACA Marketplace": .4}[c.patient["_lob"]]
        s.add("Plan covers drugs for weight loss (no benefit exclusion)", not excl)
        s.add("No personal or family history of medullary thyroid cancer or MEN2", True)
        o.update(base, rx_drug_name="Wegovy (semaglutide)", rx_strength_form="2.4 mg/0.75 mL pen", rx_dose_regimen="2.4 mg once weekly after dose escalation",
                 rx_step_therapy_required="N", rx_benefit_exclusion=yn(excl), rx_lifestyle_program_months=months,
                 rx_diagnosis_confirmed_by="BMI %.1f documented at visit" % bmi, rx_severity_measure="BMI", rx_severity_value=bmi)
        story(c, "Weight management", "%s with obesity (BMI %.1f)%s." % (c.person, bmi, " and weight-related conditions" if conds else ""),
              "Knee pain and shortness of breath on stairs", r.randint(100, 500), r.randint(0, 3))
    o["rx_concurrent_biologic"] = "N"
