"""Builds the 100 synthetic patients. Public columns go to patients_100.csv; keys starting with '_' stay internal."""
from __future__ import annotations

import random
from datetime import date, timedelta
from typing import Dict, List, Tuple

from . import reference as ref
from .config import AS_OF
from .profiles import PROFILES, Profile

RACES = [("White", .70), ("Black or African American", .17), ("Asian", .05), ("American Indian or Alaska Native", .01),
         ("Native Hawaiian or Other Pacific Islander", .005), ("Two or more races", .045), ("Declined to answer", .02)]
LANGUAGES = [("English", .91), ("Spanish", .055), ("Somali", .008), ("Nepali", .006), ("Arabic", .006), ("Mandarin", .005),
             ("Vietnamese", .005), ("Russian", .005)]
ALLERGIES = ["Penicillin (rash)", "Sulfa drugs (hives)", "Codeine (nausea)", "Morphine (itching)", "Cephalexin (rash)",
             "Lisinopril (cough)", "Iodinated contrast (hives)", "Ibuprofen (stomach upset)"]
HOME_FACILITY = {"knee_oa": "ROS", "hip_oa": "ROS", "low_back": "ROS", "stenosis": "ROS", "meniscal": "ROS", "shoulder": "ROS",
                 "ra": "RII", "crohn": "RII", "psoriasis": "RII", "ms": "RII", "lung": "CRC", "breast": "CRC",
                 "osa": "LCH", "cad": "RHV", "aortic": "RHV", "sev_ob": "RMC", "hf": "LCH", "pna": "LCH", "copd": "LCH",
                 "stroke": "RMC", "cgm": "RMC", "t2dm_glp1": "RMC", "obesity_glp1": "RMC"}


def _weighted(rng: random.Random, pairs: List[Tuple[str, float]]) -> str:
    return rng.choices([p[0] for p in pairs], weights=[p[1] for p in pairs])[0]


def _age_band(age: int) -> int:
    return 0 if age < 40 else 1 if age < 55 else 2 if age < 65 else 3


def _clip(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _bmi_z68(bmi: float) -> Tuple[str, str]:
    if bmi >= 70: return "Z68.45", "Body mass index [BMI] 70 or greater, adult"
    if bmi >= 60: return "Z68.44", "Body mass index [BMI] 60.0-69.9, adult"
    if bmi >= 50: return "Z68.43", "Body mass index [BMI] 50.0-59.9, adult"
    if bmi >= 45: return "Z68.42", "Body mass index [BMI] 45.0-49.9, adult"
    if bmi >= 40: return "Z68.41", "Body mass index [BMI] 40.0-44.9, adult"
    return "Z68.%d" % int(bmi), "Body mass index [BMI] %d.0-%d.9, adult" % (int(bmi), int(bmi))


def _dob_for_age(rng: random.Random, age: int, today: date) -> date:
    """A birth date that makes the person exactly `age` today (calendar years)."""
    latest = date(today.year - age, today.month, today.day)
    earliest = date(today.year - age - 1, today.month, today.day) + timedelta(days=1)
    return earliest + timedelta(days=rng.randint(0, (latest - earliest).days))


def pick_payer(rng: random.Random, age: int) -> str:
    if age >= 65:
        return rng.choices(["PIN", "HMC", "EVG", "NSM"], weights=[.84, .04, .06, .06])[0]
    return rng.choices(["EVG", "NSM", "HMC", "LIB", "PIN"], weights=[.34, .28, .18, .13, .07])[0]


def _comorbidities(rng: random.Random, p: Profile, age: int, bmi: float, smoking: str, dx_primary: str) -> Dict[str, object]:
    band = _age_band(age)
    prev = lambda ps: rng.random() < ps[band]
    forced = p.forced
    flags: Dict[str, object] = {}
    flags["htn"] = bool(forced.get("htn")) or prev((.10, .30, .50, .70))
    if dx_primary.startswith("E10"): flags["diabetes"] = "Type 1"
    elif dx_primary.startswith("E11"): flags["diabetes"] = "Type 2"
    elif "diabetes" in forced: flags["diabetes"] = forced["diabetes"]
    else: flags["diabetes"] = "Type 2" if prev((.08, .15, .22, .28)) else "None"
    flags["ckd"] = prev((.02, .04, .08, .18))
    copd_force = forced.get("copd")
    flags["copd"] = True if copd_force is True else (rng.random() < copd_force if copd_force else
                     prev((.02, .04, .10, .15)) or (smoking == "Current" and rng.random() < .12))
    flags["heart_failure"] = bool(forced.get("heart_failure")) or prev((.01, .01, .03, .08))
    flags["cad"] = bool(forced.get("cad")) or prev((.01, .03, .08, .18))
    flags["afib"] = prev((.01, .01, .04, .10))
    flags["osa"] = dx_primary.startswith("G47") or rng.random() < (.35 if bmi >= 35 else .08)
    flags["depression"] = prev((.12, .15, .15, .12))
    flags["hld"] = prev((.12, .35, .55, .68)) or flags["cad"]
    flags["hypothyroid"] = prev((.05, .06, .09, .12))
    flags["cancer"] = bool(forced.get("cancer")) or dx_primary.startswith("Z85")
    flags["obesity"] = bmi >= 30
    return flags


def _problem_list(p: Profile, dx: Tuple[str, str], flags: Dict[str, object], bmi: float, smoking: str) -> List[Tuple[str, str]]:
    items = [dx] + list(p.second_dx[:1])
    have = {c for c, _ in items}

    def add(code: str, text: str) -> None:
        if code not in have:
            items.append((code, text)); have.add(code)

    if flags["htn"]: add("I10", "Essential (primary) hypertension")
    if flags["hld"]: add("E78.5", "Hyperlipidemia, unspecified")
    if flags["diabetes"] == "Type 2" and not dx[0].startswith("E1"): add("E11.9", "Type 2 diabetes mellitus without complications")
    if flags["diabetes"] == "Type 1" and not dx[0].startswith("E1"): add("E10.9", "Type 1 diabetes mellitus without complications")
    if flags["ckd"]: add("N18.30", "Chronic kidney disease, stage 3 unspecified")
    if flags["copd"]: add("J44.9", "Chronic obstructive pulmonary disease, unspecified")
    if flags["heart_failure"]: add("I50.9", "Heart failure, unspecified")
    if flags["cad"]: add("I25.10", "Atherosclerotic heart disease of native coronary artery without angina pectoris")
    if flags["afib"]: add("I48.91", "Unspecified atrial fibrillation")
    if flags["osa"]: add("G47.33", "Obstructive sleep apnea (adult) (pediatric)")
    if flags["depression"]: add("F32.A", "Depression, unspecified")
    if flags["hypothyroid"]: add("E03.9", "Hypothyroidism, unspecified")
    if flags["obesity"]:
        add("E66.9" if bmi < 40 else "E66.01", "Obesity, unspecified" if bmi < 40 else "Morbid (severe) obesity due to excess calories")
        add(*_bmi_z68(bmi))
    if smoking == "Current": add("F17.210", "Nicotine dependence, cigarettes, uncomplicated")
    if smoking == "Former": add("Z87.891", "Personal history of nicotine dependence")
    return items


def _medications(rng: random.Random, p: Profile, flags: Dict[str, object], sex: str) -> List[str]:
    meds: List[str] = []
    if flags["htn"]: meds.append(rng.choice(["Lisinopril 10 mg daily", "Losartan 50 mg daily", "Amlodipine 5 mg daily", "Lisinopril-HCTZ 20-12.5 mg daily"]))
    if flags["hld"]: meds.append(rng.choice(["Atorvastatin 40 mg nightly", "Rosuvastatin 20 mg nightly", "Simvastatin 20 mg nightly"]))
    if flags["diabetes"] == "Type 2": meds.append("Metformin 1000 mg twice daily")
    if flags["diabetes"] in ("Type 1",): meds.append("Insulin glargine 24 units nightly; insulin lispro per meal scale")
    if flags["heart_failure"]: meds += ["Carvedilol 12.5 mg twice daily", "Furosemide 40 mg daily"]
    if flags["cad"]: meds += ["Aspirin 81 mg daily", "Metoprolol succinate 50 mg daily"]
    if flags["afib"]: meds.append("Apixaban 5 mg twice daily")
    if flags["copd"]: meds += ["Tiotropium 18 mcg inhaled daily", "Albuterol HFA 2 puffs as needed"]
    if flags["depression"]: meds.append(rng.choice(["Sertraline 50 mg daily", "Escitalopram 10 mg daily", "Bupropion XL 150 mg daily"]))
    if flags["hypothyroid"]: meds.append("Levothyroxine 75 mcg daily")
    if p.pain_meds: meds.append(rng.choice(["Meloxicam 15 mg daily", "Naproxen 500 mg twice daily", "Acetaminophen 1000 mg three times daily as needed", "Duloxetine 30 mg daily"]))
    if p.key in ("low_back", "stenosis") and rng.random() < .4: meds.append("Gabapentin 300 mg three times daily")
    if p.key in ("ra", "psoriasis"): meds += ["Methotrexate 20 mg weekly", "Folic acid 1 mg daily"]
    if p.key == "crohn": meds += ["Azathioprine 150 mg daily", "Mesalamine 1.6 g twice daily"]
    if p.key == "ms": meds.append("Vitamin D3 2000 IU daily")
    if p.key == "lung": meds.append("Ondansetron 4 mg as needed")
    if p.key in ("t2dm_glp1", "obesity_glp1") and rng.random() < .5: meds.append("Phentermine 37.5 mg daily")
    if p.key == "cgm": meds.append("Insulin glargine 30 units nightly; insulin aspart with meals")
    if sex == "F" and rng.random() < .12: meds.append("Calcium carbonate 600 mg daily")
    return meds


def _labs(rng: random.Random, flags: Dict[str, object], age: int, sex: str) -> Dict[str, float]:
    diabetic = flags["diabetes"] != "None"
    a1c = _clip(rng.gauss(7.7, 1.3), 6.0, 12.5) if diabetic else _clip(rng.gauss(5.5 if not flags["obesity"] else 5.8, .3), 4.6, 6.6)
    egfr = rng.randint(32, 54) if flags["ckd"] else int(_clip(rng.gauss(98 - .75 * max(0, age - 30), 10), 58, 125))
    creat = round(_clip((90.0 / egfr) ** 0.85 * rng.uniform(.92, 1.08) * (.82 if sex == "F" else 1.0), .5, 2.6), 2)
    return {"a1c": round(a1c, 1), "egfr": egfr, "creat": creat,
            "ldl": int(_clip(rng.gauss(92 if flags["hld"] else 118, 28), 48, 188)),
            "hgb": round(_clip(rng.gauss(13.0 if sex == "F" else 14.4, 1.2), 9.5, 17.0), 1)}


def _person(rng: random.Random, sex: str, used: set) -> Tuple[str, str, str]:
    while True:
        first = rng.choice(ref.FEMALE_FIRST if sex == "F" else ref.MALE_FIRST)
        last = rng.choice(ref.LAST_NAMES)
        if (first, last) not in used:
            used.add((first, last))
            return first, rng.choice("ABCDEFGHJKLMNPRSTW"), last


def build_patients(rng: random.Random, providers: Dict[str, List[ref.Provider]]) -> List[Dict[str, object]]:
    patients: List[Dict[str, object]] = []
    used: set = set()
    today = AS_OF.date()
    seq = 0
    for prof in PROFILES:
        for _ in range(prof.count):
            seq += 1
            age = rng.randint(*prof.age)
            sex = "F" if rng.random() < prof.female_prob else "M"
            dob = _dob_for_age(rng, age, today)
            first, mi, last = _person(rng, sex, used)
            dx = rng.choice(prof.dx)
            height = round(rng.gauss(162.5 if sex == "F" else 176.0, 6.5), 1)
            bmi = round(_clip(rng.gauss(*prof.bmi), 17.5, 62.0), 1)
            if prof.key == "sev_ob": bmi = round(max(bmi, 40.5), 1)
            if prof.key == "obesity_glp1": bmi = round(max(bmi, 30.5), 1)
            if prof.key == "obesity_glp1" and dx[0] == "E66.01": bmi = round(max(bmi, 40.2), 1)
            if prof.key == "t2dm_glp1": bmi = round(max(bmi, 27.5), 1)
            weight = round(bmi * (height / 100.0) ** 2, 1)
            sw = prof.smoking or (.55, .30, .15)
            smoking = rng.choices(["Never", "Former", "Current"], weights=sw)[0]
            flags = _comorbidities(rng, prof, age, bmi, smoking, dx[0])
            problems = _problem_list(prof, dx, flags, bmi, smoking)
            meds = _medications(rng, prof, flags, sex)
            labs = _labs(rng, flags, age, sex)
            payer_key = pick_payer(rng, age)
            payer = ref.PAYERS[payer_key]
            plan_name, plan_type = rng.choice(payer.plans)
            city, state, area, zips = rng.choices(ref.CITIES, weights=ref.CITY_WEIGHTS)[0]
            secondary = None
            if payer_key == "PIN" and rng.random() < .10: secondary = ref.PAYERS["HMC"]
            elif payer_key in ("EVG", "NSM") and age < 65 and rng.random() < .09:
                secondary = ref.PAYERS["NSM" if payer_key == "EVG" else "EVG"]
            pcp = rng.choice(providers["PCP"] + providers["IM"])
            race = _weighted(rng, RACES)
            language = _weighted(rng, LANGUAGES)
            lob = payer.line_of_business
            emp = ("Retired" if age >= 66 and rng.random() < .85 else
                   rng.choice(["Disabled", "Unemployed", "Part-time"]) if lob == "Medicaid Managed Care" else
                   rng.choice(["Self-employed", "Part-time", "Employed full-time"]) if lob == "ACA Marketplace" else
                   "Disabled" if lob == "Medicare Advantage" and age < 65 else "Employed full-time")
            marital = rng.choices(["Married", "Single", "Divorced", "Widowed"],
                                  weights=[.55, .2, .13, .12] if age < 65 else [.5, .08, .14, .28])[0]
            ec_first = rng.choice(ref.FEMALE_FIRST if rng.random() < .6 else ref.MALE_FIRST)
            cci = (0 if age < 50 else 1 if age < 60 else 2 if age < 70 else 3 if age < 80 else 4) \
                + sum([flags["diabetes"] != "None", bool(flags["ckd"]), bool(flags["copd"]), bool(flags["heart_failure"]),
                       bool(flags["cad"]), 2 * bool(flags["cancer"])])
            row = {
                "patient_id": "PT-%04d" % seq,
                "mrn": "%08d" % rng.randint(10000000, 99999999),
                "first_name": first, "middle_initial": mi if rng.random() < .8 else "", "last_name": last,
                "date_of_birth": dob.isoformat(), "age_years": age, "sex_at_birth": sex,
                "gender_identity": ("Woman" if sex == "F" else "Man") if rng.random() < .985 else rng.choice(["Non-binary", "Declined"]),
                "race": race, "ethnicity": "Hispanic or Latino" if rng.random() < .10 or language == "Spanish" else "Not Hispanic or Latino",
                "preferred_language": language,
                "interpreter_needed": "Y" if language != "English" and rng.random() < .7 else "N",
                "marital_status": marital, "employment_status": emp,
                "address_line1": "%d %s %s" % (rng.randint(100, 9899), rng.choice(ref.STREETS), rng.choice(ref.STREET_TYPES)),
                "city": city, "state": state, "zip": rng.choice(zips),
                "home_phone": ref.fake_phone(rng, area), "mobile_phone": ref.fake_phone(rng, area),
                "email": "%s.%s%d@example.com" % (first.lower(), last.lower(), rng.randint(1, 99)),
                "emergency_contact_name": "%s %s" % (ec_first, last if marital == "Married" or rng.random() < .5 else rng.choice(ref.LAST_NAMES)),
                "emergency_contact_relationship": "Spouse" if marital == "Married" else rng.choice(["Daughter", "Son", "Sibling", "Friend"] + (["Parent"] if age < 45 else [])),
                "emergency_contact_phone": ref.fake_phone(rng, area),
                "pcp_name": pcp.name, "pcp_npi": pcp.npi,
                "pcp_last_visit_date": (today - timedelta(days=rng.randint(20, 270))).isoformat(),
                "home_facility_key": ("LCH" if city in ref.NORTHEAST_OHIO else "RMC") if prof.key in ("hf", "pna", "copd", "stroke") else HOME_FACILITY[prof.key],
                "first_registered_date": (today - timedelta(days=rng.randint(400, 3800))).isoformat(),
                "primary_payer_name": payer.name, "primary_line_of_business": lob,
                "primary_plan_name": plan_name, "primary_plan_type": plan_type,
                "primary_member_id": "%s%09d" % (payer.id_prefix, rng.randint(0, 999999999)),
                "primary_group_number": ("GRP%06d" % rng.randint(0, 999999)) if lob == "Commercial" else "",
                "primary_coverage_effective_date": date(rng.choice([2022, 2023, 2024, 2025, 2026, 2026]), 1, 1).isoformat()
                    if lob != "Medicaid Managed Care" else (today - timedelta(days=rng.randint(200, 1200))).isoformat(),
                "secondary_payer_name": secondary.name if secondary else "",
                "secondary_member_id": ("%s%09d" % (secondary.id_prefix, rng.randint(0, 999999999))) if secondary else "",
                "primary_clinical_story": prof.label,
                "height_cm": height, "weight_kg": weight, "bmi": bmi,
                "smoking_status": smoking,
                "alcohol_use": rng.choices(["None", "Social", "Moderate", "Heavy"], weights=[.35, .45, .15, .05])[0],
                "problem_list_icd10": "; ".join(c for c, _ in problems), "problem_list_text": "; ".join(t for _, t in problems),
                "has_hypertension": "Y" if flags["htn"] else "N", "has_diabetes": flags["diabetes"],
                "has_ckd": "Y" if flags["ckd"] else "N", "has_copd": "Y" if flags["copd"] else "N",
                "has_heart_failure": "Y" if flags["heart_failure"] else "N", "has_cad": "Y" if flags["cad"] else "N",
                "has_afib": "Y" if flags["afib"] else "N", "has_osa": "Y" if flags["osa"] else "N",
                "has_depression": "Y" if flags["depression"] else "N", "has_obesity": "Y" if flags["obesity"] else "N",
                "has_cancer_history": "Y" if flags["cancer"] else "N", "charlson_comorbidity_index": cci,
                "active_medications": "; ".join(meds) if meds else "None",
                "drug_allergies": "NKDA" if rng.random() < .62 else rng.choice(ALLERGIES),
                "last_labs_date": (today - timedelta(days=rng.randint(14, 150))).isoformat(),
                "last_hba1c_pct": labs["a1c"], "last_egfr": labs["egfr"], "last_creatinine_mg_dl": labs["creat"],
                "last_ldl_mg_dl": labs["ldl"], "last_hemoglobin_g_dl": labs["hgb"],
                "hospitalizations_12mo": 0, "ed_visits_12mo": rng.choices([0, 1, 2, 3], weights=[.6, .22, .12, .06])[0],
                "housing_status": rng.choices(["Stable", "Lives with family", "Unstable"], weights=[.8, .15, .05])[0],
                "transportation_barrier": "Y" if rng.random() < (.25 if lob == "Medicaid Managed Care" else .06) else "N",
                "advance_directive_on_file": "Y" if rng.random() < (.55 if age >= 70 else .12) else "N",
                "code_status": "Full code" if rng.random() < .85 else rng.choice(["DNR", "Not documented"]),
                "pa_request_count": 0,
                # internal-only helpers for the request builder
                "_profile": prof, "_dx": dx, "_flags": flags, "_labs": labs, "_payer": payer, "_plan": (plan_name, plan_type),
                "_problems": problems, "_meds": meds, "_pcp": pcp, "_secondary": secondary, "_sex": sex, "_dob": dob,
                "_bmi": bmi, "_height": height, "_weight": weight, "_smoking": smoking, "_lob": lob,
            }
            patients.append(row)
    rng.shuffle(patients)
    for i, row in enumerate(patients, 1):      # renumber after shuffle so ids don't follow the story order
        row["patient_id"] = "PT-%04d" % i
    patients.sort(key=lambda r: r["patient_id"])
    return patients
