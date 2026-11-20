"""A fresh patient summary: LLM prose over template facts, or the template itself."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class SummaryResponse(BaseModel):
    patient_id: UUID
    summary: str
    generated_at: datetime
    method: Literal["llm", "template"] = "template"
    model: str | None = None  # The model name when method is "llm"; otherwise None.
