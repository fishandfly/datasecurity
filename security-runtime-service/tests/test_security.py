from datetime import datetime

from app.security import (
    RequestMemory,
    api_key_matches,
    calculate_risk,
    canonical_query,
    canonical_request,
    ip_allowed,
    signature,
    signature_matches,
)


def test_api_key_uses_constant_time_secret_comparison_contract():
    secret = "a" * 32
    assert api_key_matches(secret, secret)
    assert not api_key_matches(secret, "b" * 32)
    assert not api_key_matches(secret, "short")


def test_canonical_query_is_sorted_and_percent_encoded():
    assert canonical_query([("z", "a b"), ("a", "2"), ("a", "1")]) == "a=1&a=2&z=a%20b"


def test_request_signature_contract():
    secret = "a" * 32
    canonical = canonical_request(
        "get",
        "/data-api/internal/active-power",
        [("regionCode", "REGION-A")],
        b"",
        "1783891200000",
        "abcdefghijklmnop",
    )
    digest = signature(secret, canonical)
    assert len(digest) == 64
    assert signature_matches(secret, canonical, digest)
    assert not signature_matches(secret, canonical, "0" * 64)


def test_nonce_replay_and_rate_memory():
    memory = RequestMemory()
    assert memory.remember_nonce("subject:nonce", 300)
    assert not memory.remember_nonce("subject:nonce", 300)
    assert memory.increment_rate("subject:api") == 1
    assert memory.increment_rate("subject:api") == 2


def test_ip_range_matching():
    assert ip_allowed("10.20.10.8", ["10.20.10.0/24"])
    assert not ip_allowed("10.20.11.8", ["10.20.10.0/24"])
    assert not ip_allowed("invalid", ["10.20.10.0/24"])


def test_risk_score_uses_time_rows_and_baseline():
    score = calculate_risk(
        now=datetime(2026, 7, 13, 3, 0),
        allowed_time_ranges=[{"days": [1], "from": "08:00", "to": "18:00"}],
        frequency=30,
        query_days=3,
        requested_rows=2000,
        max_rows=1000,
        baseline={
            "frequency_avg": 10,
            "frequency_stddev": 5,
            "query_days_avg": 1,
            "query_days_stddev": 0.5,
            "rows_avg": 500,
            "rows_stddev": 100,
        },
    )
    assert score == 100
