# Four real-style scenarios

Each one is taken from rows in `data/prior_auth_requests_master.csv` (request IDs shown), so you can look up every number. Patients and plans are invented. Times are UTC.

---

## 1. The hospital stay the insurer wanted to call "observation"
**Rows:** PA-2026-000090 and PA-2026-000096 · patient PT-0095 · Lakeshore Community Hospital · Medicare Advantage HMO-POS

A 67-year-old woman with COPD, heart failure and sleep apnea arrives in the ER on **Sept 3** struggling to breathe: oxygen 82% on room air, blood gas pH 7.29, CO2 66. She is put on BiPAP, IV steroids and scheduled breathing treatments, and admitted as an inpatient.

- **Hours later:** the utilization review nurse sends the admission notice through the payer portal, marked **expedited** (72-hour clock). Her own check shows **4 of 4 rules met**.
- **Next morning (15 hours):** a physician reviewer at the insurer **denies inpatient status**, saying observation is enough. The reviewer is not from the treating team's specialty.
- **Sept 7:** the hospital's doctor gets the peer-to-peer call. The denial is **upheld**.
- **Sept 9:** she goes home after 6 days; the usual benchmark for her diagnosis group is 3.3 days. The whole stay happened while the dispute was open.
- **Sept 17 to 22:** the hospital files a reconsideration and **wins**. Total: 19 days of uncertainty, **15 staff touches, 212 minutes** (about 6 times the 36 minutes spent on her day-6 review), for a $21,869 stay.

**What it shows:** for stays, the fight is *level of care* (inpatient vs observation), and the patient is already in the bed. The day-6 review (PA-000096) had one rule unmet (stay longer than the benchmark) and was still approved after a physician looked at it. Staff need a "days since admission with no decision" alert.

---

## 2. The cancer scan blocked by one missing sentence
**Rows:** PA-2026-000060, 000070, 000074 · patient PT-0025 · Riverbend Imaging & Infusion Center · Medicare Advantage HMO-POS

A 70-year-old man has biopsy-proven squamous cell lung cancer, stage IIB. His oncologist needs a PET/CT to decide between surgery and chemoradiation.

- **July 13:** the request is sent by **fax**, marked **expedited**, at 12:27. **Seven and a half hours later it is denied**: three of four rules met, but "biopsy-proven cancer documented" was not. The pathology report was attached; the order itself did not say the cancer was biopsy-proven. A peer-to-peer call is offered and never happens.
- **July 21:** the team resubmits as a standard request, with the biopsy stated clearly.
- **July 24:** approved. **Eleven days** from first request to approval, in a case marked urgent.
- **Aug 7:** the immunotherapy request (pembrolizumab, 6 cycles, **$75,826**) goes in as expedited with 6 of 6 rules met (PD-L1 27%, performance status 0) and is **approved in 8.6 hours**.

**What it shows:** the same patient, same payer, same team: clean packet, approved in hours; one gap, lost 11 days. "Expedited" speeds up the payer's clock, not yours. A pre-submission checklist is the cheapest fix.

---

## 3. The brand-name drug when the plan prefers a biosimilar
**Row:** PA-2026-000052 · patient PT-0037 · Riverbend Imaging & Infusion Center (specialty pharmacy) · Medicaid managed care HMO

A 49-year-old woman with plaque psoriasis (PASI 13.8) has had 4 months of methotrexate. Her dermatologist asks to **continue adalimumab for another 12 months**, but requests the reference brand (Humira), which the plan lists as **non-preferred**; the preferred product is a biosimilar (Hyrimoz).

- **June 30 / July 1:** request submitted by X12 278. Eight of nine rules are met, including TB test, specialist prescriber and documented response.
- **July 7 (149 hours, close to the 168-hour limit):** **denied**. Missing: "preferred biosimilar requested, or an exception documented." The reviewer is a physician of the same specialty.
- **July 8:** peer-to-peer, **upheld**.
- **July 27 to Aug 18:** first-level appeal, **overturned**.
- The service starts **38 days late** (a gap in treatment for a renewal). **13 touches, 208 minutes**, about $63,000 per year of drug.

**What it shows:** one unmet rule out of nine was enough. A formulary lookup at intake ("is this the preferred product?") would have avoided five weeks of dispute. Renewals should start 30 to 45 days before the old approval ends.

---

## 4. A clean chart that was denied anyway, then a smooth surgery
**Rows:** PA-2026-000003 and PA-2026-000010 · patient PT-0001 · Riverbend Imaging & Infusion Center, then Riverbend Orthopedic & Spine Hospital · Medicare Advantage HMO-POS

A 77-year-old woman has lumbar spinal stenosis with leg symptoms (nerve deficit documented). After **20 weeks** of conservative care and X-rays, her rehab physician orders an MRI.

- **Jan 19:** MRI request with **4 of 4 rules met**. **Jan 21:** a physician reviewer **denies it** anyway, with no rule cited.
- **Jan 23:** peer-to-peer, **overturned**. The scan happens with no delay. Cost: **104 minutes of staff time for an $829 scan**.
- **March 4:** the spine surgeon requests a one-level fusion (**$100,745**). **7 of 7 rules met** (51 weeks of conservative care, injections, functional score of 70).
- **March 6:** **approved in 36 hours**, 44 minutes of staff time.

**What it shows:** a denial does not always mean the chart was weak, and the peer-to-peer call is the safety net. Careful preparation paid off on the big-money request. Tracking *reviewer specialty match* and *overturn rate by payer* tells you where calls are worth making.

---

### Patterns across the four
| | Scenario 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| First answer | Denied (15 h) | Denied (7.6 h) | Denied (149 h) | Denied (37 h) |
| Fixed by | Appeal | Resubmission | Appeal | Peer-to-peer |
| Days to a final yes | 19 | 11 | 49 | 4 |
| Staff minutes | 212 | 38 + 45 | 208 | 104 |
