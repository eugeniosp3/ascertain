"""Vitals, labs and history copied from the patient chart onto the request, with small visit-to-visit changes."""
from __future__ import annotations

from .context import Ctx, yn


def _clip(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def fill_snapshot(c: Ctx) -> None:
    r, p, o = c.rng, c.patient, c.out
    labs, flags = p["_labs"], p["_flags"]
    inpatient = c.service.category.startswith("Inpatient") or c.service.category == "Post-acute care"
    enc = c.days_ago(r.randint(0, 2) if inpatient else r.randint(2, 35))
    weight = round(_clip(p["_weight"] + r.uniform(-1.5, 1.5), 35, 260), 1)
    height = p["_height"]
    bmi = round(weight / (height / 100.0) ** 2, 1)
    o.update(
        encounter_id="ENC-%09d" % r.randint(100000000, 999999999), encounter_date=enc.isoformat(),
        encounter_type="Inpatient progress note" if inpatient else r.choices(["Office visit", "Telehealth visit", "Specialist consult visit"], weights=[.75, .1, .15])[0],
        height_cm=height, weight_kg=weight, bmi=bmi,
        bp_systolic=int(_clip(r.gauss(132 if flags["htn"] else 118, 12), 90, 190)), bp_diastolic=int(_clip(r.gauss(80 if flags["htn"] else 74, 8), 55, 110)),
        heart_rate_bpm=int(_clip(r.gauss(76, 10), 50, 120)), spo2_pct=int(_clip(r.gauss(94 if flags["copd"] else 97, 1.5), 84, 100)),
        smoking_status=p["_smoking"],
        comorb_hypertension=yn(flags["htn"]), comorb_diabetes=flags["diabetes"], comorb_ckd=yn(flags["ckd"]), comorb_copd=yn(flags["copd"]),
        comorb_heart_failure=yn(flags["heart_failure"]), comorb_cad=yn(flags["cad"]), comorb_afib=yn(flags["afib"]), comorb_osa=yn(flags["osa"]),
        comorb_depression=yn(flags["depression"]), comorb_obesity=yn(bmi >= 30), comorb_cancer=yn(flags["cancer"]),
        charlson_comorbidity_index=p["charlson_comorbidity_index"], active_medications=p["active_medications"], drug_allergies=p["drug_allergies"],
        labs_date=enc.replace().isoformat() if inpatient else c.days_ago(r.randint(5, 80)).isoformat(),
        hba1c_pct=round(_clip(labs["a1c"] + r.uniform(-0.3, 0.3), 4.5, 13.0), 1), egfr=int(_clip(labs["egfr"] + r.randint(-3, 3), 15, 130)),
        creatinine_mg_dl=round(_clip(labs["creat"] + r.uniform(-0.06, 0.06), 0.4, 3.5), 2),
        hemoglobin_g_dl=round(_clip(labs["hgb"] + r.uniform(-0.4, 0.4), 8.0, 17.5), 1),
        wbc_k_ul=round(_clip(r.gauss(7.2, 1.8), 3.5, 14.0), 1), platelets_k_ul=int(_clip(r.gauss(255, 55), 120, 450)),
        ldl_mg_dl=int(_clip(labs["ldl"] + r.randint(-8, 8), 40, 200)), inr=round(_clip(r.gauss(1.1 if flags["afib"] else 1.0, 0.08), 0.9, 1.6), 1),
        albumin_g_dl=round(_clip(r.gauss(4.1, 0.3), 2.8, 5.0), 1),
    )
