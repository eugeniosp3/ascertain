"""Cardiac testing and procedures."""
from __future__ import annotations

from ..context import Ctx, inherit, story, yn

CARRY = ["ca_stress_test_type", "ca_stress_test_date", "ca_stress_test_result", "ca_lvef_pct", "ca_ccs_angina_class",
         "ca_antianginal_agents", "ca_max_stenosis_pct", "ca_vessels_diseased", "ca_nyha_class", "ca_pretest_probability"]


def spect_mpi(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    c.orderer = "CARD"
    s.check("Symptoms suggest heart ischemia (chest pain or equivalent) with intermediate pretest probability")
    recent = not s.check("No ischemia testing in the last 12 months (or symptoms are new or worse)")
    s.check("Result would change treatment (cath versus medicine)")
    pharm = r.random() < 0.45
    just = s.check("Imaging stress test is justified (abnormal ECG or cannot exercise)", p=0.9 if pharm else 0.7)
    o.update(ca_ccs_angina_class=r.choice([2, 2, 3]), ca_lvef_pct=r.randint(38, 62), ca_stress_test_type="Regadenoson SPECT" if pharm else "Treadmill SPECT",
             ca_ischemic_eval_12mo=yn(recent), ca_antianginal_agents=r.randint(1, 3), ca_pretest_probability=r.choice(["Intermediate", "Intermediate", "High"]),
             ca_ecg_findings=r.choice(["Left bundle branch block", "ST depression 1.5 mm at rest", "Nonspecific ST-T changes", "Normal"]),
             ca_pharmacologic_stress_justified=yn(pharm and just), ca_nyha_class=r.choice([1, 2, 2]), ca_vessels_diseased="", ca_max_stenosis_pct="")
    if recent:
        o["prior_imaging_12mo"] = "Y"; o["prior_imaging_modality"] = "Stress test"; o["prior_imaging_date"] = c.days_ago(r.randint(90, 330)).isoformat()
    story(c, "Chest pressure with exertion", "%s with %s. Exertional chest pressure for %d weeks relieved by rest." % (c.person, c.dx[1].lower(), r.randint(3, 16)),
          "Stops after one flight of stairs", r.randint(3, 16), r.randint(2, 6))


def _cad_numbers(c: Ctx, positive: bool) -> None:
    r, o = c.rng, c.out
    if not c.related:
        o.update(ca_lvef_pct=r.randint(35, 62), ca_ccs_angina_class=r.choice([2, 3, 3]), ca_antianginal_agents=r.randint(1, 3), ca_nyha_class=r.choice([1, 2, 2]))
    inherit(c, CARRY)
    o["ca_stress_test_result"] = ("Reversible anterior ischemia involving %d%% of myocardium" % r.randint(10, 25)) if positive else \
        "Small fixed inferior defect; no significant ischemia"
    o.setdefault("ca_stress_test_type", "Regadenoson SPECT")
    o.setdefault("ca_stress_test_date", c.days_ago(r.randint(5, 40)).isoformat())


def cardiac_cath(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    c.orderer = r.choice(["CARD", "ICARD"])
    positive = s.check("Positive high-risk stress test, or angina class 3-4 despite medicines")
    _cad_numbers(c, positive)
    agents = int(o.get("ca_antianginal_agents", 2))
    s.add("At least 2 anti-anginal medicines tried (or intolerance documented)", agents >= 2 or r.random() < 0.1)
    s.check("Heart pumping function (LVEF) documented in the last 12 months")
    recent = not s.check("No heart catheterization in the last 12 months")
    o["prior_imaging_12mo"] = yn(recent)
    story(c, "Worsening chest pain", "%s with %s. Stress test: %s." % (c.person, c.dx[1].lower(), o["ca_stress_test_result"]),
          "Chest pressure with minimal exertion", r.randint(4, 20), r.randint(3, 7))


def pci(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    c.orderer = "ICARD"
    inherit(c, CARRY)
    stenosis = r.randint(72, 95) if s.check("Blockage of 70% or more (50% or more in the left main), or FFR 0.80 or lower") else r.randint(45, 66)
    vessels = r.choice([1, 1, 1, 2, 3])
    ffr = round(r.uniform(0.62, 0.79), 2) if stenosis >= 70 else round(r.uniform(0.82, 0.93), 2)
    s.check("Symptoms despite medicine, or high-risk ischemia on testing")
    team = vessels == 1 or s.check("Multi-vessel disease reviewed by heart team (surgeon and cardiologist)")
    if vessels == 1:
        s.add("Multi-vessel disease reviewed by heart team (surgeon and cardiologist)", True)
    s.check("Patient can take dual antiplatelet therapy for the full period")
    o.update(ca_max_stenosis_pct=stenosis, ca_vessels_diseased=vessels, ca_fractional_flow_reserve=ffr, ca_heart_team_evaluation=yn(team and vessels > 1),
             ca_lvef_pct=o.get("ca_lvef_pct", r.randint(38, 62)), ca_ccs_angina_class=o.get("ca_ccs_angina_class", 3))
    story(c, "Heart blockage found at catheterization", "%s with %s. Catheterization showed %d%% narrowing, %d vessel disease, FFR %.2f." % (
        c.person, c.dx[1].lower(), stenosis, vessels, ffr), "Chest pressure with minimal exertion", r.randint(6, 24), r.randint(3, 7))


def tavr(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    c.orderer = "SHEART"
    severe = s.check("Severe aortic stenosis on echo (valve area 1.0 cm2 or less, mean gradient 40 or more, or velocity 4.0 or more)")
    ava = round(r.uniform(0.6, 1.0), 2) if severe else round(r.uniform(1.1, 1.4), 2)
    grad = r.randint(40, 62) if severe else r.randint(22, 36)
    vel = round(r.uniform(4.0, 5.2), 1) if severe else round(r.uniform(2.8, 3.8), 1)
    sym = s.check("Symptoms present (shortness of breath NYHA class 2 or higher, angina or fainting)")
    s.check("Heart team evaluation by a cardiac surgeon and an interventional cardiologist")
    sts = round(r.uniform(2.0, 12.0), 1) if s.check("Surgical risk score (STS) documented") else ""
    s.add("Performed at a center meeting the national coverage requirements", True)
    s.check("Life expectancy of more than 12 months documented")
    o.update(ca_aortic_valve_area_cm2=ava, ca_mean_gradient_mmhg=grad, ca_peak_velocity_ms=vel, ca_nyha_class=r.choice([2, 3, 3]) if sym else 1,
             ca_lvef_pct=r.randint(45, 65), ca_sts_risk_pct=sts, ca_heart_team_evaluation="Y", or_asa_class=3, or_planned_los_days=r.choice([1, 2, 3]))
    story(c, "Shortness of breath and dizziness", "%s with %s. Echo: valve area %.2f cm2, mean gradient %d mmHg, peak velocity %.1f m/s." % (
        c.person, c.dx[1].lower(), ava, grad, vel), "Cannot walk to the mailbox without stopping", r.randint(20, 80), r.randint(0, 3))
