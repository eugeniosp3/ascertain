"""Validate environment settings once, at the application boundary."""

from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError


class Settings(BaseSettings):
    """Explicit application configuration; loading settings performs no database I/O."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        frozen=True,
        hide_input_in_errors=True,
    )

    app_name: str = "Ascertain API"
    app_env: Literal["development", "test", "production"] = "development"
    demo_mode: bool = True
    database_url: SecretStr | None = None
    db_connect_timeout_seconds: int = Field(default=3, ge=1, le=30)
    cors_origins: tuple[str, ...] = ("http://localhost:5173",)
    # Summaries: a keyless OpenAI-compatible endpoint, with the deterministic template as fallback.
    summary_provider: Literal["llm", "template"] = "llm"
    llm_base_url: str = "https://api.llm7.io/v1"
    llm_model: str = Field(default="gemma-3-27b", min_length=1)
    llm_timeout_seconds: int = Field(default=10, ge=1, le=60)

    @field_validator("database_url")
    @classmethod
    def require_postgresql(cls, value: SecretStr | None) -> SecretStr | None:
        """Accept only the agreed synchronous PostgreSQL driver; redact invalid inputs."""
        if value is None:
            return value
        try:
            url = make_url(value.get_secret_value())
        except (ArgumentError, ValueError):
            raise ValueError("DATABASE_URL must be a valid PostgreSQL URL.") from None
        if url.drivername != "postgresql+psycopg" or not url.database:
            raise ValueError("DATABASE_URL must use postgresql+psycopg and name a database.")
        return value

    @field_validator("llm_base_url")
    @classmethod
    def require_http_base_url(cls, value: str) -> str:
        """Call the summary model only over HTTP(S); drop a trailing slash before joining paths."""
        try:
            url = urlsplit(value)
            valid = url.scheme in {"http", "https"} and bool(url.hostname)
        except ValueError:
            valid = False
        if not valid:
            raise ValueError("LLM_BASE_URL must be an HTTP(S) URL.")
        return value.rstrip("/")

    @field_validator("cors_origins")
    @classmethod
    def validate_origins(cls, values: tuple[str, ...]) -> tuple[str, ...]:
        """Keep CORS origins explicit and normalize the optional trailing slash."""
        origins: list[str] = []
        for value in values:
            try:
                url = urlsplit(value)
                valid = (
                    url.scheme in {"http", "https"}
                    and url.hostname is not None
                    and url.username is None
                    and url.password is None
                    and url.path in {"", "/"}
                    and not url.query
                    and not url.fragment
                    and "*" not in value
                )
                _ = url.port  # Reject malformed ports as part of configuration validation.
            except ValueError:
                valid = False
            if not valid:
                raise ValueError("CORS_ORIGINS must contain explicit HTTP(S) origins.")
            origins.append(value.rstrip("/"))
        return tuple(dict.fromkeys(origins))
