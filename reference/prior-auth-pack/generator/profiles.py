"""Patient 'clinical stories'. Each story fixes who the patient is and which authorizations follow."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

Dx = Tuple[str, str]


@dataclass(frozen=True)
class Step:
    service: str
    prob: float = 1.0
    gap_days: Tuple[int, int] = (21, 60)
    request_type: Optional[str] = None      # overrides the service default (e.g. Extension)


@dataclass(frozen=True)
class Profile:
    key: str
    label: str
    count: int
    age: Tuple[int, int]
    female_prob: float
    bmi: Tuple[float, float]                # mean, sd
    dx: Tuple[Dx, ...]
    chain: Tuple[Step, ...]
    forced: Dict[str, object] = field(default_factory=dict)   # comorbidity overrides
    smoking: Optional[Tuple[float, float, float]] = None      # never, former, current
    dx_override: Dict[str, Tuple[Dx, ...]] = field(default_factory=dict)
    second_dx: Tuple[Dx, ...] = ()
    pain_meds: bool = False


PROFILES: List[Profile] = [
    Profile("knee_oa", "Knee osteoarthritis heading to knee replacement", 9, (55, 82), 0.62, (33, 5),
            (("M17.11", "Unilateral primary osteoarthritis, right knee"), ("M17.12", "Unilateral primary osteoarthritis, left knee")),
            (Step("PT", 0.5, (14, 35)), Step("TKA", 1.0, (28, 75))), pain_meds=True),
    Profile("hip_oa", "Hip osteoarthritis heading to hip replacement", 4, (55, 80), 0.58, (30, 5),
            (("M16.11", "Unilateral primary osteoarthritis, right hip"), ("M16.12", "Unilateral primary osteoarthritis, left hip")),
            (Step("THA", 1.0, (21, 60)),), pain_meds=True),
    Profile("low_back", "Low back pain with leg pain (sciatica)", 9, (34, 70), 0.5, (30, 5),
            (("M54.16", "Radiculopathy, lumbar region"), ("M51.16", "Intervertebral disc disorders with radiculopathy, lumbar region"),
             ("M51.17", "Intervertebral disc disorders with radiculopathy, lumbosacral region")),
            (Step("MRI_LSPINE", 1.0, (14, 30)), Step("ESI", 0.75, (14, 45))), pain_meds=True),
    Profile("stenosis", "Lumbar stenosis / slipped vertebra heading to spinal fusion", 5, (52, 78), 0.55, (31, 5),
            (("M43.16", "Spondylolisthesis, lumbar region"), ("M48.062", "Spinal stenosis, lumbar region with neurogenic claudication")),
            (Step("MRI_LSPINE", 1.0, (14, 30)), Step("FUSION", 0.9, (30, 80))), pain_meds=True),
    Profile("meniscal", "Knee pain with suspected meniscus tear", 4, (28, 60), 0.4, (28, 5),
            (("M23.221", "Derangement of posterior horn of medial meniscus due to old tear or injury, right knee"),
             ("M23.222", "Derangement of posterior horn of medial meniscus due to old tear or injury, left knee")),
            (Step("MRI_KNEE", 1.0, (14, 30)), Step("PT", 0.55, (14, 40))),
            second_dx=(("M25.561", "Pain in right knee"),)),
    Profile("shoulder", "Rotator cuff tear managed with therapy", 3, (45, 75), 0.45, (29, 4),
            (("M75.101", "Unspecified rotator cuff tear or rupture of right shoulder, not specified as traumatic"),
             ("M75.102", "Unspecified rotator cuff tear or rupture of left shoulder, not specified as traumatic")),
            (Step("PT", 1.0, (14, 30)), Step("PT", 0.75, (28, 50), "Extension")), pain_meds=True),
    Profile("ra", "Rheumatoid arthritis needing a biologic", 6, (35, 72), 0.74, (28, 5),
            (("M05.79", "Rheumatoid arthritis with rheumatoid factor of multiple sites without organ or systems involvement"),
             ("M06.09", "Rheumatoid arthritis without rheumatoid factor, multiple sites")),
            (Step("ADALIMUMAB", 1.0, (21, 45)),)),
    Profile("crohn", "Crohn's disease needing a biologic", 3, (22, 60), 0.5, (24, 4),
            (("K50.90", "Crohn's disease, unspecified, without complications"),
             ("K50.10", "Crohn's disease of large intestine without complications"),
             ("K50.80", "Crohn's disease of both small and large intestine without complications")),
            (Step("USTEKINUMAB", 1.0, (21, 45)),)),
    Profile("psoriasis", "Plaque psoriasis needing a biologic", 4, (28, 65), 0.45, (30, 5),
            (("L40.0", "Psoriasis vulgaris"),),
            (Step("ADALIMUMAB", 1.0, (21, 45)),)),
    Profile("ms", "Multiple sclerosis starting an infusion therapy", 2, (28, 55), 0.74, (26, 5),
            (("G35.A", "Relapsing-remitting multiple sclerosis"),),
            (Step("OCRELIZUMAB", 1.0, (21, 45)),)),
    Profile("t2dm_glp1", "Type 2 diabetes needing a GLP-1 drug", 4, (40, 72), 0.5, (34, 5),
            (("E11.65", "Type 2 diabetes mellitus with hyperglycemia"),),
            (Step("SEMAGLUTIDE", 1.0, (21, 45)),), forced={"diabetes": "Type 2"}),
    Profile("obesity_glp1", "Obesity treated with a weight-loss drug", 4, (30, 66), 0.7, (36, 4),
            (("E66.9", "Obesity, unspecified"), ("E66.01", "Morbid (severe) obesity due to excess calories")),
            (Step("SEMAGLUTIDE", 1.0, (21, 45)),), forced={"diabetes": "None"}),
    Profile("lung", "Lung cancer: scan and immunotherapy", 5, (56, 80), 0.45, (26, 4),
            (("C34.11", "Malignant neoplasm of upper lobe, right bronchus or lung"),
             ("C34.12", "Malignant neoplasm of upper lobe, left bronchus or lung"),
             ("C34.31", "Malignant neoplasm of lower lobe, right bronchus or lung"),
             ("C34.90", "Malignant neoplasm of unspecified part of unspecified bronchus or lung")),
            (Step("PET_CT", 1.0, (7, 20)), Step("PEMBROLIZUMAB", 0.9, (10, 28))),
            forced={"cancer": True, "copd": 0.5}, smoking=(0.05, 0.5, 0.45)),
    Profile("breast", "Family history of breast cancer: genetic test", 4, (30, 62), 1.0, (27, 5),
            (("Z80.3", "Family history of malignant neoplasm of breast"), ("Z85.3", "Personal history of malignant neoplasm of breast")),
            (Step("BRCA_TEST", 1.0, (10, 30)),)),
    Profile("osa", "Suspected sleep apnea: sleep study then CPAP", 6, (38, 70), 0.35, (36, 5),
            (("G47.33", "Obstructive sleep apnea (adult) (pediatric)"),),
            (Step("SLEEP_STUDY", 1.0, (14, 35)), Step("CPAP", 0.9, (14, 35)), Step("CPAP_CONT", 0.35, (80, 100), "Extension")),
            dx_override={"SLEEP_STUDY": (("G47.30", "Sleep apnea, unspecified"),)}),
    Profile("cad", "Chest pain / coronary artery disease: stress test, cath, stent", 6, (52, 82), 0.38, (30, 5),
            (("I25.119", "Atherosclerotic heart disease of native coronary artery with unspecified angina pectoris"),
             ("I20.9", "Angina pectoris, unspecified")),
            (Step("SPECT_MPI", 1.0, (7, 21)), Step("CARDIAC_CATH", 0.95, (7, 28)), Step("PCI", 0.45, (1, 14))),
            forced={"cad": True}, smoking=(0.3, 0.45, 0.25)),
    Profile("aortic", "Severe aortic valve stenosis heading to TAVR", 3, (72, 89), 0.45, (27, 4),
            (("I35.0", "Nonrheumatic aortic (valve) stenosis"),),
            (Step("TAVR", 1.0, (21, 60)),)),
    Profile("sev_ob", "Severe obesity heading to weight-loss surgery", 5, (25, 60), 0.78, (45, 5),
            (("E66.01", "Morbid (severe) obesity due to excess calories"),),
            (Step("BARIATRIC", 1.0, (21, 60)),)),
    Profile("hf", "Heart failure hospital stay", 3, (62, 89), 0.45, (31, 6),
            (("I50.23", "Acute on chronic systolic (congestive) heart failure"),
             ("I50.33", "Acute on chronic diastolic (congestive) heart failure")),
            (Step("INPT_ADMIT", 1.0, (1, 1)), Step("INPT_CONT_STAY", 0.85, (3, 4))),
            forced={"heart_failure": True, "htn": True}),
    Profile("pna", "Pneumonia hospital stay", 2, (60, 88), 0.5, (27, 5),
            (("J18.9", "Pneumonia, unspecified organism"),),
            (Step("INPT_ADMIT", 1.0, (1, 1)), Step("INPT_CONT_STAY", 0.6, (2, 3)))),
    Profile("copd", "COPD flare hospital stay", 2, (60, 85), 0.5, (26, 5),
            (("J44.1", "Chronic obstructive pulmonary disease with (acute) exacerbation"),),
            (Step("INPT_ADMIT", 1.0, (1, 1)), Step("INPT_CONT_STAY", 0.7, (2, 3))),
            forced={"copd": True}, smoking=(0.0, 0.6, 0.4)),
    Profile("stroke", "Stroke: hospital stay then inpatient rehab", 3, (58, 84), 0.45, (29, 5),
            (("I63.9", "Cerebral infarction, unspecified"),),
            (Step("INPT_ADMIT", 1.0, (1, 1)), Step("INPT_CONT_STAY", 0.7, (2, 3)), Step("IRF_ADMIT", 0.9, (3, 5))),
            forced={"htn": True}),
    Profile("cgm", "Insulin-treated diabetes needing a glucose monitor", 4, (24, 74), 0.5, (29, 5),
            (("E10.65", "Type 1 diabetes mellitus with hyperglycemia"),
             ("E11.649", "Type 2 diabetes mellitus with hypoglycemia without coma")),
            (Step("CGM", 1.0, (14, 40)),)),
]

assert sum(p.count for p in PROFILES) == 100, sum(p.count for p in PROFILES)
PROFILE_BY_KEY = {p.key: p for p in PROFILES}
