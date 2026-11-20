"""Service builders: each function fills the clinical columns and criteria for one kind of request."""
from . import cardio, dme, drugs, inpatient, msk, oncology

BUILDERS = {
    "MRI_LSPINE": msk.mri_lspine, "MRI_KNEE": msk.mri_knee, "ESI": msk.esi, "TKA": msk.tka, "THA": msk.tha,
    "FUSION": msk.fusion, "PT": msk.pt,
    "ADALIMUMAB": drugs.adalimumab, "USTEKINUMAB": drugs.ustekinumab, "OCRELIZUMAB": drugs.ocrelizumab,
    "SEMAGLUTIDE": drugs.semaglutide,
    "PET_CT": oncology.pet_ct, "PEMBROLIZUMAB": oncology.pembrolizumab, "BRCA_TEST": oncology.brca_test,
    "SLEEP_STUDY": dme.sleep_study, "CPAP": dme.cpap, "CPAP_CONT": dme.cpap_continued, "CGM": dme.cgm,
    "BARIATRIC": dme.bariatric,
    "SPECT_MPI": cardio.spect_mpi, "CARDIAC_CATH": cardio.cardiac_cath, "PCI": cardio.pci, "TAVR": cardio.tavr,
    "INPT_ADMIT": inpatient.admit, "INPT_CONT_STAY": inpatient.continued_stay, "IRF_ADMIT": inpatient.irf,
}
