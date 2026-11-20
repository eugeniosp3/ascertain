"""Static reference data: names, places, payers, facilities, providers.

Everything here is fictional. Payer, hospital and doctor names are invented.
Phone numbers use the 555-01xx range reserved for fiction. NPIs are random
10-digit numbers with a valid check digit, so they look real but are not
assigned to anyone on purpose (a chance match with a real NPI is possible).
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Dict, List, Tuple

FEMALE_FIRST = [
    "Mary", "Patricia", "Linda", "Barbara", "Elizabeth", "Jennifer", "Maria", "Susan", "Margaret",
    "Dorothy", "Lisa", "Nancy", "Karen", "Betty", "Helen", "Sandra", "Donna", "Carol", "Ruth",
    "Sharon", "Michelle", "Laura", "Sarah", "Kimberly", "Deborah", "Jessica", "Shirley", "Cynthia",
    "Angela", "Melissa", "Brenda", "Amy", "Anna", "Rebecca", "Virginia", "Kathleen", "Pamela",
    "Martha", "Debra", "Amanda", "Stephanie", "Carolyn", "Christine", "Marie", "Janet", "Catherine",
    "Frances", "Ann", "Joyce", "Diane", "Rosa", "Guadalupe", "Aaliyah", "Priya", "Mei", "Fatima",
    "Latoya", "Keisha", "Yolanda", "Imani", "Svetlana", "Nguyet",
]
MALE_FIRST = [
    "James", "Robert", "John", "Michael", "David", "William", "Richard", "Joseph", "Thomas",
    "Charles", "Christopher", "Daniel", "Matthew", "Anthony", "Mark", "Donald", "Steven", "Paul",
    "Andrew", "Joshua", "Kenneth", "Kevin", "Brian", "George", "Timothy", "Ronald", "Edward",
    "Jason", "Jeffrey", "Ryan", "Jacob", "Gary", "Nicholas", "Eric", "Jonathan", "Stephen",
    "Larry", "Justin", "Scott", "Brandon", "Benjamin", "Samuel", "Gregory", "Frank", "Raymond",
    "Jose", "Luis", "Carlos", "Miguel", "Darnell", "Terrence", "Jamal", "Rajesh", "Wei", "Omar",
    "Tyrone", "Hiroshi", "Dmitri", "Tran", "Mohammed",
]
LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez",
    "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore",
    "Jackson", "Martin", "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez",
    "Lewis", "Robinson", "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen",
    "Hill", "Flores", "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
    "Carter", "Roberts", "Gomez", "Phillips", "Evans", "Turner", "Diaz", "Parker", "Cruz", "Edwards",
    "Collins", "Reyes", "Stewart", "Morris", "Morales", "Murphy", "Cook", "Rogers", "Gutierrez",
    "Ortiz", "Morgan", "Cooper", "Peterson", "Bailey", "Reed", "Kelly", "Howard", "Ramos", "Kim",
    "Cox", "Ward", "Richardson", "Watson", "Brooks", "Chavez", "Wood", "James", "Bennett", "Gray",
    "Mendoza", "Ruiz", "Hughes", "Price", "Alvarez", "Castillo", "Sanders", "Patel", "Myers",
    "Long", "Ross", "Foster", "Jimenez", "Okafor", "Kowalski", "Novak", "Schneider", "Hoffman",
    "Washington", "Jefferson", "Tran", "Singh", "Chen", "Abdi", "Haddad", "Petrov", "Yoder",
]
STREETS = ["Maple", "Oak", "Cedar", "Pine", "Elm", "Washington", "Lincoln", "Jefferson", "Highland",
           "Lakeview", "Sunset", "Park", "Church", "Mill", "River", "Walnut", "Chestnut", "Spring",
           "Meadow", "Franklin", "Hickory", "Willow", "Forest", "Ridge", "Orchard"]
STREET_TYPES = ["St", "Ave", "Dr", "Ln", "Rd", "Ct", "Blvd", "Way"]

# city, state, area code, zip codes (all within the health system's Ohio footprint)
CITIES: List[Tuple[str, str, str, List[str]]] = [
    ("Columbus", "OH", "614", ["43201", "43215", "43220"]),
    ("Cincinnati", "OH", "513", ["45202", "45219", "45236"]),
    ("Cleveland", "OH", "216", ["44113", "44106"]),
    ("Dayton", "OH", "937", ["45402", "45409"]),
    ("Toledo", "OH", "419", ["43604", "43614"]),
    ("Akron", "OH", "330", ["44308", "44313"]),
    ("Youngstown", "OH", "330", ["44503", "44512"]),
    ("Canton", "OH", "330", ["44702", "44718"]),
    ("Lorain", "OH", "440", ["44052", "44053"]),
    ("Mansfield", "OH", "419", ["44902", "44906"]),
    ("Springfield", "OH", "937", ["45502", "45503"]),
    ("Zanesville", "OH", "740", ["43701", "43702"]),
]
NORTHEAST_OHIO = {"Cleveland", "Akron", "Toledo", "Youngstown", "Canton", "Lorain", "Mansfield"}
CITY_WEIGHTS = [16, 12, 11, 7, 6, 6, 8, 5, 12, 4, 9, 4]


def luhn_check_digit(payload: str) -> int:
    total = 0
    for i, ch in enumerate(reversed(payload)):
        d = int(ch)
        if i % 2 == 0:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return (10 - total % 10) % 10


def make_npi(rng: random.Random) -> str:
    """Random 10-digit NPI that passes the NPI Luhn check (prefix 80840)."""
    body = str(rng.choice([1, 2])) + "".join(str(rng.randint(0, 9)) for _ in range(8))
    return body + str(luhn_check_digit("80840" + body))


def fake_phone(rng: random.Random, area: str) -> str:
    return "(%s) 555-01%02d" % (area, rng.randint(0, 99))


def fake_tin(rng: random.Random) -> str:
    """EIN-shaped id using prefix 07, which the IRS does not issue."""
    return "07-%07d" % rng.randint(0, 9999999)


# ---------------------------------------------------------------- payers
@dataclass(frozen=True)
class Payer:
    key: str
    name: str
    line_of_business: str
    plans: Tuple[Tuple[str, str], ...]     # (plan name, plan type)
    id_prefix: str
    standard_deadline_hours: int
    expedited_deadline_hours: int
    portal: str
    secondary_ok: bool = True


PAYERS: Dict[str, Payer] = {p.key: p for p in [
    Payer("EVG", "Evergreen Health Plan", "Commercial",
          (("Evergreen PPO Choice", "PPO"), ("Evergreen HMO Select", "HMO"), ("Evergreen POS Flex", "POS")),
          "EVG", 360, 72, "Evergreen ProviderHub"),
    Payer("NSM", "Northstar Mutual", "Commercial",
          (("Northstar PPO Advantage", "PPO"), ("Northstar EPO Connect", "EPO")),
          "NSM", 360, 72, "Northstar Provider Portal"),
    Payer("PIN", "Pinnacle Medicare Advantage", "Medicare Advantage",
          (("Pinnacle Gold HMO-POS", "HMO-POS"), ("Pinnacle Freedom PPO", "PPO")),
          "PMA", 168, 72, "Pinnacle Care Connect"),
    Payer("HMC", "Harbor Medicaid Choice", "Medicaid Managed Care",
          (("Harbor Medicaid Choice Adult", "HMO"),),
          "HMC", 168, 72, "Harbor Provider Services"),
    Payer("LIB", "Liberty Marketplace Plan", "ACA Marketplace",
          (("Liberty Silver EPO", "EPO"), ("Liberty Bronze HMO", "HMO"), ("Liberty Gold PPO", "PPO")),
          "LIB", 360, 72, "Liberty Provider Gateway"),
]}

# ------------------------------------------------------------- facilities
@dataclass(frozen=True)
class Facility:
    key: str
    name: str
    facility_type: str
    city: str
    state: str
    area: str
    npi: str
    tin: str
    departments: Tuple[str, ...]


def _fac(key, name, ftype, city, state, area, seed_tag, departments):
    rng = random.Random("facility-" + seed_tag)
    return Facility(key, name, ftype, city, state, area, make_npi(rng), fake_tin(rng), tuple(departments))


FACILITIES: Dict[str, Facility] = {f.key: f for f in [
    _fac("RMC", "Riverbend Medical Center", "Acute care hospital (612 beds)", "Columbus", "OH", "614", "rmc",
         ["Inpatient Medicine", "Telemetry", "Neuro ICU", "Bariatric Surgery Program", "Medical Oncology Inpatient", "Endocrinology Clinic"]),
    _fac("ROS", "Riverbend Orthopedic & Spine Hospital", "Specialty surgical hospital (88 beds)", "Columbus", "OH", "614", "ros",
         ["Joint Replacement", "Spine Surgery", "Pain Management", "Outpatient Rehabilitation"]),
    _fac("LCH", "Lakeshore Community Hospital", "Community hospital (210 beds)", "Cleveland", "OH", "216", "lch",
         ["Inpatient Medicine", "Sleep Disorders Center", "Cardiology Clinic"]),
    _fac("CRC", "Cedar Ridge Cancer Center", "Hospital outpatient cancer department", "Cincinnati", "OH", "513", "crc",
         ["Medical Oncology", "Infusion Center", "Genetics Clinic"]),
    _fac("HRH", "Harborview Rehabilitation Hospital", "Inpatient rehabilitation facility (64 beds)", "Cleveland", "OH", "216", "hrh",
         ["Stroke Rehabilitation Unit"]),
    _fac("RHV", "Riverbend Heart & Vascular Institute", "Hospital cardiac program", "Columbus", "OH", "614", "rhv",
         ["Cardiac Catheterization Lab", "Nuclear Cardiology", "Structural Heart Program"]),
    _fac("RII", "Riverbend Imaging & Infusion Center", "Hospital outpatient department (off campus)", "Columbus", "OH", "614", "rii",
         ["MRI", "PET/CT", "Infusion Center", "Specialty Pharmacy"]),
]}

# -------------------------------------------------------------- providers
PROVIDER_SPECIALTIES = {
    "ORTHO": "Orthopedic Surgery", "SPINE": "Orthopedic Spine Surgery", "PMR": "Physical Medicine & Rehabilitation",
    "PCP": "Family Medicine", "IM": "Internal Medicine", "RHEUM": "Rheumatology", "GI": "Gastroenterology",
    "DERM": "Dermatology", "NEURO": "Neurology", "ENDO": "Endocrinology", "PULM": "Pulmonary & Sleep Medicine",
    "CARD": "Cardiology", "ICARD": "Interventional Cardiology", "SHEART": "Structural Cardiology",
    "ONC": "Medical Oncology", "GENS": "Bariatric & General Surgery", "HOSP": "Hospital Medicine",
    "GEN": "Genetic Counseling / Oncology Genetics", "OBES": "Obesity Medicine",
    "RAD": "Diagnostic Radiology", "PT": "Physical Therapy",
}


@dataclass(frozen=True)
class Provider:
    key: str
    name: str
    specialty: str
    npi: str
    tin: str
    phone: str
    fax: str
    practice: str


def build_providers(rng: random.Random, copies: int = 3) -> Dict[str, List[Provider]]:
    """Several named providers per specialty so requests don't all share one doctor."""
    pool: Dict[str, List[Provider]] = {}
    used = set()
    for key, specialty in PROVIDER_SPECIALTIES.items():
        pool[key] = []
        for _ in range(copies if key not in ("PCP", "IM", "HOSP") else copies + 3):
            female = rng.random() < 0.45
            while True:
                first = rng.choice(FEMALE_FIRST if female else MALE_FIRST)
                last = rng.choice(LAST_NAMES)
                if (first, last) not in used:
                    used.add((first, last))
                    break
            suffix = "DPT" if key == "PT" else ("MD" if rng.random() < 0.9 else "DO")
            name = "%s %s %s, %s" % ("" if key == "PT" else "Dr.", first, last, suffix)
            name = name.strip()
            city = rng.choices(CITIES, weights=CITY_WEIGHTS)[0]
            pool[key].append(Provider(
                key, name, specialty, make_npi(rng), fake_tin(rng),
                fake_phone(rng, city[2]), fake_phone(rng, city[2]),
                "%s %s Associates" % (last, specialty.split()[0])))
    return pool


# -------------------------------------------------------- specialists (staff)
STAFF = [("PAS-%02d" % i) for i in range(1, 13)]
WORK_QUEUES = ["Imaging & Diagnostics", "Surgical Scheduling", "Specialty Drug & Infusion",
               "Inpatient Utilization Review", "Therapy & DME", "Oncology & Genetics", "Cardiology"]
