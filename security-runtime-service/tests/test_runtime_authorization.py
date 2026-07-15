from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.runtime import RuntimeDenied, authorize, load_subject_by_api_key


class QueryParams:
    def __init__(self, values=None):
        self.values = values or {}

    def get(self, name):
        return self.values.get(name)

    def multi_items(self):
        return list(self.values.items())


def request(api_key="k" * 32, query=None):
    query_params = QueryParams(query)
    return SimpleNamespace(
        headers={"x-api-key": api_key, "x-scenario": "resource-data-query"},
        url=SimpleNamespace(path="/data-api/resources/meter", query_params=query_params),
        method="GET",
        client=SimpleNamespace(host="10.20.10.8"),
        query_params=query_params,
    )


def subject(allowed):
    return {
        "id": 2,
        "subject_code": "APP-A",
        "subject_status": "enabled",
        "allowed_api_codes_json": allowed,
        "ip_whitelist_json": [],
    }


def policy():
    return {
        "id": 12,
        "source_ips_json": [],
        "max_query_days": 1,
        "max_rows": 1000,
        "max_requests_per_minute": 60,
        "allowed_time_ranges_json": [],
        "organization_scope_json": [],
        "region_scope_json": [],
        "risk_threshold": 70,
        "output_mode": "detail",
        "abnormal_access_rules_json": {},
    }


def authorize_with_policy(test_policy, query=None, frequency=1):
    api = {"id": 9, "api_code": "API-RESOURCE-9", "runtime_config_json": {"fieldMap": {"VALUE": "value"}}}
    with patch("app.runtime.load_api", return_value=api), \
         patch("app.runtime.load_subject_by_api_key", return_value=subject(["API-RESOURCE-9"])), \
         patch("app.runtime.load_policy", return_value=test_policy), \
         patch("app.runtime.request_memory.increment_rate", return_value=frequency), \
         patch("app.runtime.settings", SimpleNamespace(enforce_source_ip=False, trust_proxy_headers=False)):
        return authorize(request(query=query), b"")


def test_api_key_authentication_and_subject_api_authorization_precede_policy():
    api = {"id": 9, "api_code": "API-RESOURCE-9", "runtime_config_json": {"fieldMap": {"VALUE": "value"}}}
    with patch("app.runtime.load_api", return_value=api), \
         patch("app.runtime.load_subject_by_api_key", return_value=subject(["API-RESOURCE-9"])) as load_subject, \
         patch("app.runtime.load_policy", return_value=policy()) as load_policy, \
         patch("app.runtime.settings", SimpleNamespace(enforce_source_ip=False, trust_proxy_headers=False)):
        context = authorize(request(), b"")

    assert context.subject["subject_code"] == "APP-A"
    load_subject.assert_called_once_with("k" * 32)
    load_policy.assert_called_once_with(2, 9, "resource-data-query")


def test_unauthorized_api_is_rejected_before_policy_loading():
    api = {"id": 9, "api_code": "API-RESOURCE-9"}
    with patch("app.runtime.load_api", return_value=api), \
         patch("app.runtime.load_subject_by_api_key", return_value=subject(["API-OTHER"])), \
         patch("app.runtime.load_policy") as load_policy, \
         patch("app.runtime.settings", SimpleNamespace(enforce_source_ip=False, trust_proxy_headers=False)):
        with pytest.raises(RuntimeDenied) as denied:
            authorize(request(), b"")

    assert denied.value.code == "API_NOT_AUTHORIZED"
    load_policy.assert_not_called()


def test_disabled_subject_api_key_is_identified_before_status_rejection():
    secret = "s" * 64
    disabled_subject = {
        "id": 2,
        "subject_code": "APP-A",
        "subject_status": "disabled",
        "credential_ref": "secret://subjects/app-a",
    }
    with patch("app.runtime.fetch_all", return_value=[disabled_subject]) as fetch_all, \
         patch("app.runtime.settings", SimpleNamespace(subject_secrets={"secret://subjects/app-a": secret})):
        loaded = load_subject_by_api_key(secret)

    assert loaded == disabled_subject
    assert "subject_status" not in fetch_all.call_args.args[0]

    api = {"id": 9, "api_code": "API-RESOURCE-9"}
    with patch("app.runtime.load_api", return_value=api), \
         patch("app.runtime.load_subject_by_api_key", return_value=disabled_subject), \
         patch("app.runtime.load_policy") as load_policy, \
         patch("app.runtime.settings", SimpleNamespace(enforce_source_ip=False, trust_proxy_headers=False)):
        with pytest.raises(RuntimeDenied) as denied:
            authorize(request(secret), b"")

    assert denied.value.code == "SUBJECT_DISABLED"
    load_policy.assert_not_called()


def test_risk_action_uses_configured_score_and_policy_threshold():
    test_policy = policy() | {
        "risk_threshold": 80,
        "abnormal_access_rules_json": {
            "queryRangeExceeded": {"enabled": True, "action": "risk", "riskScore": 70},
        },
    }
    context = authorize_with_policy(
        test_policy,
        {"startAt": "2026-07-01T00:00:00Z", "endAt": "2026-07-03T00:00:00Z"},
    )

    assert context.risk_score == 70


def test_risk_action_is_rejected_at_configured_threshold():
    test_policy = policy() | {
        "risk_threshold": 70,
        "abnormal_access_rules_json": {
            "queryRangeExceeded": {"enabled": True, "action": "risk", "riskScore": 70},
        },
    }
    with pytest.raises(RuntimeDenied) as denied:
        authorize_with_policy(
            test_policy,
            {"startAt": "2026-07-01T00:00:00Z", "endAt": "2026-07-03T00:00:00Z"},
        )

    assert denied.value.code == "RISK_REJECTED"
    assert denied.value.risk_score == 70


@pytest.mark.parametrize(
    "rule",
    [
        {"enabled": True, "action": "allow", "riskScore": 70},
        {"enabled": False, "action": "deny", "riskScore": 70},
    ],
)
def test_allow_and_disabled_rules_do_not_add_risk(rule):
    test_policy = policy() | {
        "abnormal_access_rules_json": {"queryRangeExceeded": rule},
    }
    context = authorize_with_policy(
        test_policy,
        {"startAt": "2026-07-01T00:00:00Z", "endAt": "2026-07-03T00:00:00Z"},
    )

    assert context.risk_score == 0


def test_behavior_anomaly_uses_configured_risk_score():
    test_policy = policy() | {
        "risk_threshold": 20,
        "frequency_avg": 1,
        "frequency_stddev": 1,
        "query_days_avg": 0,
        "query_days_stddev": 1,
        "rows_avg": 0,
        "rows_stddev": 1,
        "abnormal_access_rules_json": {
            "behaviorAnomaly": {"enabled": True, "action": "risk", "riskScore": 20},
        },
    }
    with pytest.raises(RuntimeDenied) as denied:
        authorize_with_policy(test_policy, frequency=4)

    assert denied.value.code == "RISK_REJECTED"
    assert denied.value.risk_score == 20
