"""Translate application and framework failures into safe API responses."""

from collections.abc import Mapping
from http import HTTPStatus
from typing import Any, cast

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DataError
from starlette.exceptions import HTTPException

from app.schemas.common import ErrorDetail, ErrorResponse, FieldError
from app.validation import PUBLIC_VALIDATION_MESSAGES, VALIDATION_FIELD_TARGETS

_VALIDATION_MESSAGES = {
    "missing": "Field is required.",
    "extra_forbidden": "Unexpected field.",
    "string_type": "Expected text.",
    "string_too_short": "Text is too short.",
    "string_too_long": "Text is too long.",
    "int_type": "Expected an integer.",
    "int_parsing": "Expected an integer.",
    "bool_parsing": "Expected a boolean.",
    "greater_than": "Value must exceed the allowed minimum.",
    "greater_than_equal": "Value is below the allowed minimum.",
    "less_than": "Value must be below the allowed maximum.",
    "less_than_equal": "Value exceeds the allowed maximum.",
    "literal_error": "Value is not one of the allowed choices.",
    "json_invalid": "Request body is not valid JSON.",
    "date_from_datetime_parsing": "Enter a valid date.",
    "datetime_from_date_parsing": "Enter a valid date and time.",
    "timezone_aware": "Include a timezone offset in the date and time.",
    **PUBLIC_VALIDATION_MESSAGES,
}


def error_responses(*statuses: int) -> dict[int | str, dict[str, Any]]:
    """Describe the actual shared wire envelope for an operation's failure statuses."""
    return {
        status: {"model": ErrorResponse, "description": HTTPStatus(status).phrase}
        for status in statuses
    }


class AppError(Exception):
    """An expected failure with a deliberately safe, public message.

    Callers must supply fixed error codes/messages, never patient values,
    credentials, SQL, or the text of a caught infrastructure exception.
    """

    def __init__(self, *, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def _response(
    status_code: int,
    detail: ErrorDetail,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=ErrorResponse(error=detail).model_dump(mode="json"),
        headers=headers,
    )


async def _handle_app_error(_request: Request, error: Exception) -> JSONResponse:
    exc = cast(AppError, error)
    return _response(exc.status_code, ErrorDetail(code=exc.code, message=exc.message))


async def _handle_http_error(_request: Request, error: Exception) -> JSONResponse:
    exc = cast(HTTPException, error)
    try:
        status = HTTPStatus(exc.status_code)
        code, message = status.name.lower(), status.phrase
    except ValueError:
        code, message = "http_error", "Request failed."
    # Framework/custom exception detail can contain arbitrary submitted values.
    return _response(exc.status_code, ErrorDetail(code=code, message=message), exc.headers)


async def _handle_validation_error(_request: Request, error: Exception) -> JSONResponse:
    exc = cast(RequestValidationError, error)
    fields = tuple(
        FieldError(
            path=tuple(item["loc"])
            + (
                (VALIDATION_FIELD_TARGETS[item["type"]],)
                if item["type"] in VALIDATION_FIELD_TARGETS
                else ()
            ),
            code=item["type"],
            message=_VALIDATION_MESSAGES.get(item["type"], "Invalid value."),
        )
        for item in exc.errors()
    )
    return _response(
        422,
        ErrorDetail(
            code="validation_error",
            message="Request validation failed.",
            fields=fields,
        ),
    )


async def _handle_data_error(_request: Request, _error: Exception) -> JSONResponse:
    # PostgreSQL rejected a value that passed validation, such as a NUL character in text.
    return _response(
        422,
        ErrorDetail(
            code="invalid_value",
            message="A submitted value cannot be stored. Remove unsupported characters.",
        ),
    )


async def _handle_unexpected_error(_request: Request, _error: Exception) -> JSONResponse:
    # Starlette propagates the original exception to the server after this response.
    # The logging filter keeps stack locations without exception values or SQL parameters.
    return _response(
        500,
        ErrorDetail(code="internal_server_error", message="An unexpected error occurred."),
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Register response handlers while retaining the framework's error propagation."""
    app.add_exception_handler(AppError, _handle_app_error)
    app.add_exception_handler(HTTPException, _handle_http_error)
    app.add_exception_handler(RequestValidationError, _handle_validation_error)
    app.add_exception_handler(DataError, _handle_data_error)
    app.add_exception_handler(Exception, _handle_unexpected_error)
