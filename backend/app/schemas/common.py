"""Shared response types; these models perform no I/O."""

from pydantic import BaseModel, ConfigDict


class FieldError(BaseModel):
    """A validation failure without the submitted value or validator context."""

    model_config = ConfigDict(frozen=True)

    path: tuple[str | int, ...]
    code: str
    message: str


class ErrorDetail(BaseModel):
    model_config = ConfigDict(frozen=True)

    code: str
    message: str
    fields: tuple[FieldError, ...] = ()


class ErrorResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    error: ErrorDetail
