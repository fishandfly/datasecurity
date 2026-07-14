from __future__ import annotations

import json
import os
from dataclasses import dataclass


def _boolean(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _mapping(name: str) -> dict[str, str]:
    raw = os.getenv(name, "{}").strip() or "{}"
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"{name} must be a JSON object") from error
    if not isinstance(value, dict):
        raise RuntimeError(f"{name} must be a JSON object")
    return {
        str(key).strip(): str(secret)
        for key, secret in value.items()
        if str(key).strip() and str(secret)
    }


@dataclass(frozen=True)
class Settings:
    database_url: str
    management_api_url: str
    homomorphic_service_url: str
    subject_secrets: dict[str, str]
    source_secrets: dict[str, str]
    enforce_source_ip: bool
    trust_proxy_headers: bool
    request_clock_skew_seconds: int
    nonce_ttl_seconds: int
    connection_timeout_seconds: int

    @classmethod
    def from_environment(cls) -> "Settings":
        return cls(
            database_url=os.getenv(
                "DATABASE_URL",
                "postgresql://nocobase:nocobase@postgres:5432/nocobase",
            ),
            management_api_url=os.getenv(
                "MANAGEMENT_API_URL", "http://app/api/"
            ).rstrip("/")
            + "/",
            homomorphic_service_url=os.getenv(
                "HOMOMORPHIC_SERVICE_URL", "http://openfhe:8088"
            ).rstrip("/"),
            subject_secrets=_mapping("SUBJECT_SECRETS_JSON"),
            source_secrets=_mapping("SOURCE_SECRETS_JSON"),
            enforce_source_ip=_boolean("RUNTIME_ENFORCE_SOURCE_IP", True),
            trust_proxy_headers=_boolean("RUNTIME_TRUST_PROXY_HEADERS", True),
            request_clock_skew_seconds=max(
                30, int(os.getenv("REQUEST_CLOCK_SKEW_SECONDS", "300"))
            ),
            nonce_ttl_seconds=max(30, int(os.getenv("NONCE_TTL_SECONDS", "300"))),
            connection_timeout_seconds=max(
                1, int(os.getenv("CONNECTION_TIMEOUT_SECONDS", "10"))
            ),
        )


settings = Settings.from_environment()
