# Prior authorization in hospitals: what it involves

**In one sentence:** before a hospital does something expensive (a scan, an operation, an infusion, an admission), the patient's insurer has to agree it is medically necessary and covered. The hospital asks; the insurer says yes, no, or "send more." Nothing is safe to schedule or bill without an approval number.

**Who does it:** *authorization specialists* (coverage checks, build and chase the request); *utilization review nurses* (patients already in a bed, updated every day or two); *physicians* (the doctor-to-doctor "peer-to-peer" call after a denial). The insurer's side is nurse reviewers, plus medical directors, who must sign every denial.

## What needs authorization
| Type | Examples |
|---|---|
| Scans and tests | MRI, PET/CT, nuclear stress test, sleep study, genetic tests |
| Surgery and procedures | Knee/hip replacement, spinal fusion, stent, heart valve, weight-loss surgery |
| Specialty drugs | Biologics, MS and cancer infusions, diabetes and weight-loss injections (plus renewals) |
| Equipment | CPAP, glucose monitors |
| **Hospital stays** | Admission notice within hours, then **continued-stay review every day or two** |
| Next level of care | Inpatient rehab, nursing facility, home health |

## The steps
1. **Is authorization required** for this payer, this plan, this service?
2. **Verify coverage:** active today, in network, referral needed, second insurer, deductible left.
3. **Gather proof:** visit note, imaging, labs, therapy notes, what was already tried, letter of medical necessity.
4. **Check the chart against the insurer's rules** (their policy, or InterQual/MCG for stays) and fix gaps *before* sending.
5. **Submit:** portal, X12 278 electronic transaction, FHIR API, fax or phone.
6. **Answer requests for information.** The insurer's clock pauses while the hospital owes a reply.
7. **If denied:** peer-to-peer, then appeal (reconsideration, then outside review).
8. **Record** the auth number, dates and approved units; tie them to the schedule and the claim. A changed date or code can void it.

## The rules and clocks (Nov 2026)
- **CMS-0057-F** (in force Jan 1, 2026): Medicare Advantage and Medicaid/CHIP plans must decide **expedited requests in 72 hours, standard in 7 calendar days**, with a specific reason for any denial. Required prior-auth, provider-access and payer-to-payer APIs follow **Jan 1, 2027**. Traditional Medicare is not covered, and CMS's fact sheet excludes marketplace plans from the timeframes (some vendor sources disagree). Commercial plans follow state law, often up to 15 days.
- **WISeR** (CMS pilot, 2026-2031): traditional Medicare now requires authorization for a short list of services in **AZ, NJ, OH, OK, TX, WA**, with AI-assisted review.
- **Insurer pledge:** 80% of *electronic* approvals answered in real time by 2027. Voluntary.

## Why it hurts
- **AMA 2025 survey** (1,000 physicians): 95% say it delays care, 79% say patients abandon treatment, **26% report a serious harm**, about 40 requests per doctor per week.
- **Hospital finance leaders** rank front-end errors (registration, eligibility, missing authorization) as the top cause of denied claims. One vendor survey found only 7% of organizations use dedicated software; most work is manual.

## What the practice data shows
Of 138 requests, **19% were denied on first review**, and 12% were still denied or open after peer-to-peer and appeals. A request approved on the first pass took staff about **37 minutes**; one denied first took about **105**, nearly three times as long. Causes: a rule not met (most), missing paperwork, wrong level or site of care, step therapy, coverage or network problems. *Rates are tuned to give you enough denials to study; they are not an industry benchmark.*

**Sources:** [CMS-0057-F fact sheet](https://www.cms.gov/files/document/fact-sheet-cms-interoperability-and-prior-authorization-final-rule-cms-0057-f.pdf) · [AMA 2025 survey](https://www.ama-assn.org/about/leadership/latest-prior-auth-survey-shows-promised-reform-remains-elusive) · [Insurer pledge](https://www.axios.com/2025/06/23/health-insurers-simplify-pre-approvals) · [WISeR (KFF)](https://www.kff.org/medicare/examining-the-potential-impact-of-medicares-new-wiser-model/) · [HFMA survey](https://revcycleintelligence.com/news/patient-access-registration-errors-lead-to-most-claim-denials)
