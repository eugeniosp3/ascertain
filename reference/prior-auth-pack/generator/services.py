"""The catalog of services that need authorization. One entry per kind of request."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Tuple

POS_OPD = ("22", "On campus - outpatient hospital", "0131")
POS_OPD_OFF = ("19", "Off campus - outpatient hospital", "0131")
POS_INPT = ("21", "Inpatient hospital", "0111")
POS_HOME = ("12", "Home", "")
POS_PHARM = ("01", "Pharmacy", "")
POS_IRF = ("61", "Comprehensive inpatient rehabilitation facility", "0111")

DOCS = ("visit_note", "imaging_report", "lab_report", "pt_notes", "medical_necessity_letter", "pathology_report",
        "sleep_study_report", "cardiac_testing_report", "specialist_consult", "inpatient_record")


@dataclass(frozen=True)
class Service:
    key: str
    category: str
    queue: str
    code: str
    code_system: str
    description: str
    facility: str
    department: str
    settings: Tuple[Tuple[str, str, str], ...]     # (POS code, POS name, bill type) options
    revenue_codes: Tuple[str, ...]
    orderers: Tuple[str, ...]                     # provider specialty keys
    channel: str                                  # Medical / Pharmacy / DME
    allowed: Tuple[float, float]
    urgent_prob: float
    lead_days: Tuple[int, int]
    default_type: str
    policy: str
    criteria_set: str
    docs: Tuple[str, ...]
    source: str = "Physician office order"
    units: Tuple[int, int] = (1, 1)


def _s(**kw) -> Service:
    return Service(**kw)


CATALOG: Dict[str, Service] = {s.key: s for s in [
    _s(key="MRI_LSPINE", category="Advanced imaging", queue="Imaging & Diagnostics", code="72148", code_system="CPT",
       description="MRI lumbar spine without contrast", facility="RII", department="MRI", settings=(POS_OPD_OFF,),
       revenue_codes=("0610",), orderers=("PCP", "PMR", "SPINE"), channel="Medical", allowed=(380, 1150), urgent_prob=.05,
       lead_days=(3, 14), default_type="Initial", policy="RAD-SPINE-2026-04",
       criteria_set="Payer radiology guideline based on ACR Appropriateness Criteria", docs=("visit_note", "pt_notes")),
    _s(key="MRI_KNEE", category="Advanced imaging", queue="Imaging & Diagnostics", code="73721", code_system="CPT",
       description="MRI any joint of lower extremity (knee) without contrast", facility="RII", department="MRI",
       settings=(POS_OPD_OFF,), revenue_codes=("0610",), orderers=("PCP", "ORTHO"), channel="Medical", allowed=(380, 1050),
       urgent_prob=.05, lead_days=(3, 14), default_type="Initial", policy="RAD-MSK-2026-02",
       criteria_set="Payer radiology guideline based on ACR Appropriateness Criteria", docs=("visit_note", "imaging_report")),
    _s(key="ESI", category="Outpatient procedure", queue="Surgical Scheduling", code="62323", code_system="CPT",
       description="Lumbar epidural steroid injection with imaging guidance", facility="ROS", department="Pain Management",
       settings=(POS_OPD,), revenue_codes=("0360",), orderers=("PMR", "SPINE"), channel="Medical", allowed=(900, 2300),
       urgent_prob=.03, lead_days=(7, 21), default_type="Initial", policy="PAIN-ESI-2026-01",
       criteria_set="Payer medical policy: epidural steroid injections", docs=("visit_note", "imaging_report", "pt_notes")),
    _s(key="TKA", category="Surgery", queue="Surgical Scheduling", code="27447", code_system="CPT",
       description="Total knee arthroplasty (knee replacement)", facility="ROS", department="Joint Replacement",
       settings=(POS_OPD, POS_INPT), revenue_codes=("0360", "0120"), orderers=("ORTHO",), channel="Medical",
       allowed=(24000, 42000), urgent_prob=.04, lead_days=(21, 56), default_type="Initial", policy="ORTH-JR-2026-03",
       criteria_set="Payer medical policy: total joint arthroplasty",
       docs=("visit_note", "imaging_report", "pt_notes", "lab_report", "medical_necessity_letter")),
    _s(key="THA", category="Surgery", queue="Surgical Scheduling", code="27130", code_system="CPT",
       description="Total hip arthroplasty (hip replacement)", facility="ROS", department="Joint Replacement",
       settings=(POS_OPD, POS_INPT), revenue_codes=("0360", "0120"), orderers=("ORTHO",), channel="Medical",
       allowed=(23000, 40000), urgent_prob=.04, lead_days=(21, 56), default_type="Initial", policy="ORTH-JR-2026-03",
       criteria_set="Payer medical policy: total joint arthroplasty",
       docs=("visit_note", "imaging_report", "pt_notes", "lab_report", "medical_necessity_letter")),
    _s(key="FUSION", category="Surgery", queue="Surgical Scheduling", code="22612", code_system="CPT",
       description="Posterolateral lumbar spinal fusion, single interspace", facility="ROS", department="Spine Surgery",
       settings=(POS_INPT,), revenue_codes=("0120",), orderers=("SPINE",), channel="Medical", allowed=(55000, 110000),
       urgent_prob=.05, lead_days=(21, 49), default_type="Initial", policy="SPINE-FUS-2026-02",
       criteria_set="Payer medical policy: lumbar spinal fusion",
       docs=("visit_note", "imaging_report", "pt_notes", "lab_report", "medical_necessity_letter", "specialist_consult")),
    _s(key="PT", category="Therapy", queue="Therapy & DME", code="97110", code_system="CPT",
       description="Outpatient physical therapy: therapeutic exercise program", facility="ROS", department="Outpatient Rehabilitation",
       settings=(POS_OPD,), revenue_codes=("0420",), orderers=("ORTHO", "PMR", "PCP"), channel="Medical", allowed=(1100, 2600),
       urgent_prob=.01, lead_days=(1, 7), default_type="Initial", policy="THER-PT-2026-01",
       criteria_set="Payer medical policy: outpatient rehabilitation therapy", docs=("visit_note", "pt_notes")),
    _s(key="ADALIMUMAB", category="Pharmacy drug", queue="Specialty Drug & Infusion", code="", code_system="NDC",
       description="Adalimumab 40 mg/0.4 mL autoinjector pen (self-administered)", facility="RII", department="Specialty Pharmacy",
       settings=(POS_PHARM,), revenue_codes=("",), orderers=("RHEUM", "DERM"), channel="Pharmacy", allowed=(2400, 6800),
       urgent_prob=.04, lead_days=(3, 14), default_type="Initial", policy="RX-BIO-2026-05",
       criteria_set="Payer pharmacy policy: TNF blockers (step therapy)", docs=("visit_note", "lab_report", "specialist_consult"),
       source="Pharmacy", units=(2, 2)),
    _s(key="USTEKINUMAB", category="Specialty drug (medical benefit)", queue="Specialty Drug & Infusion", code="J3358",
       code_system="HCPCS", description="Ustekinumab IV induction dose, 1 mg", facility="RII", department="Infusion Center",
       settings=(POS_OPD_OFF,), revenue_codes=("0636",), orderers=("GI",), channel="Medical", allowed=(12000, 26000),
       urgent_prob=.05, lead_days=(7, 21), default_type="Initial", policy="RX-BIO-2026-07",
       criteria_set="Payer medical policy: IL-12/23 inhibitors; site-of-care policy", docs=("visit_note", "lab_report", "pathology_report", "specialist_consult")),
    _s(key="OCRELIZUMAB", category="Specialty drug (medical benefit)", queue="Specialty Drug & Infusion", code="J2350",
       code_system="HCPCS", description="Ocrelizumab injection, 1 mg (600 mg IV every 6 months)", facility="RII", department="Infusion Center",
       settings=(POS_OPD_OFF,), revenue_codes=("0636",), orderers=("NEURO",), channel="Medical", allowed=(24000, 38000),
       urgent_prob=.06, lead_days=(7, 21), default_type="Initial", policy="RX-MS-2026-01",
       criteria_set="Payer medical policy: anti-CD20 therapy for multiple sclerosis",
       docs=("visit_note", "imaging_report", "lab_report", "specialist_consult")),
    _s(key="SEMAGLUTIDE", category="Pharmacy drug", queue="Specialty Drug & Infusion", code="", code_system="NDC",
       description="Semaglutide weekly injection pen (self-administered)", facility="RMC", department="Endocrinology Clinic",
       settings=(POS_PHARM,), revenue_codes=("",), orderers=("ENDO", "OBES", "PCP"), channel="Pharmacy", allowed=(950, 1450),
       urgent_prob=.01, lead_days=(2, 10), default_type="Initial", policy="RX-GLP1-2026-03",
       criteria_set="Payer pharmacy policy: GLP-1 receptor agonists", docs=("visit_note", "lab_report"), source="Pharmacy", units=(4, 4)),
    _s(key="PET_CT", category="Advanced imaging", queue="Oncology & Genetics", code="78815", code_system="CPT",
       description="PET with concurrent CT, skull base to mid-thigh", facility="RII", department="PET/CT", settings=(POS_OPD_OFF,),
       revenue_codes=("0404",), orderers=("ONC",), channel="Medical", allowed=(1500, 3900), urgent_prob=.35, lead_days=(2, 10),
       default_type="Initial", policy="RAD-PET-2026-01", criteria_set="Payer radiology policy: PET imaging in oncology (NCCN-aligned)",
       docs=("visit_note", "pathology_report", "imaging_report")),
    _s(key="PEMBROLIZUMAB", category="Specialty drug (medical benefit)", queue="Oncology & Genetics", code="J9271",
       code_system="HCPCS", description="Pembrolizumab injection, 1 mg (200 mg every 3 weeks)", facility="CRC", department="Infusion Center",
       settings=(POS_OPD,), revenue_codes=("0636",), orderers=("ONC",), channel="Medical", allowed=(11000, 13500), urgent_prob=.4,
       lead_days=(2, 9), default_type="Initial", policy="ONC-IO-2026-01", criteria_set="NCCN guidelines (payer-recognized compendium)",
       docs=("visit_note", "pathology_report", "lab_report", "imaging_report")),
    _s(key="BRCA_TEST", category="Genetic testing", queue="Oncology & Genetics", code="81162", code_system="CPT",
       description="BRCA1/BRCA2 full sequence and deletion/duplication analysis", facility="CRC", department="Genetics Clinic",
       settings=(POS_OPD,), revenue_codes=("0300",), orderers=("GEN", "ONC"), channel="Medical", allowed=(1500, 3500),
       urgent_prob=.04, lead_days=(3, 14), default_type="Initial", policy="LAB-GEN-2026-02",
       criteria_set="Payer genetic testing policy (NCCN testing criteria)", docs=("visit_note", "specialist_consult")),
    _s(key="SLEEP_STUDY", category="Diagnostic testing", queue="Therapy & DME", code="95810", code_system="CPT",
       description="Attended in-lab polysomnography (overnight sleep study)", facility="LCH", department="Sleep Disorders Center",
       settings=(POS_OPD,), revenue_codes=("0740",), orderers=("PULM", "PCP"), channel="Medical", allowed=(900, 2300), urgent_prob=.02,
       lead_days=(7, 28), default_type="Initial", policy="SLP-DX-2026-01", criteria_set="Payer medical policy: sleep testing (AASM-aligned)",
       docs=("visit_note",)),
    _s(key="CPAP", category="DME", queue="Therapy & DME", code="E0601", code_system="HCPCS",
       description="Continuous positive airway pressure (CPAP) device, initial rental", facility="LCH", department="Sleep Disorders Center",
       settings=(POS_HOME,), revenue_codes=("",), orderers=("PULM",), channel="DME", allowed=(450, 1100), urgent_prob=.02,
       lead_days=(3, 10), default_type="Initial", policy="DME-PAP-2026-01", criteria_set="Medicare-style PAP coverage rule (many payers copy it)",
       docs=("visit_note", "sleep_study_report"), units=(1, 1)),
    _s(key="CPAP_CONT", category="DME", queue="Therapy & DME", code="E0601", code_system="HCPCS",
       description="CPAP device, continued rental after 90-day adherence check", facility="LCH", department="Sleep Disorders Center",
       settings=(POS_HOME,), revenue_codes=("",), orderers=("PULM",), channel="DME", allowed=(380, 900), urgent_prob=.01,
       lead_days=(3, 10), default_type="Extension", policy="DME-PAP-2026-01", criteria_set="Medicare-style PAP coverage rule (many payers copy it)",
       docs=("visit_note", "sleep_study_report")),
    _s(key="CGM", category="DME", queue="Therapy & DME", code="E2103", code_system="HCPCS",
       description="Continuous glucose monitor receiver (non-adjunctive)", facility="RMC", department="Endocrinology Clinic",
       settings=(POS_HOME,), revenue_codes=("",), orderers=("ENDO", "PCP"), channel="DME", allowed=(2200, 4200), urgent_prob=.04,
       lead_days=(3, 12), default_type="Initial", policy="DME-CGM-2026-02", criteria_set="Medicare-style CGM coverage rule (many payers copy it)",
       docs=("visit_note", "lab_report")),
    _s(key="SPECT_MPI", category="Cardiac diagnostics", queue="Cardiology", code="78452", code_system="CPT",
       description="Myocardial perfusion SPECT, multiple studies (stress nuclear test)", facility="RHV", department="Nuclear Cardiology",
       settings=(POS_OPD,), revenue_codes=("0340",), orderers=("CARD",), channel="Medical", allowed=(1000, 2900), urgent_prob=.10,
       lead_days=(2, 10), default_type="Initial", policy="CARD-IMG-2026-01", criteria_set="Appropriate Use Criteria for cardiac imaging",
       docs=("visit_note", "cardiac_testing_report")),
    _s(key="CARDIAC_CATH", category="Cardiac procedure", queue="Cardiology", code="93458", code_system="CPT",
       description="Left heart catheterization with coronary angiography", facility="RHV", department="Cardiac Catheterization Lab",
       settings=(POS_OPD, POS_INPT), revenue_codes=("0481", "0481"), orderers=("CARD", "ICARD"), channel="Medical", allowed=(5500, 14500),
       urgent_prob=.25, lead_days=(1, 10), default_type="Initial", policy="CARD-PROC-2026-01", criteria_set="Appropriate Use Criteria for coronary revascularization",
       docs=("visit_note", "cardiac_testing_report", "lab_report")),
    _s(key="PCI", category="Cardiac procedure", queue="Cardiology", code="92928", code_system="CPT",
       description="Percutaneous coronary intervention with stent, single major vessel", facility="RHV", department="Cardiac Catheterization Lab",
       settings=(POS_OPD, POS_INPT), revenue_codes=("0481", "0481"), orderers=("ICARD",), channel="Medical", allowed=(18000, 45000),
       urgent_prob=.6, lead_days=(0, 3), default_type="Initial", policy="CARD-PROC-2026-02", criteria_set="Appropriate Use Criteria for coronary revascularization",
       docs=("visit_note", "cardiac_testing_report")),
    _s(key="TAVR", category="Surgery", queue="Cardiology", code="33361", code_system="CPT",
       description="Transcatheter aortic valve replacement, percutaneous femoral approach", facility="RHV", department="Structural Heart Program",
       settings=(POS_INPT,), revenue_codes=("0120",), orderers=("SHEART",), channel="Medical", allowed=(55000, 86000), urgent_prob=.10,
       lead_days=(14, 42), default_type="Initial", policy="CARD-STRUCT-2026-01", criteria_set="Medicare national coverage rule for TAVR (payers follow it)",
       docs=("visit_note", "cardiac_testing_report", "imaging_report", "specialist_consult", "medical_necessity_letter")),
    _s(key="BARIATRIC", category="Surgery", queue="Surgical Scheduling", code="43775", code_system="CPT",
       description="Laparoscopic sleeve gastrectomy (weight-loss surgery)", facility="RMC", department="Bariatric Surgery Program",
       settings=(POS_INPT, POS_OPD), revenue_codes=("0120", "0360"), orderers=("GENS",), channel="Medical", allowed=(18000, 32000),
       urgent_prob=.01, lead_days=(21, 56), default_type="Initial", policy="SURG-BAR-2026-01", criteria_set="Payer medical policy: bariatric surgery",
       docs=("visit_note", "lab_report", "specialist_consult", "medical_necessity_letter")),
    _s(key="INPT_ADMIT", category="Inpatient admission", queue="Inpatient Utilization Review", code="", code_system="MS-DRG (expected)",
       description="Inpatient admission notification and initial clinical review", facility="LCH", department="Inpatient Medicine",
       settings=(POS_INPT,), revenue_codes=("0120",), orderers=("HOSP",), channel="Medical", allowed=(8000, 24000), urgent_prob=.97,
       lead_days=(0, 0), default_type="Initial", policy="UM-INPT-2026-01", criteria_set="InterQual or MCG inpatient criteria (licensed; not reproduced)",
       docs=("inpatient_record", "lab_report", "imaging_report"), source="ED / inpatient case management"),
    _s(key="INPT_CONT_STAY", category="Inpatient continued stay", queue="Inpatient Utilization Review", code="", code_system="MS-DRG (expected)",
       description="Concurrent review: continued inpatient days", facility="LCH", department="Inpatient Medicine",
       settings=(POS_INPT,), revenue_codes=("0120",), orderers=("HOSP",), channel="Medical", allowed=(2500, 4400), urgent_prob=.92,
       lead_days=(0, 0), default_type="Concurrent", policy="UM-INPT-2026-02", criteria_set="InterQual or MCG continued-stay criteria (licensed; not reproduced)",
       docs=("inpatient_record", "lab_report"), source="ED / inpatient case management"),
    _s(key="IRF_ADMIT", category="Post-acute care", queue="Inpatient Utilization Review", code="0128", code_system="Revenue code",
       description="Inpatient rehabilitation facility admission after stroke", facility="HRH", department="Stroke Rehabilitation Unit",
       settings=(POS_IRF,), revenue_codes=("0128",), orderers=("PMR", "HOSP"), channel="Medical", allowed=(14000, 26000), urgent_prob=.85,
       lead_days=(0, 1), default_type="Initial", policy="UM-IRF-2026-01", criteria_set="Medicare IRF coverage criteria (payers follow them)",
       docs=("inpatient_record", "specialist_consult", "pt_notes"), source="ED / inpatient case management"),
]}
