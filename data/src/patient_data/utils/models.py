"""Small shared model base for patient pipeline data structures."""

from pydantic import BaseModel, ConfigDict


class DataModel(BaseModel):
    """Reject unexpected fields instead of silently discarding input."""

    model_config = ConfigDict(extra="forbid")
