"""Keep actionable exception locations without logging values from exception messages."""

import logging
import traceback


class RedactExceptionDetails(logging.Filter):
    """Replace exception text with its type and stack locations before handlers format it."""

    def filter(self, record: logging.LogRecord) -> bool:
        if record.exc_info is not None:
            exception_type, _exception, trace = record.exc_info
            locations = [
                f'  File "{frame.filename}", line {frame.lineno}, in {frame.name}'
                for frame in traceback.extract_tb(trace)
            ]
            name = exception_type.__name__ if exception_type is not None else "Exception"
            record.exc_text = "\n".join(["Traceback (values redacted):", *locations, name])
            record.exc_info = None
        return True


def configure_exception_logging() -> None:
    """Install one filter on Uvicorn's error logger; leave its handlers/configuration intact."""
    logger = logging.getLogger("uvicorn.error")
    if not any(isinstance(item, RedactExceptionDetails) for item in logger.filters):
        logger.addFilter(RedactExceptionDetails())
