# How an authorization specialist looks at a patient

This is the view from the hospital side: a person in the authorization (or patient access) department who owns a queue of requests. The insurer's reviewer is covered at the end.

## The patient is a stack of five questions
They never read a chart top to bottom. They ask, in this order, and stop as soon as one answer is "no":

1. **What exactly is being done, where, and when?** Procedure code, diagnosis code, hospital and department, planned date, expedited or standard. *(Request and Service columns, groups 1 and 5)*
2. **Who pays?** Insurer, plan type (an HMO means referrals), member ID, active today, in network, second insurer, deductible left. *(Coverage, group 3)*
3. **Does this payer require authorization for this service?** Look it up on the payer's list; if unsure, call. *(`pa_required`, `pa_requirement_source`)*
4. **Does the chart meet the payer's rules?** Match the patient's facts to a checklist. *(Clinical, Prior treatment, and the service blocks, groups 6 to 15)*
5. **Is the packet complete?** Every required document attached, readable and dated recently. *(Documentation, group 16)*

Only then do they submit.

## What they see on screen (mock-up)
```
 PT-0013  Hernandez, A.  77F  DOB ****-**-**  MRN ********       Pinnacle Gold HMO-POS (Medicare Advantage)
 ───────────────────────────────────────────────────────────────────────────────────────────────
 REQUEST  Total hip replacement  CPT 27130   Dx M16.11 right hip osteoarthritis   Standard
          Riverbend Orthopedic & Spine Hospital    Planned Dec 19    Allowed about $31,861
 COVERAGE ● Active, second insurer on file (checked Nov 4)   ● In network   ● Referral required: on file
          Out-of-pocket maximum $4,500, $941 used so far
 ───────────────────────────────────────────────────────────────────────────────────────────────
 PAYER RULES   6 of 7 met                                  DOCUMENTS   4 of 5
  ✔ X-ray severe arthritis (KL 3-4)        KL 4             ✔ Visit note               Oct 24
  ✔ 3+ months failed conservative care     25 weeks         ✔ Imaging report
  ✔ Pain and function score                WOMAC 73         ✔ Lab report
  ✔ BMI under 40                           35.6             ✔ Therapy notes
  ✖ HbA1c under 8% (diabetics only)        8.1              ✖ Letter of medical necessity  MISSING
  ✔ Nicotine-free 4+ weeks                 former smoker
  ✔ Pre-operative medical clearance
 ───────────────────────────────────────────────────────────────────────────────────────────────
 PRE-SCREEN: needs more documentation  ·  denial risk 17/100    [Fix gaps]  [Submit]  [Call payer]
```
(Real values from PA-2026-000123; name shortened and identifiers masked.)
Everything on this screen exists as a column in `prior_auth_requests_master.csv` (rules = `cr_detail`; risk = `cr_denial_risk_score`; documents = group 16).

## Data they look at, and where it lives
| Question | Data | Usually found in |
|---|---|---|
| Who is the patient? | Name, birth date, MRN, address, phone, language | Registration system |
| Coverage | Member ID, plan, eligibility response (X12 270/271), network, referral | Payer portal, eligibility check |
| The order | Procedure and diagnosis codes, doctor, site, date | EHR order, scheduling |
| Why now | Symptoms and how long, pain score, function limits | Visit note |
| What was tried | Therapy, medicines, injections, prior scans, prior surgery | Notes, medication list, imaging system |
| Risk facts payers check | BMI, A1c, smoking, blood thinners, kidney function, other illnesses | Vitals, labs, problem list |
| Service-specific proof | Joint-space grade, PD-L1 score, ejection fraction, AHI, EDSS | Imaging, pathology, lab, specialty notes |
| The payer's rules | Medical policy, InterQual/MCG, NCCN, preferred drug list | Payer site, licensed criteria tool |
| History with this payer | Earlier denials, auth numbers, expiry dates | Authorization system |

## Facts that make an experienced specialist stop and look closer
Current smoker, **BMI 40 or more**, **A1c above 8%**, a repeat scan within 12 months, therapy under 6 to 12 weeks, an out-of-network doctor, an HMO with no referral, a brand drug when a preferred biosimilar exists, a hospital infusion site when the plan wants home or office, a weight-loss drug on a plan that excludes them, a surgery date under 3 days away.

## A day in the queue
1. **Morning sort:** expedited items and anything with a service date in 3 days or fewer come first; then requests waiting on documents; then follow-ups where the payer's deadline is close.
2. **Work each item:** the five questions, fix gaps, submit, log the payer's case number.
3. **Midday:** answer "more information" requests (the payer's clock is paused until the hospital replies); check hospital stays that need a review today.
4. **Afternoon:** phone calls on pending items; set up peer-to-peer calls with the doctor; prepare appeals with the letter and the rule that was misapplied.
5. **Close:** record auth numbers, dates and approved units; flag any approval that no longer matches the schedule (date, code or location changed).

## Numbers they watch (from the practice data; a teaching set, not a benchmark)
| Measure | Value here | Column(s) |
|---|---|---|
| Approved on first pass, no extra work | 63% | `wk_first_pass_approved` |
| Median decision time | 14 h expedited, 66 h standard | `turnaround_hours` |
| Peer-to-peer overturned a denial | 3 of 9 calls completed | `dt_p2p_outcome` |
| Appeals won | 7 of 9 decided | `dt_appeal_decision` |
| Staff time | 53 min per request on average; 123 hours in total | `wk_staff_minutes` |
| Money still unresolved | about $288,000 allowed amount | `wk_revenue_at_risk_usd` |
| Requests with a missing document | 19 of 138 | `dc_completeness_pct` |

## The insurer's reviewer (for contrast)
A nurse reviews the packet against the same checklist, often after software pre-screens it; clear cases are approved in minutes. Anything the nurse cannot approve goes to a medical director, who alone can deny. The reviewer sees much less than the hospital: the packet and the policy, not the whole chart. That is why *what you attach* and *how you word it* matter as much as what is true.
