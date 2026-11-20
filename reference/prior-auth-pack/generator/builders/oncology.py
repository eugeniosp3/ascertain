"""Cancer imaging, immunotherapy and genetic testing."""
from __future__ import annotations

from ..context import Ctx, inherit, prior_imaging, story, yn

LUNG_CASES = [
    ("Adenocarcinoma", "IIIA", "T2b N2 M0", "Curative"), ("Adenocarcinoma", "IV", "T3 N2 M1b", "Palliative"),
    ("Squamous cell carcinoma", "IIB", "T2b N1 M0", "Curative"), ("Squamous cell carcinoma", "IV", "T4 N3 M1c", "Palliative"),
    ("Adenocarcinoma", "IIIB", "T3 N3 M0", "Curative"),
]
SITE = {"C34.11": "Right upper lobe", "C34.12": "Left upper lobe", "C34.31": "Right lower lobe", "C34.90": "Lung, lobe not specified"}


def _lung_base(c: Ctx) -> None:
    r, o = c.rng, c.out
    if c.related and c.related.get("onc_histology"):
        inherit(c, ["onc_histology", "onc_stage_group", "onc_tnm", "onc_intent", "onc_primary_site", "onc_ecog"])
        return
    hist, stage, tnm, intent = r.choice(LUNG_CASES)
    o.update(onc_primary_site=SITE.get(c.dx[0], "Lung"), onc_histology=hist, onc_stage_group=stage, onc_tnm=tnm, onc_intent=intent)


def pet_ct(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    c.orderer = "ONC"
    _lung_base(c)
    s.check("Biopsy-proven cancer documented")
    s.check("Purpose stated: staging, restaging or response check that will change treatment")
    s.check("CT or MRI done first and was not definitive")
    recent = not s.check("No PET scan in the last 90 days", p=0.95)
    o["onc_pet_indication"] = r.choice(["Initial staging", "Initial staging", "Restaging", "Treatment response"])
    o.update(onc_conventional_imaging_done="Y", onc_prior_pet_date=c.days_ago(r.randint(20, 80)).isoformat() if recent else (c.days_ago(r.randint(110, 300)).isoformat() if o.get("onc_pet_indication") != "Initial staging" else ""),
             onc_ecog=r.choice([0, 1, 1, 2]), onc_biomarker_tested="", prior_pa_same_service="N")
    prior_imaging(c, "CT chest/abdomen/pelvis with contrast", True, "Right upper lobe mass 4.1 cm; mediastinal nodes enlarged; indeterminate adrenal nodule")
    imaging_text = {"Initial staging": "to stage newly diagnosed lung cancer before choosing surgery versus chemoradiation"}
    story(c, "Newly diagnosed lung cancer", "%s with biopsy-proven %s (%s). PET/CT requested %s." % (
        c.person, o["onc_histology"].lower(), c.dx[1].lower(), imaging_text.get(o["onc_pet_indication"], "to assess disease status")),
          "Cough and fatigue; ECOG %d" % o["onc_ecog"], r.randint(6, 20), r.randint(1, 4))


def pembrolizumab(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    c.orderer = "ONC"
    _lung_base(c)
    s.check("Cancer type confirmed by pathology (non-small cell lung cancer)")
    pdl1 = r.randint(1, 95) if s.check("PD-L1 result documented at 1% or higher") else 0
    driver = not s.check("No EGFR or ALK mutation (these patients have better-matched drugs)", p=0.9)
    ecog = r.choice([0, 1, 1]) if s.check("Performance status ECOG 0-1") else r.choice([2, 3])
    nccn = s.check("Regimen listed in NCCN guidelines for this stage and result")
    autoimm = not s.check("No active autoimmune disease needing steroids", p=0.97)
    cycles = 6
    weight = c.patient["_weight"]
    height = c.patient["_height"]
    bsa = round(((height * weight) / 3600.0) ** 0.5, 2)
    c.units_override = 200 * cycles
    c.allowed_override = r.uniform(11000, 13500) * cycles
    o.update(onc_ecog=ecog, onc_biomarker_tested="EGFR, ALK, ROS1, BRAF, KRAS G12C, MET, PD-L1 (22C3)",
             onc_biomarker_result="No actionable driver mutation; PD-L1 TPS %d%%" % pdl1 if not driver else "EGFR exon 19 deletion; PD-L1 TPS %d%%" % pdl1,
             onc_pdl1_tps_pct=pdl1, onc_driver_mutation_found=yn(driver), onc_line_of_therapy=1,
             onc_regimen="Pembrolizumab 200 mg IV every 3 weeks", onc_cycle_number=1, onc_planned_cycles=cycles, onc_bsa_m2=bsa,
             onc_dose_mg=200, onc_dose_basis="Flat dose", onc_nccn_category="Category 1" if nccn else "Category 2B / off-guideline",
             onc_nccn_aligned=yn(nccn), onc_tumor_board_reviewed=yn(r.random() < 0.8), onc_autoimmune_disease_active=yn(autoimm),
             rx_drug_name="Keytruda (pembrolizumab)", rx_generic_name="pembrolizumab", rx_product_type="Reference brand",
             rx_route="Intravenous", rx_dose_regimen="200 mg IV every 3 weeks", rx_site_of_care="Hospital outpatient infusion",
             rx_requested_duration_months=4, rx_formulary_status="Preferred", rx_benefit_exclusion="N", rx_monthly_cost_usd=round(c.allowed_override / 4, 2))
    story(c, "Lung cancer treatment", "%s with %s, stage %s, PD-L1 %d%%, ECOG %d. First-line pembrolizumab requested." % (
        c.person, o["onc_histology"].lower(), o["onc_stage_group"], pdl1, ecog), "ECOG %d: %s" % (ecog, "fully active" if ecog == 0 else "restricted in strenuous activity" if ecog == 1 else "up and about more than half the day"),
          r.randint(8, 24), r.randint(1, 4))


def brca_test(c: Ctx) -> None:
    r, s, o = c.rng, c.sheet, c.out
    c.orderer = r.choice(["GEN", "ONC"])
    criteria = s.check("Meets national testing criteria (breast cancer at 50 or younger, triple-negative, or a close relative with ovarian/early breast cancer)")
    relatives = ["Mother: breast cancer at 44", "Maternal aunt: ovarian cancer at 52", "Sister: breast cancer at 39"] if criteria else \
        ["Paternal grandmother: breast cancer at 78", "No ovarian or male breast cancer in the family"]
    counseled = s.check("Genetic counseling documented before testing")
    prior = not s.check("Not tested before (no earlier BRCA panel)", p=0.96)
    s.check("Result will change care (risk-reducing surgery, surveillance or family testing)")
    o.update(onc_genetic_test_name="BRCA1/BRCA2 full sequence and del/dup", onc_family_history_summary="; ".join(r.sample(relatives, k=min(2, len(relatives)))),
             onc_genetic_counseling_done=yn(counseled), onc_prior_genetic_testing=yn(prior), prior_pa_same_service="N")
    story(c, "Strong family history of breast cancer", "%s with %s. %s" % (c.person, c.dx[1].lower(), o["onc_family_history_summary"] + "."),
          "No functional limitation", 0, 0)
    o["symptom_duration_weeks"] = ""; o["symptom_onset_date"] = ""; o["pain_score_0_10"] = ""; o["dx_onset_date"] = ""
