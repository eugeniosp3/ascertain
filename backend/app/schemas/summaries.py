"""A fresh deterministic summary, independent of discussion messages."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class SummaryResponse(BaseModel):
    patient_id: UUID
    summary: str
    generated_at: datetime
    method: Literal["template"] = "template"
