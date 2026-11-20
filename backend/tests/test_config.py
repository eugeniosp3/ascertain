import pytest
from pydantic import ValidationError

from app.config import Settings


def test_settings_load_typed_environment(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DB_CONNECT_TIMEOUT_SECONDS", "7")
    monkeypatch.setenv("CORS_ORIGINS", '["https://example.test/", "https://example.test"]')
    configured = Settings()
    assert configured.db_connect_timeout_seconds == 7
    assert configured.cors_origins == ("https://example.test",)


def test_database_url_is_secret_and_bad_driver_is_rejected(settings: Settings) -> None:
    password = "test-password-that-must-stay-hidden"
    configured = Settings(database_url=f"postgresql+psycopg://demo:{password}@localhost/demo")
    assert password not in repr(configured)
    with pytest.raises(ValidationError) as caught:
        Settings(database_url=f"mysql://demo:{password}@localhost/demo")
    assert password not in str(caught.value)


def test_database_url_bad_port_uses_safe_message(settings: Settings) -> None:
    marker = "invalid-sensitive-port"
    with pytest.raises(ValidationError) as caught:
        Settings(database_url=f"postgresql+psycopg://demo:password@localhost:{marker}/demo")
    assert marker not in str(caught.value)
    assert "DATABASE_URL must be a valid PostgreSQL URL." in str(caught.value)


@pytest.mark.parametrize("timeout", [0, 31])
def test_connect_timeout_is_bounded(settings: Settings, timeout: int) -> None:
    with pytest.raises(ValidationError):
        Settings(db_connect_timeout_seconds=timeout)


@pytest.mark.parametrize(
    "origin",
    ["*", "https://example.test/patients", "https://demo:password@example.test", "ftp://host"],
)
def test_cors_requires_explicit_origins(settings: Settings, origin: str) -> None:
    with pytest.raises(ValidationError):
        Settings(cors_origins=(origin,))
