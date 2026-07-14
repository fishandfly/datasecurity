from __future__ import annotations

import hashlib
import hmac
import ipaddress
import math
import re
import threading
import time
from collections.abc import Iterable, Sequence
from datetime import datetime
from urllib.parse import quote


NONCE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{16,64}$")


def canonical_query(items: Iterable[tuple[str, str]]) -> str:
    encoded = [
        (quote(str(key), safe="-._~"), quote(str(value), safe="-._~"))
        for key, value in items
    ]
    encoded.sort()
    return "&".join(f"{key}={value}" for key, value in encoded)


def canonical_request(
    method: str,
    path: str,
    query_items: Iterable[tuple[str, str]],
    body: bytes,
    timestamp: str,
    nonce: str,
) -> str:
    body_digest = hashlib.sha256(body).hexdigest()
    return "\n".join(
        [
            method.upper(),
            path,
            canonical_query(query_items),
            body_digest,
            timestamp,
            nonce,
        ]
    )


def signature(secret: str, canonical: str) -> str:
    return hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()


def signature_matches(secret: str, canonical: str, supplied: str) -> bool:
    return hmac.compare_digest(signature(secret, canonical), supplied.strip().lower())


def api_key_matches(expected: str, supplied: str) -> bool:
    return len(expected) >= 32 and len(supplied) >= 32 and hmac.compare_digest(expected, supplied)


def ip_allowed(address: str, networks: Sequence[str]) -> bool:
    if not networks:
        return True
    try:
        client = ipaddress.ip_address(address)
    except ValueError:
        return False
    for raw_network in networks:
        try:
            if client in ipaddress.ip_network(str(raw_network), strict=False):
                return True
        except ValueError:
            continue
    return False


def in_time_ranges(now: datetime, ranges: Sequence[dict]) -> bool:
    if not ranges:
        return True
    weekday = now.isoweekday()
    minutes = now.hour * 60 + now.minute
    for item in ranges:
        try:
            from_hour, from_minute = map(int, str(item["from"]).split(":"))
            to_hour, to_minute = map(int, str(item["to"]).split(":"))
            days = {int(value) for value in item.get("days", [])}
        except (KeyError, TypeError, ValueError):
            continue
        if (
            weekday in days
            and from_hour * 60 + from_minute <= minutes <= to_hour * 60 + to_minute
        ):
            return True
    return False


def _z_points(actual: float, average: float, standard_deviation: float) -> int:
    if standard_deviation <= 0:
        return 0
    z_score = abs(actual - average) / standard_deviation
    if z_score >= 3:
        return 20
    if z_score >= 2:
        return 10
    return 0


def calculate_risk(
    *,
    now: datetime,
    allowed_time_ranges: Sequence[dict],
    frequency: int,
    query_days: float,
    requested_rows: int,
    max_rows: int,
    baseline: dict | None,
) -> int:
    score = 0 if in_time_ranges(now, allowed_time_ranges) else 40
    if requested_rows > max_rows:
        score += 50
    if baseline:
        score += _z_points(
            frequency,
            float(baseline.get("frequency_avg") or 0),
            float(baseline.get("frequency_stddev") or 0),
        )
        score += _z_points(
            query_days,
            float(baseline.get("query_days_avg") or 0),
            float(baseline.get("query_days_stddev") or 0),
        )
        score += _z_points(
            requested_rows,
            float(baseline.get("rows_avg") or 0),
            float(baseline.get("rows_stddev") or 0),
        )
    return min(100, score)


def risk_level(score: int) -> str:
    if score >= 85:
        return "critical"
    if score >= 70:
        return "high"
    if score >= 50:
        return "medium"
    if score >= 30:
        return "notice"
    return "normal"


class RequestMemory:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._nonces: dict[str, float] = {}
        self._rates: dict[str, tuple[int, float]] = {}

    def remember_nonce(self, key: str, ttl_seconds: int) -> bool:
        now = time.monotonic()
        with self._lock:
            self._nonces = {
                current_key: expires_at
                for current_key, expires_at in self._nonces.items()
                if expires_at > now
            }
            if key in self._nonces:
                return False
            self._nonces[key] = now + ttl_seconds
            return True

    def increment_rate(self, key: str, window_seconds: int = 60) -> int:
        now = time.monotonic()
        with self._lock:
            count, expires_at = self._rates.get(key, (0, now + window_seconds))
            if expires_at <= now:
                count, expires_at = 0, now + window_seconds
            count += 1
            self._rates[key] = (count, expires_at)
            if len(self._rates) > 10000:
                self._rates = {
                    current_key: current
                    for current_key, current in self._rates.items()
                    if current[1] > now
                }
            return count


def finite_number(value: object, fallback: float = 0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return number if math.isfinite(number) else fallback


request_memory = RequestMemory()
