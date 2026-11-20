import logging

import pytest

from app.utils.logging import configure_exception_logging


def test_server_exception_logs_keep_location_without_values(
    caplog: pytest.LogCaptureFixture,
) -> None:
    configure_exception_logging()
    logger = logging.getLogger("uvicorn.error")
    with caplog.at_level(logging.ERROR, logger="uvicorn.error"):
        try:
            raise ValueError("private-patient-value")
        except ValueError:
            logger.exception("Exception in ASGI application")
    assert "private-patient-value" not in caplog.text
    assert "ValueError" in caplog.text
    assert "test_server_exception_logs_keep_location_without_values" in caplog.text
