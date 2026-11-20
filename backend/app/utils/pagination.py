"""Validated page parameters and the shared page response envelope; no database I/O."""

from pydantic import BaseModel, ConfigDict, Field


class PageParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class Page[Item](BaseModel):
    """Total is the matching whole-dataset count, including an empty out-of-range page."""

    items: list[Item]
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
