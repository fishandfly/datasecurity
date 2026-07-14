from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.runtime import RuntimeDenied, authorize


class QueryParams:
    def get(self, name):
        return None

    def multi_items(self):
        return []


def request(api_key="k" * 32):
    return SimpleNamespace(
        headers={"x-api-key": api_key, "x-scenario": "resource-data-query"},
        url=SimpleNamespace(path="/data-api/resources/meter", query_params=QueryParams()),
        method="GET",
        client=SimpleNamespace(host="10.20.10.8"),
        query_params=QueryParams(),
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
