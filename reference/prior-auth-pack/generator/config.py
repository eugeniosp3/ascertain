"""Constants shared by every part of the generator."""
from datetime import date, datetime
from pathlib import Path

SEED = 20261118
AS_OF = datetime(2026, 11, 18, 9, 0)          # "today" for status calculations
FIRST_REQUEST_DATE = date(2026, 1, 12)
LAST_REQUEST_DATE = date(2026, 11, 14)

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DOCS_DIR = ROOT / "docs"

PATIENTS_CSV = DATA_DIR / "patients_100.csv"
REQUESTS_CSV = DATA_DIR / "prior_auth_requests_master.csv"
DICTIONARY_CSV = DATA_DIR / "data_dictionary.csv"
DICTIONARY_MD = DOCS_DIR / "04_data_dictionary.md"
