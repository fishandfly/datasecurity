import asyncio
import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.runtime import (
    RuntimeContext,
    RuntimeDenied,
    authorize,
    execute_data_api,
    load_policy,
    load_subject_by_api_key,
    record_allowed,
    build_resource_label_snapshot,
    runtime_trace,
)


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
        "output_mode": "detail",
        "abnormal_access_rules_json": {},
    }


def authorize_with_policy(test_policy, query=None, frequency=1):
    api = {
        "id": 9,
        "api_code": "API-RESOURCE-9",
        "runtime_config_json": {"fieldMap": {"VALUE": "value"}, "defaultFields": ["VALUE"]},
    }
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


def test_region_scope_requires_explicit_region_code():
    test_policy = policy() | {"region_scope_json": ["REGION-A"]}
    with pytest.raises(RuntimeDenied) as denied:
        authorize_with_policy(test_policy)

    assert denied.value.code == "REGION_REQUIRED"
    assert denied.value.risk_factors[0]["code"] == "regionRequired"


def test_region_scope_rejects_a_region_outside_the_policy():
    test_policy = policy() | {"region_scope_json": ["REGION-A"]}
    with pytest.raises(RuntimeDenied) as denied:
        authorize_with_policy(test_policy, {"regionCode": "REGION-B"})

    assert denied.value.code == "SCOPE_VIOLATION"


def test_region_scope_does_not_read_legacy_organization_scope():
    test_policy = policy() | {
        "organization_scope_json": ["ORG-A"],
        "region_scope_json": ["REGION-A"],
    }
    context = authorize_with_policy(test_policy, {"regionCode": "REGION-A", "organizationCode": "ORG-B"})

    assert context.policy["region_scope_json"] == ["REGION-A"]


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


def test_resource_metadata_is_included_in_runtime_label_and_classification_snapshot():
    resource = {
        "id": 10,
        "protection_level": "l3",
        "resource_tags": ["量测数据"],
        "security_level": "4",
        "measurement_type": "日冻结电能示值",
        "data_granularity": "day",
    }
    fields = [{
        "field_code": "CONS_NO", "security_level": "important",
        "information_category": "量测标识信息", "classification_level": "3 级条件共享",
        "field_tags": ["需脱敏"], "required_desensitization": True,
        "important_field_flag": True,
    }]
    with patch("app.runtime.fetch_one", side_effect=[resource, {}]), \
         patch("app.runtime.fetch_all", return_value=fields):
        snapshot = build_resource_label_snapshot(10, "metadata-v1")

    assert {"量测数据", "日冻结电能示值", "日级", "4级数据"}.issubset(snapshot["matchedLabels"])
    assert snapshot["fieldTags"]["CONS_NO"] == ["需脱敏", "量测标识信息", "3 级条件共享", "重要字段"]
    assert snapshot["classification"] == {
        "securityCategoryId": None,
        "securityLevelId": None,
        "dataSubjectTypeId": None,
        "dataSecurityLevel": "4",
        "dataType": "日冻结电能示值",
        "dataGranularity": "day",
    }


def test_legacy_risk_action_is_treated_as_direct_denial():
    test_policy = policy() | {
        "abnormal_access_rules_json": {
            "queryRangeExceeded": {"enabled": True, "action": "risk", "riskScore": 70},
        },
    }
    with pytest.raises(RuntimeDenied) as denied:
        authorize_with_policy(
            test_policy,
            {"startAt": "2026-07-01T00:00:00Z", "endAt": "2026-07-03T00:00:00Z"},
        )

    assert denied.value.code == "QUERY_RANGE_EXCEEDED"
    assert denied.value.risk_score == 60


@pytest.mark.parametrize(
    "rule",
    [
        {"enabled": True, "action": "allow"},
        {"enabled": False, "action": "deny"},
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


def test_l2_default_fields_cannot_bypass_masking_constraint():
    test_policy = policy() | {
        "policy_detail_json": {
            "runtimeSnapshot": {
                "version": "runtime-l2",
                "protectionLevel": "l2",
                "matchedLabels": ["明细受控", "需脱敏"],
                "hardConstraints": {"maskedFields": ["VALUE"]},
            },
        },
    }

    with pytest.raises(RuntimeDenied) as denied:
        authorize_with_policy(test_policy)

    assert denied.value.code == "TAG_CONSTRAINT_VIOLATION"
    assert "TAG_ENRICH" in denied.value.security_actions
    assert "CLASSIFY" in denied.value.security_actions
    assert "ISOLATE_L2" in denied.value.security_actions


def test_l3_policy_requires_declared_homomorphic_executor():
    test_policy = policy() | {
        "output_mode": "encrypted",
        "policy_detail_json": {
            "runtimeSnapshot": {
                "version": "runtime-l3",
                "protectionLevel": "l3",
                "matchedLabels": ["仅密态"],
                "hardConstraints": {"encryptedOnly": True},
            },
        },
    }

    with pytest.raises(RuntimeDenied) as denied:
        authorize_with_policy(test_policy)

    assert denied.value.code == "TAG_CONSTRAINT_VIOLATION"
    assert denied.value.risk_factors[0]["code"] == "homomorphicCapability"
    assert "ROUTE_TO_HE_COMPUTE" in denied.value.security_actions


def test_direct_api_isolated_when_it_cannot_execute_controlled_output():
    context = RuntimeContext(
        request_id="REQ-DIRECT-ISOLATION",
        api={"id": 9, "access_mode": "direct", "orchestrator_path": "", "upstream_url": "http://example.invalid"},
        subject={"id": 2},
        policy={"id": 12, "output_mode": "masked"},
        risk_score=0,
        client_ip="10.20.10.8",
        query_days=0,
        requested_rows=10,
        matched_labels=("需脱敏",),
        security_actions=("TAG_ENRICH", "CLASSIFY", "ISOLATE_L2", "POLICY_MATCH", "MASK", "AUDIT"),
    )

    with pytest.raises(RuntimeDenied) as denied:
        asyncio.run(execute_data_api(SimpleNamespace(headers={}, method="GET", query_params=QueryParams()), context))

    assert denied.value.code == "TAG_CONSTRAINT_VIOLATION"
    assert denied.value.risk_factors[0]["code"] == "directRouteIsolation"
    assert denied.value.security_actions[-1] == "DENY"


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
        risk_factors=({"code": "identifierField", "label": "直接标识符", "score": 15},),
        label_snapshot_version="runtime-v6",
        security_actions=("TAG_ENRICH", "CLASSIFY", "ISOLATE_L2", "POLICY_MATCH", "MASK", "AUDIT"),
    )

    with patch("app.runtime.execute") as execute:
        record_allowed(context, returned_rows=8, duration_ms=12)

    statement, parameters = execute.call_args.args
    assert "applied_limits_json" in statement
    evidence = json.loads(parameters["evidence"])
    assert evidence["matchedLabels"] == ["重要数据", "需脱敏"]
    assert evidence["riskFactors"][0]["score"] == 15
    assert evidence["hardConstraints"]["maskedFields"] == ["POINT_ID"]
    assert evidence["securityActions"][-1] == "AUDIT"
    assert evidence["classification"]["protectionLevel"] == ""
    assert [step["stage"] for step in evidence["runtimeTrace"]] == [
        "label_enrichment",
        "classification",
        "dynamic_policy",
        "security_action",
        "audit",
    ]
    assert evidence["runtimeTrace"][3]["outcome"] == "MASK"
    assert evidence["runtimeTrace"][4]["status"] == "audit_recorded"


def test_runtime_trace_records_high_risk_denial_without_risk_event():
    trace = runtime_trace(
        policy={"id": 12, "policy_code": "POL-12", "policy_version": 3, "output_mode": "detail"},
        snapshot={
            "version": "runtime-v6",
            "matchedLabels": ["重要数据"],
            "protectionLevel": "L3",
            "sensitivity": "high",
        },
        matched_labels=("重要数据",),
        actions=("TAG_ENRICH", "CLASSIFY", "ISOLATE_L3", "POLICY_MATCH", "DENY", "AUDIT"),
        decision="deny",
        risk_score=90,
        reason_code="RISK_REJECTED",
    )

    assert trace[0]["status"] == "completed"
    assert trace[1]["protectionLevel"] == "L3"
    assert trace[2]["reasonCode"] == "RISK_REJECTED"
    assert trace[3]["outcome"] == "DENY"
    assert trace[4]["status"] == "audit_recorded"
    assert "riskEventCreated" not in trace[4]


def test_load_policy_uses_exact_resource_and_api_match():
    exact = policy() | {
        "id": 12,
        "resource_id": 8,
        "api_resource_id": 9,
        "policy_code": "POL-12",
        "policy_version": 2,
    }
    with patch("app.runtime.fetch_all", return_value=[exact]):
        selected = load_policy(2, 9, "resource-data-query")

    assert selected["id"] == 12
    assert selected["_policyEvaluations"][0]["result"] == "passed"


def test_load_policy_returns_none_without_exact_policy():
    grouped = policy() | {"id": 20, "resource_id": 8, "api_resource_id": None}
    with patch("app.runtime.fetch_all", return_value=[grouped]):
        assert load_policy(2, 9, "resource-data-query") is None
