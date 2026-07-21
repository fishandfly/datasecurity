import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.runtime import RuntimeContext, RuntimeDenied, authorize, load_policy, load_subject_by_api_key, record_allowed


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


def test_missing_policy_message_identifies_policy_matching_stage():
    api = {"id": 9, "api_code": "API-RESOURCE-9"}
    with patch("app.runtime.load_api", return_value=api), \
         patch("app.runtime.load_subject_by_api_key", return_value=subject(["API-RESOURCE-9"])), \
         patch("app.runtime.load_policy", return_value=None), \
         patch("app.runtime.settings", SimpleNamespace(enforce_source_ip=False, trust_proxy_headers=False)):
        with pytest.raises(RuntimeDenied) as denied:
            authorize(request(), b"")

    assert denied.value.code == "POLICY_NOT_FOUND"
    assert denied.value.message == "当前请求未匹配到适用的已发布访问策略"
    assert "未获准访问该 API" not in denied.value.message


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


def test_sensitive_label_snapshot_amplifies_behavior_risk_and_explains_decision():
    test_policy = policy() | {
        "risk_threshold": 40,
        "frequency_avg": 1,
        "frequency_stddev": 1,
        "query_days_avg": 0,
        "query_days_stddev": 1,
        "rows_avg": 0,
        "rows_stddev": 1,
        "policy_detail_json": {
            "runtimeSnapshot": {
                "version": "runtime-v3",
                "sensitivity": "important",
                "riskMultiplier": 1.5,
                "matchedLabels": ["重要数据", "明细受控"],
                "hardConstraints": {},
            },
        },
        "abnormal_access_rules_json": {
            "behaviorAnomaly": {"enabled": True, "action": "risk", "riskScore": 20},
        },
    }

    context = authorize_with_policy(test_policy, frequency=4)

    assert context.risk_score == 30
    assert context.matched_labels == ("重要数据", "明细受控")
    assert context.label_snapshot_version == "runtime-v3"
    assert context.risk_factors[0]["code"] == "behaviorAnomaly"
    assert context.risk_factors[0]["score"] == 30
    assert "1.5" in context.risk_factors[0]["detail"]


def test_aggregate_only_label_constraint_rejects_detail_policy():
    test_policy = policy() | {
        "policy_detail_json": {
            "runtimeSnapshot": {
                "version": "runtime-v4",
                "matchedLabels": ["仅聚合"],
                "hardConstraints": {"aggregateOnly": True},
            },
        },
    }

    with pytest.raises(RuntimeDenied) as denied:
        authorize_with_policy(test_policy)

    assert denied.value.code == "TAG_CONSTRAINT_VIOLATION"
    assert denied.value.matched_labels == ["仅聚合"]
    assert denied.value.risk_factors[0]["code"] == "aggregateOnly"


def test_masked_field_label_constraint_rejects_plain_detail_request():
    test_policy = policy() | {
        "policy_detail_json": {
            "runtimeSnapshot": {
                "version": "runtime-v5",
                "matchedLabels": ["需脱敏"],
                "hardConstraints": {"maskedFields": ["VALUE"]},
            },
        },
    }

    with pytest.raises(RuntimeDenied) as denied:
        authorize_with_policy(test_policy, {"fields": "VALUE"})

    assert denied.value.code == "TAG_CONSTRAINT_VIOLATION"
    assert denied.value.risk_factors[0]["code"] == "maskedFieldDetail"


def test_allowed_decision_log_persists_label_and_risk_evidence():
    context = RuntimeContext(
        request_id="REQ-EVIDENCE",
        api={"id": 9},
        subject={"id": 2},
        policy={
            "id": 12,
            "output_mode": "masked",
            "gateway_config_version": "runtime-v6",
            "policy_detail_json": {
                "runtimeSnapshot": {"hardConstraints": {"maskedFields": ["POINT_ID"]}},
            },
        },
        risk_score=30,
        client_ip="10.20.10.8",
        query_days=1,
        requested_rows=10,
        matched_labels=("重要数据", "需脱敏"),
        risk_factors=({"code": "behaviorAnomaly", "label": "行为基线偏离", "score": 30},),
        label_snapshot_version="runtime-v6",
    )

    with patch("app.runtime.execute") as execute:
        record_allowed(context, returned_rows=8, duration_ms=12)

    statement, parameters = execute.call_args.args
    assert "applied_limits_json" in statement
    evidence = json.loads(parameters["evidence"])
    assert evidence["matchedLabels"] == ["重要数据", "需脱敏"]
    assert evidence["riskFactors"][0]["score"] == 30
    assert evidence["hardConstraints"]["maskedFields"] == ["POINT_ID"]


def test_exact_resource_policy_takes_precedence_over_matching_label_policy():
    grouped = policy() | {
        "id": 20,
        "api_resource_id": None,
        "access_scope": "label_group",
        "requested_resource_id": 8,
        "security_tags": ["明细受控"],
    }
    exact = policy() | {"id": 12, "api_resource_id": 9, "requested_resource_id": 8}
    with patch("app.runtime.fetch_all", return_value=[grouped, exact]), \
         patch("app.runtime.build_resource_label_snapshot") as build_snapshot:
        selected = load_policy(2, 9, "resource-data-query")

    assert selected["id"] == 12
    build_snapshot.assert_not_called()


def test_matching_label_policies_use_priority_then_specificity():
    base_group = policy() | {
        "api_resource_id": None,
        "access_scope": "label_group",
        "requested_resource_id": 8,
        "gateway_config_version": "runtime-v7",
    }
    general = base_group | {
        "id": 20,
        "policy_version": 3,
        "security_tags": ["明细受控"],
        "security_profile_json": {"priority": 100, "match": "all"},
    }
    important = base_group | {
        "id": 21,
        "policy_version": 2,
        "security_tags": ["明细受控", "重要数据"],
        "security_profile_json": {"priority": 100, "match": "all", "protectionLevels": ["l2"]},
    }
    snapshot = {
        "version": "resource-live",
        "protectionLevel": "l2",
        "matchedLabels": ["明细受控", "重要数据"],
        "fieldTags": {},
        "classification": {},
        "hardConstraints": {},
    }
    with patch("app.runtime.fetch_all", return_value=[general, important]), \
         patch("app.runtime.build_resource_label_snapshot", return_value=snapshot):
        selected = load_policy(2, 9, "resource-data-query")

    assert selected["id"] == 21
    runtime_snapshot = selected["policy_detail_json"]["runtimeSnapshot"]
    assert runtime_snapshot["matchedLabels"] == ["明细受控", "重要数据"]
    assert runtime_snapshot["matchedPolicySelector"]["protectionLevels"] == ["l2"]
