from __future__ import annotations

import json
import hashlib
import hmac
import math
import re
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import uuid4

import httpx
import psycopg
import pymysql
from psycopg import sql

from .database import connection, execute, fetch_all, fetch_one
from .security import (
    NONCE_PATTERN,
    api_key_matches,
    canonical_request,
    in_time_ranges,
    ip_allowed,
    request_memory,
    risk_level,
    signature_matches,
)
from .settings import settings


FIELD_COLUMNS = {
    "measurement_time": "measurement_time",
    "region_code": "region_code",
    "organization_code": "organization_code",
    "point_code": "point_code",
    "active_power": "active_power",
    "quality_code": "quality_code",
}
FIELD_CODES = {
    "measurement_time": "DATA_TIME",
    "region_code": "REGION_CODE",
    "organization_code": "ORGANIZATION_CODE",
    "point_code": "POINT_CODE",
    "active_power": "ACTIVE_POWER",
    "quality_code": "QUALITY_FLAG",
}
DEFAULT_FIELDS = [
    "measurement_time",
    "region_code",
    "organization_code",
    "point_code",
    "active_power",
]
IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,127}$")
CUSTOM_SQL_PARAM_PATTERN = re.compile(r"(?<!:):([A-Za-z_][A-Za-z0-9_]{0,63})")
FORBIDDEN_SQL_PATTERN = re.compile(
    r"\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|EXECUTE|MERGE)\b",
    re.IGNORECASE,
)
DENIALS = {
    "AUTH_MISSING": (401, "缺少访问凭据", 100),
    "API_KEY_INVALID": (401, "API Key 校验失败", 100),
    "SIGNATURE_INVALID": (401, "访问凭据校验失败", 100),
    "REQUEST_EXPIRED": (401, "请求已过期", 100),
    "REPLAY_DETECTED": (409, "请求已处理，请勿重复提交", 100),
    "SUBJECT_DISABLED": (403, "访问主体不可用", 95),
    "API_NOT_AUTHORIZED": (403, "当前访问主体未获准访问该 API", 95),
    "POLICY_NOT_FOUND": (403, "当前请求未匹配到适用的已发布访问策略", 90),
    "POLICY_EXPIRED": (403, "访问授权不在有效期内", 90),
    "IP_NOT_ALLOWED": (403, "当前网络来源不允许访问", 80),
    "FIELD_NOT_ALLOWED": (403, "请求包含未授权字段", 80),
    "TAG_CONSTRAINT_VIOLATION": (403, "请求方式不符合数据标签安全约束", 90),
    "RISK_REJECTED": (403, "当前请求因安全风险被拒绝", 70),
    "QUERY_RANGE_EXCEEDED": (422, "查询范围超过授权限制", 60),
    "ROW_LIMIT_EXCEEDED": (422, "请求数据量超过授权限制", 70),
    "OFF_HOURS": (403, "当前时间不在允许访问时段内", 70),
    "REGION_REQUIRED": (400, "当前访问策略要求传入 regionCode", 80),
    "REGION_FILTER_UNAVAILABLE": (403, "当前 API 未配置可执行的区域过滤", 90),
    "SCOPE_VIOLATION": (403, "请求的数据范围不在授权范围内", 80),
    "RATE_LIMITED": (429, "调用频率超过授权限制", 70),
    "VALIDATION_ERROR": (400, "请求参数不符合要求", 60),
    "INTERNAL_ERROR": (500, "服务处理失败", 60),
    "ROUTE_NOT_FOUND": (404, "数据服务未发布或已停用", 40),
    "UPSTREAM_UNAVAILABLE": (502, "上游数据服务暂不可用", 50),
    "INGEST_VALIDATION_FAILED": (422, "源端数据未通过接入完整性校验", 80),
    "HOMOMORPHIC_UNSUPPORTED": (422, "当前数据 API 未声明同态计算能力", 60),
    "HOMOMORPHIC_FIELD_INVALID": (422, "同态计算字段必须是数值类型", 60),
    "HOMOMORPHIC_NO_DATA": (422, "授权范围内没有可用的数值数据", 40),
    "HOMOMORPHIC_SAMPLE_LIMIT": (422, "授权范围内的样本数超过单次密态计算上限", 60),
    "HOMOMORPHIC_UNAVAILABLE": (502, "同态计算服务暂不可用", 50),
}

DEFAULT_ABNORMAL_ACCESS_RULES = {
    "offHours": {"enabled": True, "action": "deny", "riskScore": 70},
    "highFrequency": {"enabled": True, "action": "deny", "riskScore": 70},
    "queryRangeExceeded": {"enabled": True, "action": "deny", "riskScore": 60},
    "rowLimitExceeded": {"enabled": True, "action": "deny", "riskScore": 70},
    "scopeViolation": {"enabled": True, "action": "deny", "riskScore": 80},
}


class RuntimeDenied(Exception):
    def __init__(
        self,
        code: str,
        *,
        request_id: str,
        api: dict[str, Any] | None = None,
        subject: dict[str, Any] | None = None,
        policy: dict[str, Any] | None = None,
        client_ip: str = "gateway",
        query_days: float = 0,
        requested_rows: int = 0,
        risk_score: int | None = None,
        matched_labels: list[str] | tuple[str, ...] = (),
        risk_factors: list[dict[str, Any]] | tuple[dict[str, Any], ...] = (),
        label_snapshot_version: str = "",
        security_actions: list[str] | tuple[str, ...] = (),
        security_snapshot: dict[str, Any] | None = None,
    ) -> None:
        status, message, default_risk = DENIALS[code]
        super().__init__(message)
        self.code = code
        self.status = status
        self.message = message
        self.request_id = request_id
        self.api = api
        self.subject = subject
        self.policy = policy
        self.client_ip = client_ip
        self.query_days = max(0, query_days)
        self.requested_rows = max(0, requested_rows)
        self.risk_score = max(0, min(100, risk_score if risk_score is not None else default_risk))
        self.matched_labels = list(matched_labels)
        self.risk_factors = list(risk_factors)
        self.label_snapshot_version = label_snapshot_version
        self.security_actions = list(security_actions)
        self.security_snapshot = security_snapshot or {}


@dataclass(frozen=True)
class RuntimeContext:
    request_id: str
    api: dict[str, Any]
    subject: dict[str, Any]
    policy: dict[str, Any]
    risk_score: int
    client_ip: str
    query_days: float
    requested_rows: int
    matched_labels: tuple[str, ...] = ()
    risk_factors: tuple[dict[str, Any], ...] = ()
    label_snapshot_version: str = ""
    security_actions: tuple[str, ...] = ()
    security_snapshot: dict[str, Any] = field(default_factory=dict)

    @property
    def output_mode(self) -> str:
        return str(self.policy.get("output_mode") or "detail")

    @property
    def level(self) -> str:
        return risk_level(self.risk_score)


def _json_list(value: object) -> list:
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    return []


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _camel_case(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


def _json_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def _json_object(value: object) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _normalized_tags(*values: object) -> list[str]:
    tags: list[str] = []
    for value in values:
        candidates = _json_list(value)
        if not candidates and isinstance(value, str) and value.strip() and not value.lstrip().startswith("["):
            candidates = [item for item in re.split(r"[,，]", value) if item.strip()]
        for candidate in candidates:
            tag = str(candidate or "").strip()
            if tag and tag not in tags:
                tags.append(tag)
    return tags


def _policy_runtime_snapshot(policy: dict[str, Any]) -> dict[str, Any]:
    return _json_object(_json_object(policy.get("policy_detail_json")).get("runtimeSnapshot"))


def _unique_strings(*values: object) -> list[str]:
    return list(dict.fromkeys(str(value).strip() for value in values if str(value).strip()))


def _merge_hard_constraints(published: object, live: object) -> dict[str, Any]:
    published_constraints = _json_object(published)
    live_constraints = _json_object(live)
    return {
        "aggregateOnly": bool(published_constraints.get("aggregateOnly") or live_constraints.get("aggregateOnly")),
        "encryptedOnly": bool(published_constraints.get("encryptedOnly") or live_constraints.get("encryptedOnly")),
        "exportForbidden": bool(published_constraints.get("exportForbidden") or live_constraints.get("exportForbidden")),
        "maskedFields": _unique_strings(
            *_json_list(published_constraints.get("maskedFields")),
            *_json_list(live_constraints.get("maskedFields")),
        ),
    }


def runtime_security_snapshot(policy: dict[str, Any], api: dict[str, Any]) -> dict[str, Any]:
    """Refresh resource labels for each request while retaining the published policy snapshot."""
    published = _policy_runtime_snapshot(policy)
    resource_id = api.get("resource_id") or policy.get("resource_id")
    if not resource_id:
        return published
    try:
        live = build_resource_label_snapshot(
            resource_id,
            str(policy.get("gateway_config_version") or published.get("version") or "runtime-live"),
        )
    except Exception:
        # A published snapshot remains a fail-safe input if the metadata service is temporarily unavailable.
        return published
    return {
        **published,
        **live,
        "version": str(live.get("version") or published.get("version") or ""),
        "matchedLabels": _unique_strings(
            *_normalized_tags(published.get("matchedLabels")),
            *_normalized_tags(live.get("matchedLabels")),
        ),
        "fieldTags": {**_json_object(published.get("fieldTags")), **_json_object(live.get("fieldTags"))},
        "hardConstraints": _merge_hard_constraints(
            published.get("hardConstraints"), live.get("hardConstraints"),
        ),
        "classification": {
            **_json_object(published.get("classification")),
            **_json_object(live.get("classification")),
        },
    }


def security_actions_for(policy: dict[str, Any], snapshot: dict[str, Any]) -> tuple[str, ...]:
    """Return the concrete action chain produced by tag, classification and policy evaluation."""
    protection_level = str(snapshot.get("protectionLevel") or "").upper()
    sensitivity = str(snapshot.get("sensitivity") or "").strip()
    output_mode = str(policy.get("output_mode") or "detail")
    output_action = {
        "detail": "ALLOW",
        "masked": "MASK",
        "aggregate": "ROUTE_TO_ISOLATION",
        "encrypted": "ROUTE_TO_HE_COMPUTE",
    }.get(output_mode, "DENY")
    actions = ["TAG_ENRICH", "CLASSIFY"]
    if protection_level:
        actions.append(f"ISOLATE_{protection_level}")
    if sensitivity:
        actions.append(f"SENSITIVITY_{sensitivity.upper()}")
    actions.extend(["POLICY_MATCH", output_action, "AUDIT"])
    return tuple(_unique_strings(*actions))


def security_control_evidence(
    policy: dict[str, Any],
    snapshot: dict[str, Any],
    actions: list[str] | tuple[str, ...],
    *,
    api: dict[str, Any] | None = None,
    subject: dict[str, Any] | None = None,
    risk_factors: list[dict[str, Any]] | tuple[dict[str, Any], ...] = (),
    decision: str = "allow",
    reason_code: str = "POLICY_ALLOW",
) -> dict[str, Any]:
    return {
        "labelEnrichment": {
            "matchedLabels": _normalized_tags(snapshot.get("matchedLabels")),
            "fieldTags": _json_object(snapshot.get("fieldTags")),
            "snapshotVersion": str(snapshot.get("version") or ""),
        },
        "classification": {
            "protectionLevel": str(snapshot.get("protectionLevel") or ""),
            "sensitivity": str(snapshot.get("sensitivity") or ""),
            "attributes": _json_object(snapshot.get("classification")),
        },
        "dynamicPolicy": {
            "policyId": policy.get("id"),
            "policyCode": str(policy.get("policy_code") or ""),
            "policyVersion": policy.get("policy_version"),
            "outputMode": str(policy.get("output_mode") or "detail"),
        },
        "securityActions": list(actions),
        "hardConstraints": _json_object(snapshot.get("hardConstraints")),
        "accessPath": runtime_access_path(api or {}, subject or {}, policy),
        "policyEvaluations": policy_evaluations(policy, risk_factors, decision, reason_code),
    }


def runtime_access_path(
    api: dict[str, Any],
    subject: dict[str, Any],
    policy: dict[str, Any],
) -> dict[str, Any]:
    """Return a safe source -> resource -> application -> route summary."""
    source_id = api.get("data_source_id")
    resource_id = api.get("resource_id") or policy.get("resource_id")
    source: dict[str, Any] = {"id": source_id}
    resource: dict[str, Any] = {"id": resource_id}
    try:
        if source_id:
            row = fetch_one(
                "SELECT source_code, source_name FROM security_data_sources WHERE id=%(id)s LIMIT 1",
                {"id": source_id},
            ) or {}
            source.update({"code": row.get("source_code"), "name": row.get("source_name")})
        if resource_id:
            row = fetch_one(
                "SELECT resource_code, resource_name FROM eco_data_resources WHERE id=%(id)s LIMIT 1",
                {"id": resource_id},
            ) or {}
            resource.update({"code": row.get("resource_code"), "name": row.get("resource_name")})
    except Exception:
        # The decision log remains usable when metadata lookup is temporarily unavailable.
        pass
    return {
        "dataSource": source,
        "dataResource": resource,
        "dataApplication": {
            "id": subject.get("id"),
            "code": subject.get("subject_code"),
            "name": subject.get("subject_name"),
        },
        "api": {
            "id": api.get("id"),
            "code": api.get("api_code"),
            "name": api.get("api_name"),
            "gatewayPath": api.get("gateway_path"),
        },
        "route": {
            "accessMode": api.get("access_mode"),
            "orchestratorPath": api.get("orchestrator_path"),
            "outputMode": policy.get("output_mode"),
        },
    }


def policy_evaluations(
    policy: dict[str, Any],
    risk_factors: list[dict[str, Any]] | tuple[dict[str, Any], ...],
    decision: str,
    reason_code: str,
) -> list[dict[str, Any]]:
    """Expose selected policy candidates and rule outcomes without request secrets."""
    candidates = policy.get("_policyEvaluations")
    if isinstance(candidates, list) and candidates:
        evaluations = [dict(item) for item in candidates if isinstance(item, dict)]
    else:
        has_policy = bool(policy.get("id") or policy.get("policy_code"))
        evaluations = [{
            "policyId": policy.get("id"),
            "policyCode": str(policy.get("policy_code") or "无匹配策略"),
            "policyVersion": policy.get("policy_version"),
            "result": "passed" if decision == "allow" else ("failed" if has_policy else "not_matched"),
            "reason": "请求通过已发布访问策略校验" if decision == "allow" else (reason_code if has_policy else "主体、API 或调用场景未匹配到已发布策略，按默认拒绝"),
        }]
    factors = {str(item.get("code")): item for item in risk_factors if isinstance(item, dict)}
    rule_names = {
        "aggregateOnly": "仅允许聚合",
        "encryptedOnly": "仅允许密态",
        "queryRangeExceeded": "查询时间范围",
        "scopeViolation": "数据范围",
        "maskedFieldDetail": "明细字段脱敏",
        "highFrequency": "调用频率",
        "offHours": "允许时段",
        "rowLimitExceeded": "返回行数",
    }
    rules = []
    for code, label in rule_names.items():
        factor = factors.get(code)
        rules.append({
            "code": code,
            "name": label,
            "result": "triggered" if factor else "passed",
            "reason": str(factor.get("detail") or "未触发限制") if factor else "未触发限制",
            "riskScore": factor.get("score") if factor else 0,
        })
    evaluations.append({
        "stage": "runtime_rules",
        "result": "passed" if decision == "allow" else "failed",
        "reason": "请求已放行" if decision == "allow" else reason_code,
        "rules": rules,
    })
    return evaluations


def runtime_trace(
    *,
    policy: dict[str, Any] | None,
    snapshot: dict[str, Any] | None,
    matched_labels: list[str] | tuple[str, ...] = (),
    actions: list[str] | tuple[str, ...] = (),
    risk_factors: list[dict[str, Any]] | tuple[dict[str, Any], ...] = (),
    decision: str,
    risk_score: int = 0,
    reason_code: str = "",
) -> list[dict[str, Any]]:
    """Build one ordered, request-scoped trace for the five runtime controls."""
    policy = policy or {}
    snapshot = snapshot or {}
    output_mode = str(policy.get("output_mode") or "detail")
    action_outcome = "ALLOW" if decision == "allow" else "DENY"
    if decision == "allow":
        action_outcome = {
            "detail": "ALLOW",
            "masked": "MASK",
            "aggregate": "ROUTE_TO_ISOLATION",
            "encrypted": "ROUTE_TO_HE_COMPUTE",
        }.get(output_mode, "ALLOW")
    return [
        {
            "stage": "label_enrichment",
            "name": "标签补全",
            "status": "completed" if snapshot or matched_labels else "not_evaluated",
            "matchedLabels": list(matched_labels) or _normalized_tags(snapshot.get("matchedLabels")),
            "snapshotVersion": str(snapshot.get("version") or ""),
            "fieldTags": _json_object(snapshot.get("fieldTags")),
        },
        {
            "stage": "classification",
            "name": "分类分级",
            "status": "completed" if snapshot else "not_evaluated",
            "protectionLevel": str(snapshot.get("protectionLevel") or ""),
            "sensitivity": str(snapshot.get("sensitivity") or ""),
            "attributes": _json_object(snapshot.get("classification")),
        },
        {
            "stage": "dynamic_policy",
            "name": "动态策略",
            "status": "matched" if policy else "not_matched",
            "policyId": policy.get("id"),
            "policyCode": str(policy.get("policy_code") or ""),
            "policyVersion": policy.get("policy_version"),
            "outputMode": output_mode if policy else "",
            "reasonCode": reason_code,
            "evaluations": policy_evaluations(policy, risk_factors, decision, reason_code),
        },
        {
            "stage": "security_action",
            "name": "安全动作执行",
            "status": "completed" if decision == "allow" else "blocked",
            "actions": list(actions),
            "outcome": action_outcome,
        },
        {
            "stage": "audit",
            "name": "审计记录",
            "status": "audit_recorded",
            "decision": decision,
            "riskScore": risk_score,
        },
    ]


def build_resource_label_snapshot(resource_id: object, snapshot_version: str) -> dict[str, Any]:
    resource = fetch_one(
        "SELECT * FROM eco_data_resources WHERE id=%(id)s LIMIT 1",
        {"id": resource_id},
    ) or {}
    profile = fetch_one(
        """
        SELECT * FROM eco_resource_security_policies
        WHERE resource_id=%(resource_id)s AND policy_kind='resource_profile'
        ORDER BY "updatedAt" DESC NULLS LAST, id DESC
        LIMIT 1
        """,
        {"resource_id": resource_id},
    ) or {}
    fields = fetch_all(
        """
        SELECT field_code, security_level, classification_level, information_category,
               field_tags, required_desensitization, important_field_flag
        FROM eco_resource_security_fields
        WHERE resource_id=%(resource_id)s
        ORDER BY seq ASC NULLS LAST, id ASC
        """,
        {"resource_id": resource_id},
    )

    metadata_tags = []
    metadata_labels = {
        "realtime": "实时", "minute": "分钟级", "quarter_hour": "十五分钟级", "hour": "小时级", "day": "日级",
    }
    for key in ("measurement_type", "data_granularity"):
        value = str(resource.get(key) or "").strip()
        if value:
            metadata_tags.append(metadata_labels.get(value, value))
    if resource.get("security_level"):
        metadata_tags.append(f"{resource.get('security_level')}级数据")
    tags = _normalized_tags(resource.get("tags"), resource.get("resource_tags"), profile.get("security_tags"), metadata_tags)
    derived_tags = []
    flag_tags = (
        ("important_data_flag", "重要数据"),
        ("core_control_flag", "核心管控"),
        ("desensitization_required", "需脱敏"),
        ("approval_required", "需审批"),
    )
    for field_name, label in flag_tags:
        if profile.get(field_name) is True:
            derived_tags.append(label)
    if profile.get("export_allowed") is False:
        derived_tags.append("禁止导出")
    protection_level = str(resource.get("protection_level") or "l2").lower()
    protection_tag = {"l1": "仅聚合", "l2": "明细受控", "l3": "仅密态"}.get(protection_level)
    if protection_tag:
        derived_tags.append(protection_tag)
    tags = _normalized_tags(tags, derived_tags)

    field_tags: dict[str, list[str]] = {}
    masked_fields: list[str] = []
    identifier_fields: list[str] = []
    levels: list[str] = []
    for field in fields:
        code = str(field.get("field_code") or "").strip().upper()
        if not code:
            continue
        current_tags = _normalized_tags(field.get("field_tags"), field.get("information_category"), field.get("classification_level"))
        level = str(field.get("security_level") or "").strip().lower()
        if level:
            levels.append(level)
        if field.get("important_field_flag") is True and "重要字段" not in current_tags:
            current_tags.append("重要字段")
        field_tags[code] = current_tags
        if field.get("required_desensitization") is True or any("脱敏" in tag for tag in current_tags):
            masked_fields.append(code)
        if any(marker in tag for tag in current_tags for marker in ("标识符", "身份标识", "直接标识")):
            identifier_fields.append(code)

    all_markers = " ".join(tags + levels).lower()
    if profile.get("core_control_flag") is True or any(marker in all_markers for marker in ("核心", "core")):
        sensitivity = "core"
    elif profile.get("important_data_flag") is True or any(marker in all_markers for marker in ("重要", "important")):
        sensitivity = "important"
    elif any(marker in all_markers for marker in ("敏感", "sensitive")):
        sensitivity = "sensitive"
    elif protection_level == "l2" or any(marker in all_markers for marker in ("内部", "internal")):
        sensitivity = "internal"
    else:
        sensitivity = "public"
    multiplier = {"public": 1.0, "internal": 1.1, "sensitive": 1.25, "important": 1.5, "core": 1.8}[sensitivity]

    return {
        "version": snapshot_version,
        "resourceId": resource_id,
        "protectionLevel": protection_level,
        "sensitivity": sensitivity,
        "riskMultiplier": multiplier,
        "matchedLabels": tags,
        "fieldTags": field_tags,
        "identifierFields": identifier_fields,
        "hardConstraints": {
            "aggregateOnly": protection_level == "l1" or "仅聚合" in tags,
            "encryptedOnly": protection_level == "l3" or "仅密态" in tags,
            "exportForbidden": "禁止导出" in tags,
            "maskedFields": masked_fields,
        },
        "classification": {
            "securityCategoryId": profile.get("security_category_id"),
            "securityLevelId": profile.get("security_level_id"),
            "dataSubjectTypeId": profile.get("data_subject_type_id"),
            "dataSecurityLevel": str(resource.get("security_level") or ""),
            "dataType": str(resource.get("measurement_type") or ""),
            "dataGranularity": str(resource.get("data_granularity") or ""),
        },
    }


def build_policy_runtime_snapshot(policy: dict[str, Any], snapshot_version: str) -> dict[str, Any]:
    return build_resource_label_snapshot(policy.get("resource_id"), snapshot_version)


def abnormal_access_rule(policy: dict[str, Any], key: str) -> dict[str, Any]:
    default = DEFAULT_ABNORMAL_ACCESS_RULES[key]
    configured = _json_object(policy.get("abnormal_access_rules_json")).get(key)
    configured = configured if isinstance(configured, dict) else {}
    action = str(configured.get("action") or default["action"]).strip()
    if action not in {"deny", "allow"}:
        action = str(default["action"])
    return {
        "enabled": bool(configured.get("enabled", default["enabled"])),
        "action": action,
        # 风险分仅用于审计证据，不再作为策略可配置的放行阈值。
        "riskScore": int(default["riskScore"]),
    }


def violation_risk(policy: dict[str, Any], key: str, violated: bool) -> tuple[bool, int]:
    if not violated:
        return False, 0
    rule = abnormal_access_rule(policy, key)
    if not rule["enabled"] or rule["action"] == "allow":
        return False, 0
    return rule["action"] == "deny", int(rule["riskScore"])


def _identifier_parts(value: object) -> list[str]:
    parts = [part.strip() for part in str(value or "").split(".") if part.strip()]
    if not 1 <= len(parts) <= 2 or any(not IDENTIFIER_PATTERN.fullmatch(part) for part in parts):
        raise ValueError("运行表或字段映射包含非法标识符")
    return parts


def _quote_identifier(value: object, dialect: str) -> str:
    quote = "`" if dialect == "mysql" else '"'
    return ".".join(f"{quote}{part}{quote}" for part in _identifier_parts(value))


def _resource_table(resource: dict[str, Any], configured_table: object = "") -> str:
    if str(configured_table or "").strip():
        return str(configured_table).strip()
    table_profile = _json_object(resource.get("source_tablelist"))
    return str(
        table_profile.get("baseline_table")
        or table_profile.get("baselineTable")
        or resource.get("source_table")
        or ""
    ).strip()


def validate_custom_query_sql(value: object) -> tuple[str, list[str]]:
    statement = str(value or "").strip()
    if not statement:
        return "", []
    if statement.endswith(";"):
        statement = statement[:-1].rstrip()
    if not statement or ";" in statement or "--" in statement or "/*" in statement or "*/" in statement:
        raise ValueError("自定义 SQL 只允许单条无注释的 SELECT 语句")
    if not re.match(r"^SELECT\b", statement, re.IGNORECASE) or FORBIDDEN_SQL_PATTERN.search(statement):
        raise ValueError("自定义 SQL 只允许只读 SELECT 查询")
    parameters = list(dict.fromkeys(CUSTOM_SQL_PARAM_PATTERN.findall(statement)))
    if any(name.startswith("__api_") for name in parameters):
        raise ValueError("API 参数名不能使用 __api_ 前缀")
    return statement, parameters


def parameterize_custom_query_sql(statement: str) -> str:
    return CUSTOM_SQL_PARAM_PATTERN.sub(lambda match: f"%({match.group(1)})s", statement)


def build_resource_runtime_config(api: dict[str, Any]) -> tuple[dict[str, Any], int]:
    resource_id = api.get("resource_id")
    if not resource_id:
        raise ValueError("必须关联数据资源")
    resource = fetch_one(
        "SELECT * FROM eco_data_resources WHERE id=%(id)s LIMIT 1",
        {"id": resource_id},
    )
    if not resource:
        raise ValueError("关联的数据资源不存在")
    source_id = resource.get("data_source_id") or api.get("data_source_id")
    if not source_id:
        raise ValueError("数据资源必须关联数据源")
    if api.get("data_source_id") and int(api["data_source_id"]) != int(source_id):
        raise ValueError("API 数据源必须与数据资源的数据源一致")
    source = fetch_one(
        "SELECT * FROM security_data_sources WHERE id=%(id)s LIMIT 1",
        {"id": source_id},
    )
    if not source or source.get("connection_status") != "connected":
        raise ValueError("关联数据源尚未通过连接检查")
    options = _json_object(source.get("connection_options_json"))
    dialect = str(options.get("dialect") or "postgresql").lower()
    if dialect not in {"postgresql", "mysql"}:
        raise ValueError("数据库服务化仅支持 PostgreSQL 或 MySQL 数据源")

    fields = fetch_all(
        """
        SELECT field_code, output_allowed, required_desensitization
        FROM eco_resource_security_fields
        WHERE resource_id=%(resource_id)s
        ORDER BY seq ASC NULLS LAST, id ASC
        """,
        {"resource_id": resource_id},
    )
    resource_field_columns = {
        str(item.get("field_code") or "").strip().upper(): str(item.get("field_code") or "").strip()
        for item in fields
        if str(item.get("field_code") or "").strip()
    }
    resource_codes = list(resource_field_columns)
    if not resource_codes:
        raise ValueError("数据资源尚未维护字段，无法发布 API")

    configured = _json_object(api.get("runtime_config_json"))
    stat_base = _json_object(resource.get("stat_base"))
    resource_query = _json_object(stat_base.get("api_query") or stat_base.get("apiQuery"))
    configured_map = _json_object(configured.get("fieldMap") or configured.get("field_map"))
    output_codes = {
        str(item.get("field_code") or "").strip().upper()
        for item in fields
        if item.get("output_allowed") is not False
    }
    field_map = {
        str(code).strip().upper(): str(column).strip()
        for code, column in configured_map.items()
        if str(code).strip() and str(column).strip()
    } or {code: resource_field_columns[code] for code in resource_codes if code in output_codes}
    unknown_codes = sorted(set(field_map) - set(resource_codes))
    if unknown_codes:
        raise ValueError(f"字段映射包含不属于当前资源的字段：{', '.join(unknown_codes)}")
    blocked_codes = sorted(set(field_map) - output_codes)
    if blocked_codes:
        raise ValueError(f"字段映射包含禁止 API 输出的字段：{', '.join(blocked_codes)}")
    table_name = _resource_table(resource, configured.get("table"))
    if not table_name:
        raise ValueError("数据资源尚未维护基准物理表")
    _quote_identifier(table_name, dialect)
    for column in field_map.values():
        _quote_identifier(column, dialect)

    requested_defaults = [
        str(item).strip().upper()
        for item in _json_list(configured.get("defaultFields") or configured.get("default_fields"))
        if str(item).strip()
    ]
    default_fields = requested_defaults or [code for code in field_map if code in output_codes]
    if not default_fields or any(code not in field_map or code not in output_codes for code in default_fields):
        raise ValueError("默认输出字段必须是当前资源允许输出的字段")
    mask_fields = [
        str(item.get("field_code") or "").strip().upper()
        for item in fields
        if item.get("required_desensitization") and str(item.get("field_code") or "").strip().upper() in field_map
    ]
    query_sql, query_parameters = validate_custom_query_sql(
        configured.get("querySql")
        or configured.get("query_sql")
        or resource_query.get("query_sql")
        or resource_query.get("querySql")
    )
    default_params = _json_object(
        configured.get("defaultParams")
        or configured.get("default_params")
        or resource_query.get("default_params")
        or resource_query.get("defaultParams")
    )
    unknown_default_params = sorted(set(default_params) - set(query_parameters)) if query_sql else []
    if default_params and not query_sql:
        raise ValueError("配置 API 默认参数时必须同时编写引用该参数的自定义 SQL")
    if unknown_default_params:
        raise ValueError(f"API 默认参数未在 SQL 中引用：{', '.join(unknown_default_params)}")

    def configured_or_detect(camel_name: str, snake_name: str, markers: tuple[str, ...]) -> str:
        configured_code = str(configured.get(camel_name) or configured.get(snake_name) or "").strip().upper()
        if configured_code:
            if configured_code not in field_map:
                raise ValueError(f"{camel_name} 未包含在字段映射中")
            return configured_code
        return next((code for code in field_map if any(marker in code for marker in markers)), "")

    configured_scales = _json_object(
        configured.get("scales") or configured.get("scaleColumns") or configured.get("scale_columns")
    )
    scales: dict[str, float] = {}
    for code, value in configured_scales.items():
        if not str(code).strip():
            continue
        try:
            scale_value = float(value)
        except (TypeError, ValueError):
            continue
        if scale_value != 1:
            scales[str(code).strip().upper()] = scale_value
    region_field_code = configured_or_detect("regionFieldCode", "region_field_code", ("REGION",))
    effective_query_parameters = list(query_parameters)
    if region_field_code and not query_sql and "regionCode" not in effective_query_parameters:
        effective_query_parameters.append("regionCode")
    return {
        "version": 1,
        "dialect": dialect,
        "table": table_name,
        "fieldMap": field_map,
        "defaultFields": default_fields,
        "maskFields": mask_fields,
        "scales": scales,
        "timeFieldCode": configured_or_detect("timeFieldCode", "time_field_code", ("TIME", "DATE")),
        "regionFieldCode": region_field_code,
        "querySql": query_sql,
        "queryParams": effective_query_parameters,
        "defaultParams": default_params,
    }, int(source_id)


def verify_resource_runtime_config(api: dict[str, Any]) -> None:
    config = _json_object(api.get("runtime_config_json"))
    source = fetch_one(
        "SELECT * FROM security_data_sources WHERE id=%(id)s LIMIT 1",
        {"id": api.get("data_source_id")},
    ) or {}
    dialect = str(_json_object(source.get("connection_options_json")).get("dialect") or "postgresql").lower()
    query_sql, query_parameters = validate_custom_query_sql(config.get("querySql") or config.get("query_sql"))
    table_name = _quote_identifier(config.get("table"), dialect)
    columns = ", ".join(_quote_identifier(column, dialect) for column in _json_object(config.get("fieldMap")).values())
    if not columns:
        raise ValueError("运行字段映射不能为空")
    context = RuntimeContext("publish-check", api, {}, {}, 0, "management", 0, 0)
    with measurement_connection(context) as current, current.cursor() as cursor:
        if query_sql:
            defaults = _json_object(config.get("defaultParams") or config.get("default_params"))
            parameters = {name: defaults.get(name) for name in query_parameters}
            cursor.execute(
                f"SELECT * FROM ({parameterize_custom_query_sql(query_sql)}) AS api_query LIMIT 0",
                parameters,
            )
            returned_columns = {
                str(item.name if hasattr(item, "name") else item[0]).lower()
                for item in cursor.description or []
            }
            expected_columns = {str(item).lower() for item in _json_object(config.get("fieldMap")).values()}
            missing_columns = sorted(expected_columns - returned_columns)
            if missing_columns:
                raise ValueError(f"自定义 SQL 未返回已定义字段：{', '.join(missing_columns)}")
        else:
            cursor.execute(f"SELECT {columns} FROM {table_name} LIMIT 0")


def _config_enabled(config: dict[str, Any], camel_name: str, snake_name: str, default: bool = False) -> bool:
    value = config.get(camel_name) if camel_name in config else config.get(snake_name, default)
    return value is True or str(value).strip().lower() in {"1", "true", "yes", "on"}


def _unique_ingest_fields(*values: object) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        for item in _json_list(value):
            field_name = str(item).strip()
            normalized = field_name.upper()
            if field_name and normalized not in seen:
                seen.add(normalized)
                result.append(field_name)
    return result


def resolve_resource_ingest_validation(resource: dict[str, Any], source: dict[str, Any]) -> dict[str, Any]:
    security_config = _json_object(source.get("security_config_json"))
    source_validation_rules = _json_object(source.get("validation_rules_json"))
    stat_base = _json_object(resource.get("stat_base"))
    resource_validation = _json_object(
        stat_base.get("ingest_validation") or stat_base.get("ingestValidation")
    )

    sampling_enabled = _config_enabled(security_config, "samplingEnabled", "sampling_enabled")
    try:
        sampling_rate = float(
            security_config.get("samplingRate")
            or security_config.get("sampling_rate")
            or 100
        )
    except (TypeError, ValueError):
        sampling_rate = 100
    if _config_enabled(resource_validation, "samplingOverride", "sampling_override"):
        sampling_enabled = _config_enabled(
            resource_validation,
            "samplingEnabled",
            "sampling_enabled",
            True,
        )
        try:
            sampling_rate = float(
                resource_validation.get("samplingRate")
                or resource_validation.get("sampling_rate")
                or 100
            )
        except (TypeError, ValueError):
            sampling_rate = 100
    sampling_rate = min(max(sampling_rate, 1), 100)

    inherit_source_rules = _config_enabled(
        resource_validation,
        "inheritSourceRules",
        "inherit_source_rules",
        True,
    )
    required_fields = _unique_ingest_fields(
        source_validation_rules.get("required") if inherit_source_rules else [],
        resource_validation.get("requiredFields") or resource_validation.get("required_fields"),
    )
    duplicate_keys = _unique_ingest_fields(
        (
            source_validation_rules.get("duplicateKeys")
            or source_validation_rules.get("duplicate_keys")
        ) if inherit_source_rules else [],
        resource_validation.get("duplicateKeys") or resource_validation.get("duplicate_keys"),
    )
    source_numeric_ranges = _json_object(
        source_validation_rules.get("numericRanges")
        or source_validation_rules.get("numeric_ranges")
    ) if inherit_source_rules else {}
    numeric_ranges = {
        **source_numeric_ranges,
        **_json_object(
            resource_validation.get("numericRanges")
            or resource_validation.get("numeric_ranges")
        ),
    }

    integrity_mode = str(
        resource_validation.get("integrityMode")
        or resource_validation.get("integrity_mode")
        or "inherit"
    ).strip().lower()
    if integrity_mode == "disabled":
        integrity_enabled = False
        integrity_config_source = "resource"
    elif integrity_mode == "digest_field":
        integrity_enabled = True
        integrity_config_source = "resource"
    else:
        integrity_mode = "inherit"
        integrity_enabled = _config_enabled(security_config, "integrityEnabled", "integrity_enabled")
        integrity_config_source = "source"

    def configured_text(config: dict[str, Any], camel_name: str, snake_name: str, default: str = "") -> str:
        return str(config.get(camel_name) or config.get(snake_name) or default).strip()

    active_integrity_config = resource_validation if integrity_mode == "digest_field" else security_config
    checksum_algorithm = configured_text(
        active_integrity_config,
        "checksumAlgorithm",
        "checksum_algorithm",
        "SM3",
    ).upper()
    checksum_algorithm = "SHA-256" if checksum_algorithm in {"SHA-256", "SHA256"} else "SM3"
    digest_field = configured_text(active_integrity_config, "digestField", "digest_field")
    checksum_fields = _unique_ingest_fields(
        active_integrity_config.get("checksumFields")
        or active_integrity_config.get("checksum_fields")
    )
    integrity_failure_action = configured_text(
        active_integrity_config,
        "integrityFailureAction",
        "integrity_failure_action",
        "reject",
    ).lower()
    integrity_failure_action = "warn" if integrity_failure_action == "warn" else "reject"
    integrity_executable = integrity_enabled and bool(digest_field)

    return {
        "samplingEnabled": sampling_enabled,
        "samplingRate": sampling_rate,
        "configSource": "resource" if resource_validation else "source",
        "inheritSourceRules": inherit_source_rules,
        "integrityEnabled": integrity_enabled,
        "integrityExecutable": integrity_executable,
        "integrityMode": integrity_mode,
        "integrityConfigSource": integrity_config_source,
        "checksumAlgorithm": checksum_algorithm if integrity_enabled else "",
        "digestField": digest_field,
        "checksumFields": checksum_fields,
        "integrityFailureAction": integrity_failure_action,
        "validationRule": {
            "requiredFields": required_fields,
            "numericRanges": numeric_ranges,
            "duplicateKeys": duplicate_keys,
        },
    }


def sample_ingest_rows(rows: list[dict[str, Any]], config: dict[str, Any]) -> list[dict[str, Any]]:
    if not config.get("samplingEnabled"):
        return []
    sample_size = math.ceil(len(rows) * float(config.get("samplingRate") or 100) / 100)
    if sample_size >= len(rows):
        return rows
    if sample_size <= 0:
        return []
    sampled_indexes = [math.floor(index * len(rows) / sample_size) for index in range(sample_size)]
    return [rows[index] for index in sampled_indexes]


def validate_ingest_rows(
    rows: list[dict[str, Any]],
    columns: list[str],
    config: dict[str, Any],
) -> dict[str, Any]:
    validation_rule = _json_object(config.get("validationRule"))
    required_fields = _unique_ingest_fields(validation_rule.get("requiredFields"))
    duplicate_keys = _unique_ingest_fields(validation_rule.get("duplicateKeys"))
    numeric_ranges = _json_object(validation_rule.get("numericRanges"))
    integrity_executable = config.get("integrityExecutable") is True
    digest_field = str(config.get("digestField") or "").strip()
    checksum_fields = _unique_ingest_fields(config.get("checksumFields"))
    checksum_algorithm = str(config.get("checksumAlgorithm") or "SM3")
    integrity_failure_action = str(config.get("integrityFailureAction") or "reject")

    def row_lookup(row: dict[str, Any]) -> dict[str, Any]:
        return {str(key).strip().upper(): value for key, value in row.items()}

    def row_digest(lookup: dict[str, Any]) -> tuple[str, list[str]]:
        selected_fields = checksum_fields or [
            column for column in columns if column.upper() != digest_field.upper()
        ]
        missing_fields = [field for field in selected_fields if field.upper() not in lookup]
        canonical = {
            field.upper(): _json_value(lookup.get(field.upper()))
            for field in selected_fields
        }
        serialized = json.dumps(
            canonical,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        if checksum_algorithm == "SHA-256":
            digest = hashlib.sha256(serialized).hexdigest()
        else:
            digest = hashlib.new("sm3", serialized).hexdigest()
        return digest, missing_fields

    def normalized_digest(value: Any) -> str:
        normalized = str(value or "").strip().lower()
        for prefix in ("sm3:", "sm3=", "sha-256:", "sha-256=", "sha256:", "sha256="):
            if normalized.startswith(prefix):
                return normalized[len(prefix):].strip()
        return normalized

    integrity_results: list[bool | None] = [None for _ in rows]
    warnings_by_row: list[list[str]] = [[] for _ in rows]
    issues_by_row: list[list[str]] = [[] for _ in rows]
    duplicate_groups: dict[tuple[Any, ...], list[int]] = {}
    for row_index, row in enumerate(rows):
        lookup = row_lookup(row)
        for field_name in required_fields:
            value = lookup.get(field_name.upper())
            if value is None or (isinstance(value, str) and not value.strip()):
                issues_by_row[row_index].append(f"必填字段 {field_name} 为空或不存在")
        for field_name, configured_range in numeric_ranges.items():
            range_values = _json_list(configured_range)
            normalized_field = str(field_name).upper()
            if normalized_field not in lookup:
                issues_by_row[row_index].append(f"数值范围字段 {field_name} 不存在")
                continue
            value = lookup.get(normalized_field)
            if value in {None, ""} or len(range_values) < 2:
                continue
            try:
                numeric_value = float(value)
                minimum, maximum = float(range_values[0]), float(range_values[1])
                if numeric_value < minimum or numeric_value > maximum:
                    issues_by_row[row_index].append(
                        f"{field_name} 超出范围 [{minimum:g}, {maximum:g}]"
                    )
            except (TypeError, ValueError):
                issues_by_row[row_index].append(f"{field_name} 不是有效数值")
        if duplicate_keys:
            missing_duplicate_fields = [
                field_name for field_name in duplicate_keys if field_name.upper() not in lookup
            ]
            if missing_duplicate_fields:
                issues_by_row[row_index].append(
                    f"重复键字段 {', '.join(missing_duplicate_fields)} 不存在"
                )
            else:
                duplicate_value = tuple(lookup.get(field_name.upper()) for field_name in duplicate_keys)
                if all(value is not None and value != "" for value in duplicate_value):
                    duplicate_groups.setdefault(duplicate_value, []).append(row_index)
        if integrity_executable:
            expected_digest = normalized_digest(lookup.get(digest_field.upper()))
            actual_digest, missing_digest_fields = row_digest(lookup)
            if not expected_digest:
                integrity_results[row_index] = False
                integrity_issue = f"摘要字段 {digest_field} 为空或不存在"
            elif missing_digest_fields:
                integrity_results[row_index] = False
                integrity_issue = f"摘要参与字段 {', '.join(missing_digest_fields)} 不存在"
            elif not hmac.compare_digest(actual_digest, expected_digest):
                integrity_results[row_index] = False
                integrity_issue = f"{checksum_algorithm} 完整性校验失败"
            else:
                integrity_results[row_index] = True
                integrity_issue = ""
            if integrity_issue:
                if integrity_failure_action == "warn":
                    warnings_by_row[row_index].append(integrity_issue)
                else:
                    issues_by_row[row_index].append(integrity_issue)

    for duplicate_indexes in duplicate_groups.values():
        if len(duplicate_indexes) <= 1:
            continue
        for row_index in duplicate_indexes:
            issues_by_row[row_index].append(
                f"重复键 {', '.join(duplicate_keys)} 在本次样本中重复"
            )

    validation_results = []
    for index, issues in enumerate(issues_by_row):
        result: dict[str, Any] = {"passed": not issues, "issues": issues}
        if warnings_by_row[index]:
            result["warnings"] = warnings_by_row[index]
        if integrity_results[index] is not None:
            result["integrityPassed"] = integrity_results[index]
        validation_results.append(result)
    passed_count = sum(1 for result in validation_results if result["passed"])
    rejected_count = len(validation_results) - passed_count
    return {
        "sampleCount": len(rows),
        "passedCount": passed_count,
        "rejectedCount": rejected_count,
        "warningCount": sum(len(items) for items in warnings_by_row),
        "integrityCheckedCount": sum(1 for result in integrity_results if result is not None),
        "integrityPassedCount": sum(1 for result in integrity_results if result is True),
        "integrityFailedCount": sum(1 for result in integrity_results if result is False),
        "validationResults": validation_results,
    }


def preview_resource_latest_rows(resource_id: int, limit: int = 10) -> dict[str, Any]:
    started_timer = time.perf_counter()
    resource = fetch_one(
        "SELECT * FROM eco_data_resources WHERE id=%(id)s LIMIT 1",
        {"id": resource_id},
    )
    if not resource:
        raise LookupError("数据资源不存在")
    source_id = resource.get("data_source_id")
    if not source_id:
        raise ValueError("数据资源尚未关联数据源")
    source = fetch_one(
        "SELECT * FROM security_data_sources WHERE id=%(id)s LIMIT 1",
        {"id": source_id},
    )
    if not source or source.get("connection_status") != "connected":
        raise ValueError("关联数据源尚未通过连接检查")

    dialect = str(_json_object(source.get("connection_options_json")).get("dialect") or "postgresql").lower()
    if dialect not in {"postgresql", "mysql"}:
        raise ValueError("物理表预览仅支持 PostgreSQL 或 MySQL 数据源")
    table_name = _resource_table(resource)
    if not table_name:
        raise ValueError("数据资源尚未维护基准物理表")
    quoted_table = _quote_identifier(table_name, dialect)
    fields = fetch_all(
        """
        SELECT field_code, field_name, data_type
        FROM eco_resource_security_fields
        WHERE resource_id=%(resource_id)s
        ORDER BY seq ASC NULLS LAST, id ASC
        """,
        {"resource_id": resource_id},
    )
    columns = [str(field.get("field_code") or "").strip() for field in fields]
    columns = list(dict.fromkeys(column for column in columns if column))
    if not columns:
        raise ValueError("数据资源尚未维护字段，无法预览物理表")

    stat_base = _json_object(resource.get("stat_base"))
    configured_map = _json_object(stat_base.get("field_map") or stat_base.get("fieldMap"))
    column_map = {
        str(code).strip().upper(): str(column).strip()
        for code, column in configured_map.items()
        if str(code).strip() and str(column).strip()
    }
    physical_columns = [column_map.get(column.upper(), column) for column in columns]
    quoted_columns = [_quote_identifier(column, dialect) for column in physical_columns]
    configured_time_field = str(
        stat_base.get("business_time_field")
        or stat_base.get("businessTimeField")
        or stat_base.get("fresh_field_name")
        or stat_base.get("freshFieldName")
        or ""
    ).strip()
    column_lookup = {column.upper(): column for column in columns}
    order_field = column_lookup.get(configured_time_field.upper(), "") if configured_time_field else ""
    if not order_field:
        order_field = next(
            (column for column in columns if any(marker in column.upper() for marker in ("TIME", "DATE", "TIMESTAMP"))),
            "",
        )
    order_column = column_map.get(order_field.upper(), order_field) if order_field else ""

    safe_limit = min(max(int(limit), 1), 10)
    order_clause = f" ORDER BY {_quote_identifier(order_column, dialect)} DESC" if order_column else ""
    statement = f"SELECT {', '.join(quoted_columns)} FROM {quoted_table}{order_clause} LIMIT %(preview_limit)s"
    context = RuntimeContext(
        request_id=f"resource-preview-{uuid4()}",
        api={"resource_id": resource_id, "data_source_id": int(source_id)},
        subject={},
        policy={},
        risk_score=0,
        client_ip="management",
        query_days=0,
        requested_rows=safe_limit,
    )
    with measurement_connection(context) as current, current.cursor() as cursor:
        cursor.execute(statement, {"preview_limit": safe_limit})
        candidate_rows = [
            {code: row.get(physical) for code, physical in zip(columns, physical_columns)}
            for row in cursor.fetchall()
        ]

    ingest_config = resolve_resource_ingest_validation(resource, source)
    sampled_rows = sample_ingest_rows(candidate_rows, ingest_config)
    validation = validate_ingest_rows(sampled_rows, columns, ingest_config)
    record_resource_ingest_validation(
        context,
        int(source_id),
        resource_id,
        ingest_config,
        validation,
        len(candidate_rows),
        round((time.perf_counter() - started_timer) * 1000),
        execution_type="validation_preview",
    )
    return {
        "resourceId": resource_id,
        "tableName": table_name,
        "orderField": order_field,
        "limit": safe_limit,
        "candidateCount": len(candidate_rows),
        **ingest_config,
        **validation,
        "columns": [
            {
                "code": str(field.get("field_code") or ""),
                "name": str(field.get("field_name") or field.get("field_code") or ""),
                "dataType": str(field.get("data_type") or ""),
            }
            for field in fields
            if str(field.get("field_code") or "").strip() in columns
        ],
        "rows": [
            {str(key): _json_value(value) for key, value in row.items()}
            for row in sampled_rows
        ],
    }


def load_api(path: str, method: str) -> dict[str, Any] | None:
    gateway_path = path[:-10] if path.endswith("/subscribe") else path
    return fetch_one(
        """
        SELECT * FROM security_api_resources
        WHERE gateway_path = %(path)s AND upper(http_method) = %(method)s
          AND api_status = 'enabled' AND publish_status = 'success'
        LIMIT 1
        """,
        {"path": gateway_path, "method": method.upper()},
    )


def load_subject(access_key: str) -> dict[str, Any] | None:
    return fetch_one(
        "SELECT * FROM security_access_subjects WHERE subject_code = %(code)s LIMIT 1",
        {"code": access_key},
    )


def load_subject_by_api_key(api_key: str) -> dict[str, Any] | None:
    if len(api_key) < 32:
        return None
    # 先识别凭据归属，再由 authorize 判断主体状态。若只扫描启用主体，
    # 合法密钥在主体停用后会被误报为 API_KEY_INVALID。
    for subject in fetch_all("SELECT * FROM security_access_subjects"):
        expected = settings.subject_secrets.get(str(subject.get("credential_ref") or ""), "")
        if api_key_matches(expected, api_key):
            return subject
    return None


def load_policy(subject_id: int, api_id: int, scenario: str) -> dict[str, Any] | None:
    candidates = fetch_all(
        """
        SELECT policy.*
        FROM eco_resource_security_policies policy
        JOIN security_api_resources current_api ON current_api.id = %(api_id)s
        WHERE policy.policy_kind = 'access_policy'
          AND policy.policy_status = 'enabled'
          AND policy.publish_status = 'success'
          AND policy.subject_id = %(subject_id)s
          AND policy.scenario = %(scenario)s
          AND policy.resource_id = current_api.resource_id
          AND policy.api_resource_id = current_api.id
        ORDER BY policy.policy_version DESC, policy.id DESC
        """,
        {"subject_id": subject_id, "api_id": api_id, "scenario": scenario},
    )
    candidates = [candidate for candidate in candidates if str(candidate.get("api_resource_id") or "") == str(api_id)]
    if not candidates:
        return None
    selected_candidate = candidates[0]
    selected = dict(selected_candidate)
    selected["_policyEvaluations"] = [
        {
            "policyId": candidate.get("id"),
            "policyCode": str(candidate.get("policy_code") or ""),
            "policyVersion": candidate.get("policy_version"),
            "result": "passed" if candidate is selected_candidate else "not_selected",
            "reason": "资源、数据应用和 API 精确匹配" if candidate is selected_candidate else "未被选择的同版本策略",
        }
        for candidate in candidates
    ]
    return selected


def client_ip(request) -> str:
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if forwarded:
            return forwarded[:64]
    return (request.client.host if request.client else "gateway")[:64]


def authorize(request, body: bytes) -> RuntimeContext:
    request_id = str(uuid4())
    api = load_api(request.url.path, request.method)
    address = client_ip(request)
    if not api:
        raise RuntimeDenied("ROUTE_NOT_FOUND", request_id=request_id, client_ip=address)

    api_key = request.headers.get("x-api-key", "").strip()
    access_key = request.headers.get("x-access-key", "").strip()
    timestamp = request.headers.get("x-timestamp", "").strip()
    nonce = request.headers.get("x-nonce", "").strip()
    supplied_signature = request.headers.get("x-signature", "").strip()
    scenario = request.headers.get("x-scenario", "").strip()
    if not scenario or (not api_key and not all([access_key, timestamp, nonce, supplied_signature])):
        raise RuntimeDenied("AUTH_MISSING", request_id=request_id, api=api, client_ip=address)

    subject = load_subject_by_api_key(api_key) if api_key else load_subject(access_key)
    if api_key and not subject:
        raise RuntimeDenied("API_KEY_INVALID", request_id=request_id, api=api, client_ip=address)
    if not subject or subject.get("subject_status") != "enabled":
        raise RuntimeDenied(
            "SUBJECT_DISABLED",
            request_id=request_id,
            api=api,
            subject=subject,
            client_ip=address,
        )
    now = datetime.now(timezone.utc)
    valid_from = subject.get("valid_from")
    valid_to = subject.get("valid_to")
    if (valid_from and now < valid_from) or (valid_to and now > valid_to):
        raise RuntimeDenied(
            "POLICY_EXPIRED",
            request_id=request_id,
            api=api,
            subject=subject,
            client_ip=address,
        )

    if not api_key:
        try:
            timestamp_ms = int(timestamp)
        except ValueError as error:
            raise RuntimeDenied(
                "REQUEST_EXPIRED", request_id=request_id, api=api, subject=subject, client_ip=address
            ) from error
        if len(timestamp) != 13 or abs(time.time() * 1000 - timestamp_ms) > settings.request_clock_skew_seconds * 1000:
            raise RuntimeDenied(
                "REQUEST_EXPIRED", request_id=request_id, api=api, subject=subject, client_ip=address
            )
        if not NONCE_PATTERN.fullmatch(nonce):
            raise RuntimeDenied(
                "VALIDATION_ERROR", request_id=request_id, api=api, subject=subject, client_ip=address
            )

        secret_ref = str(subject.get("credential_ref") or "")
        secret = settings.subject_secrets.get(secret_ref, "")
        canonical = canonical_request(
            request.method,
            request.url.path,
            request.query_params.multi_items(),
            body,
            timestamp,
            nonce,
        )
        if len(secret) < 32 or not signature_matches(secret, canonical, supplied_signature):
            raise RuntimeDenied(
                "SIGNATURE_INVALID", request_id=request_id, api=api, subject=subject, client_ip=address
            )
        if not request_memory.remember_nonce(
            f"{subject['subject_code']}:{nonce}", settings.nonce_ttl_seconds
        ):
            raise RuntimeDenied(
                "REPLAY_DETECTED", request_id=request_id, api=api, subject=subject, client_ip=address
            )

    if settings.enforce_source_ip and not ip_allowed(address, _json_list(subject.get("ip_whitelist_json"))):
        raise RuntimeDenied(
            "IP_NOT_ALLOWED", request_id=request_id, api=api, subject=subject, client_ip=address
        )

    allowed_api_codes = {str(item).strip().upper() for item in _json_list(subject.get("allowed_api_codes_json"))}
    if "*" not in allowed_api_codes and str(api.get("api_code") or "").strip().upper() not in allowed_api_codes:
        raise RuntimeDenied(
            "API_NOT_AUTHORIZED", request_id=request_id, api=api, subject=subject, client_ip=address
        )

    policy = load_policy(int(subject["id"]), int(api["id"]), scenario)
    if not policy:
        raise RuntimeDenied(
            "POLICY_NOT_FOUND", request_id=request_id, api=api, subject=subject, client_ip=address
        )
    snapshot = runtime_security_snapshot(policy, api)
    matched_labels = tuple(_normalized_tags(snapshot.get("matchedLabels")))
    label_snapshot_version = str(snapshot.get("version") or "")
    hard_constraints = _json_object(snapshot.get("hardConstraints"))
    security_actions = security_actions_for(policy, snapshot)
    risk_factors: list[dict[str, Any]] = []
    query_days = 0.0
    requested_rows = 0

    def add_risk_factor(code: str, label: str, score: int, detail: str) -> None:
        if score <= 0:
            return
        risk_factors.append({"code": code, "label": label, "score": score, "detail": detail})

    def policy_denied(code: str, risk_score: int | None = None) -> RuntimeDenied:
        return RuntimeDenied(
            code,
            request_id=request_id,
            api=api,
            subject=subject,
            policy=policy,
            client_ip=address,
            query_days=query_days,
            requested_rows=requested_rows,
            risk_score=risk_score,
            matched_labels=matched_labels,
            risk_factors=risk_factors,
            label_snapshot_version=label_snapshot_version,
            security_actions=security_actions,
            security_snapshot=snapshot,
        )

    if hard_constraints.get("aggregateOnly") and str(policy.get("output_mode") or "detail") != "aggregate":
        add_risk_factor("aggregateOnly", "仅允许聚合", 90, "资源标签要求仅输出聚合结果")
        raise policy_denied("TAG_CONSTRAINT_VIOLATION", 90)
    if hard_constraints.get("encryptedOnly") and str(policy.get("output_mode") or "detail") != "encrypted":
        add_risk_factor("encryptedOnly", "仅允许密态", 95, "资源标签要求仅输出密态结果")
        raise policy_denied("TAG_CONSTRAINT_VIOLATION", 95)
    if str(policy.get("output_mode") or "detail") == "encrypted" and not api.get("supports_homomorphic"):
        add_risk_factor("homomorphicCapability", "密态执行器不可用", 95, "策略要求密态计算，但数据 API 未声明同态计算能力")
        raise policy_denied("TAG_CONSTRAINT_VIOLATION", 95)
    if settings.enforce_source_ip and not ip_allowed(address, _json_list(policy.get("source_ips_json"))):
        raise RuntimeDenied(
            "IP_NOT_ALLOWED",
            request_id=request_id,
            api=api,
            subject=subject,
            policy=policy,
            client_ip=address,
        )

    api_default_params = _json_object(_json_object(api.get("runtime_config_json")).get("defaultParams"))

    def effective_param(name: str):
        requested = request.query_params.get(name)
        return requested if requested not in {None, ""} else api_default_params.get(name)

    start_at = _parse_time(str(effective_param("startAt") or ""))
    end_at = _parse_time(str(effective_param("endAt") or ""))
    if start_at and end_at and end_at > start_at:
        query_days = (end_at - start_at).total_seconds() / 86400
    else:
        query_days = 0
    requested_rows = max(
        [
            int(effective_param(name) or 0)
            for name in ("pageSize", "limit", "maxRows")
            if str(effective_param(name) or "0").isdigit()
        ]
        or [0]
    )
    extra_risk = 0
    should_deny, risk_points = violation_risk(
        policy, "queryRangeExceeded", query_days > int(policy.get("max_query_days") or 1)
    )
    extra_risk += risk_points
    if risk_points:
        add_risk_factor("queryRangeExceeded", "查询时间范围", risk_points, f"请求 {query_days:g} 天，策略上限 {int(policy.get('max_query_days') or 1)} 天")
    if should_deny:
        raise policy_denied("QUERY_RANGE_EXCEEDED", risk_points)

    policy_regions = [str(item).strip() for item in _json_list(policy.get("region_scope_json")) if str(item).strip()]
    region = str(request.query_params.get("regionCode") or "").strip()
    runtime_config = _json_object(api.get("runtime_config_json"))
    region_field_code = str(runtime_config.get("regionFieldCode") or runtime_config.get("region_field_code") or "").strip()
    processing_path = str(api.get("orchestrator_path") or "")
    if policy_regions and not region:
        add_risk_factor("regionRequired", "缺少区域参数", 80, "策略配置了区域范围，请求必须显式传入 regionCode")
        raise policy_denied("REGION_REQUIRED", 80)
    if policy_regions and processing_path == "/internal/resource-query" and not region_field_code:
        add_risk_factor("regionFilter", "区域过滤不可用", 90, "策略配置了区域范围，但 API 未映射区域字段")
        raise policy_denied("REGION_FILTER_UNAVAILABLE", 90)
    scope_violation = bool(policy_regions and region not in policy_regions)
    should_deny, risk_points = violation_risk(policy, "scopeViolation", scope_violation)
    extra_risk += risk_points
    if risk_points:
        add_risk_factor("scopeViolation", "区域范围越界", risk_points, "请求的区域不在策略授权范围内")
    if should_deny:
        raise policy_denied("SCOPE_VIOLATION", risk_points)
    fields = effective_param("fields")
    requested_codes: list[str] = []
    runtime_field_map = _json_object(runtime_config.get("fieldMap") or runtime_config.get("field_map"))
    requested_fields = [item.strip() for item in str(fields or "").split(",") if item.strip()]
    if not requested_fields and runtime_field_map:
        requested_fields = [str(item).strip() for item in _json_list(runtime_config.get("defaultFields") or runtime_config.get("default_fields")) if str(item).strip()]
    if requested_fields:
        if runtime_field_map:
            known_codes = {str(code).upper() for code in runtime_field_map}
            requested_codes = [item.upper() for item in requested_fields]
        else:
            known_codes = set(FIELD_CODES)
            requested_codes = [FIELD_CODES.get(item.lower(), "") for item in requested_fields]
        if any(not code or code not in known_codes for code in requested_codes):
            raise RuntimeDenied(
                "FIELD_NOT_ALLOWED", request_id=request_id, api=api, subject=subject, policy=policy,
                client_ip=address, query_days=query_days, requested_rows=requested_rows,
            )
        masked_fields = {str(code).upper() for code in _json_list(hard_constraints.get("maskedFields"))}
        if str(policy.get("output_mode") or "detail") == "detail" and masked_fields.intersection(requested_codes):
            add_risk_factor("maskedFieldDetail", "脱敏字段明文请求", 90, "请求包含必须脱敏的字段")
            raise policy_denied("TAG_CONSTRAINT_VIOLATION", 90)

    rate_key = f"{subject['subject_code']}:{api['api_code']}:{datetime.now().strftime('%Y%m%d%H%M')}"
    frequency = request_memory.increment_rate(rate_key)
    should_deny, risk_points = violation_risk(
        policy, "highFrequency", frequency > int(policy.get("max_requests_per_minute") or 60)
    )
    extra_risk += risk_points
    if risk_points:
        add_risk_factor("highFrequency", "高频调用", risk_points, f"当前分钟已调用 {frequency} 次")
    if should_deny:
        raise policy_denied("RATE_LIMITED", risk_points)
    allowed_time_ranges = _json_list(policy.get("allowed_time_ranges_json"))
    should_deny, risk_points = violation_risk(
        policy,
        "offHours",
        bool(allowed_time_ranges) and not in_time_ranges(datetime.now().astimezone(), allowed_time_ranges),
    )
    extra_risk += risk_points
    if risk_points:
        add_risk_factor("offHours", "非允许时段", risk_points, "当前时间不在策略允许时段内")
    if should_deny:
        raise policy_denied("OFF_HOURS", risk_points)
    should_deny, risk_points = violation_risk(
        policy, "rowLimitExceeded", requested_rows > int(policy.get("max_rows") or 1000)
    )
    extra_risk += risk_points
    if risk_points:
        add_risk_factor("rowLimitExceeded", "返回行数超限", risk_points, f"请求 {requested_rows} 行，策略上限 {int(policy.get('max_rows') or 1000)} 行")
    if should_deny:
        raise policy_denied("ROW_LIMIT_EXCEEDED", risk_points)
    if snapshot and str(subject.get("subject_type") or "") == "external_party":
        extra_risk += 10
        add_risk_factor("externalSubject", "外部访问主体", 10, "外部访问方请求受控数据")
    identifier_fields = {str(code).upper() for code in _json_list(snapshot.get("identifierFields"))}
    if fields and identifier_fields.intersection(requested_codes):
        extra_risk += 15
        add_risk_factor("identifierField", "直接标识符", 15, "请求包含可直接识别对象的字段")
    score = min(100, extra_risk)
    return RuntimeContext(
        request_id=request_id,
        api=api,
        subject=subject,
        policy=policy,
        risk_score=score,
        client_ip=address,
        query_days=query_days,
        requested_rows=requested_rows,
        matched_labels=matched_labels,
        risk_factors=tuple(risk_factors),
        label_snapshot_version=label_snapshot_version,
        security_actions=security_actions,
        security_snapshot=snapshot,
    )


def _validate_range(params, context: RuntimeContext | None = None) -> tuple[str, datetime, datetime]:
    region = str(params.get("regionCode") or "")
    start_at = _parse_time(params.get("startAt"))
    end_at = _parse_time(params.get("endAt"))
    if not region or not start_at or not end_at or end_at <= start_at:
        raise ValueError("VALIDATION_ERROR")
    if context:
        regions = _json_list(context.policy.get("region_scope_json"))
        if regions and region not in regions:
            raise PermissionError("POLICY_NOT_FOUND")
    return region, start_at, end_at


def _archive_code(config: dict[str, Any], *names: str) -> str:
    """从量测档案中读取字段代码，兼容 3.0 与 3.1 两套命名。"""
    for name in names:
        value = str(config.get(name) or "").strip()
        if value:
            return value.upper()
    return ""


def _measurement_archive(context: RuntimeContext | None) -> dict[str, Any] | None:
    """读取 API 的量测档案（runtime_config_json），未配置时返回 None 表示走既有兼容路径。

    量测档案示例：
    {
      "table": "measurement_demo.grid_low_freq_voltage",
      "fieldMap": {"DATA_TIME": "data_time", "REGION_CODE": "region_code", ...},
      "timeFieldCode": "DATA_TIME",
      "regionFieldCode": "REGION_CODE",
      "organizationFieldCode": "ORGANIZATION_CODE",
      "pointFieldCode": "POINT_CODE",
      "valueFieldCode": "VOLTAGE",
      "defaultFields": ["DATA_TIME", "POINT_CODE", "VOLTAGE"],
      "maskFields": ["POINT_CODE"],
      "scales": {"VOLTAGE": 0.001}
    }
    """
    config = _json_object(context.api.get("runtime_config_json") if context else {})
    table = str(config.get("table") or "").strip()
    field_map = {
        str(code).strip().upper(): str(column).strip()
        for code, column in _json_object(config.get("fieldMap") or config.get("field_map")).items()
        if str(code).strip() and str(column).strip()
    }
    if not table or not field_map:
        return None
    scales: dict[str, float] = {}
    for code, value in _json_object(
        config.get("scales") or config.get("scaleColumns") or config.get("scale_columns")
    ).items():
        if not str(code).strip():
            continue
        try:
            scale_value = float(value)
        except (TypeError, ValueError):
            continue
        if scale_value != 1:
            scales[str(code).strip().upper()] = scale_value
    return {
        "table": table,
        "fieldMap": field_map,
        "timeFieldCode": _archive_code(config, "timeFieldCode", "time_field_code", "timeColumn", "time_column"),
        "regionFieldCode": _archive_code(config, "regionFieldCode", "region_field_code", "regionColumn", "region_column"),
        "organizationFieldCode": _archive_code(config, "organizationFieldCode", "organization_field_code", "organizationColumn", "organization_column"),
        "pointFieldCode": _archive_code(config, "pointFieldCode", "point_field_code", "pointColumn", "point_column"),
        "valueFieldCode": _archive_code(config, "valueFieldCode", "value_field_code", "valueColumn", "value_column"),
        "defaultFields": [
            str(item).strip().upper()
            for item in _json_list(config.get("defaultFields") or config.get("default_fields"))
            if str(item).strip()
        ],
        "maskFields": [
            str(item).strip().upper()
            for item in _json_list(config.get("maskFields") or config.get("mask_fields"))
            if str(item).strip()
        ],
        "scales": scales,
    }


def _archive_dialect(context: RuntimeContext) -> str:
    source = fetch_one(
        "SELECT * FROM security_data_sources WHERE id=%(id)s LIMIT 1",
        {"id": context.api.get("data_source_id")},
    ) or {}
    return str(_json_object(source.get("connection_options_json")).get("dialect") or "postgresql").lower()


def _validation_denied(context: RuntimeContext) -> RuntimeDenied:
    return RuntimeDenied(
        "VALIDATION_ERROR",
        request_id=context.request_id,
        api=context.api,
        subject=context.subject,
        policy=context.policy,
        client_ip=context.client_ip,
        query_days=context.query_days,
        requested_rows=context.requested_rows,
    )


@contextmanager
def measurement_connection(context: RuntimeContext | None = None):
    if context is None:
        with connection() as current:
            yield current
        return

    source_id = context.api.get("data_source_id")
    source = fetch_one(
        "SELECT * FROM security_data_sources WHERE id=%(id)s LIMIT 1",
        {"id": source_id},
    ) if source_id else None
    secret_ref = str(source.get("secret_ref") or "") if source else ""
    secret = settings.source_secrets.get(secret_ref, "")
    if not source or source.get("connection_status") != "connected" or not secret:
        raise RuntimeDenied(
            "UPSTREAM_UNAVAILABLE", request_id=context.request_id, api=context.api,
            subject=context.subject, policy=context.policy, client_ip=context.client_ip,
            query_days=context.query_days, requested_rows=context.requested_rows,
        )
    source_type = str(source.get("source_type") or "").strip()
    if source_type in {"file_e", "message_queue"}:
        # E 文件 / 消息通道不提供物理表直查，命中时按上游不可用处理。
        raise RuntimeDenied(
            "UPSTREAM_UNAVAILABLE", request_id=context.request_id, api=context.api,
            subject=context.subject, policy=context.policy, client_ip=context.client_ip,
            query_days=context.query_days, requested_rows=context.requested_rows,
        )
    options = _json_object(source.get("connection_options_json"))
    dialect = str(options.get("dialect") or "postgresql").lower()
    security_config = _json_object(source.get("security_config_json"))
    encrypted = bool(security_config.get("encryptionEnabled") or security_config.get("encryption_enabled"))
    if dialect not in {"postgresql", "mysql"}:
        raise RuntimeDenied(
            "UPSTREAM_UNAVAILABLE", request_id=context.request_id, api=context.api,
            subject=context.subject, policy=context.policy, client_ip=context.client_ip,
            query_days=context.query_days, requested_rows=context.requested_rows,
        )
    try:
        if dialect == "mysql":
            current = pymysql.connect(
                host=str(source.get("host") or ""),
                port=int(source.get("port") or 3306),
                database=str(source.get("database_name") or ""),
                user=str(source.get("username") or ""),
                password=secret,
                connect_timeout=settings.connection_timeout_seconds,
                read_timeout=settings.connection_timeout_seconds,
                write_timeout=settings.connection_timeout_seconds,
                charset="utf8mb4",
                autocommit=True,
                cursorclass=pymysql.cursors.DictCursor,
                **({"ssl": {"check_hostname": False}} if encrypted else {}),
            )
            try:
                yield current
            finally:
                current.close()
            return
        with connection(parameters={
            "host": source.get("host"),
            "port": int(source.get("port") or 5432),
            "dbname": source.get("database_name"),
            "user": source.get("username"),
            "password": secret,
            "sslmode": "require" if encrypted else "prefer",
        }) as current:
            yield current
    except (psycopg.Error, pymysql.MySQLError, OSError) as error:
        raise RuntimeDenied(
            "UPSTREAM_UNAVAILABLE", request_id=context.request_id, api=context.api,
            subject=context.subject, policy=context.policy, client_ip=context.client_ip,
            query_days=context.query_days, requested_rows=context.requested_rows,
        ) from error


def _ingest_validation_actionable(config: dict[str, Any]) -> bool:
    rules = _json_object(config.get("validationRule"))
    return bool(
        _json_list(rules.get("requiredFields"))
        or _json_object(rules.get("numericRanges"))
        or _json_list(rules.get("duplicateKeys"))
        or config.get("integrityEnabled") is True
    )


def _ingest_field_codes(
    config: dict[str, Any],
    field_map: dict[str, str],
) -> list[str]:
    rules = _json_object(config.get("validationRule"))
    configured_fields = [
        *_json_list(rules.get("requiredFields")),
        *_json_object(rules.get("numericRanges")).keys(),
        *_json_list(rules.get("duplicateKeys")),
    ]
    if config.get("integrityExecutable") is True:
        configured_fields.append(config.get("digestField"))
        checksum_fields = _json_list(config.get("checksumFields"))
        configured_fields.extend(checksum_fields or list(field_map))

    column_lookup = {column.upper(): code for code, column in field_map.items()}
    result: list[str] = []
    for field in configured_fields:
        normalized = str(field or "").strip().upper()
        code = normalized if normalized in field_map else column_lookup.get(normalized, "")
        if code and code not in result:
            result.append(code)
    return result


def record_resource_ingest_validation(
    context: RuntimeContext,
    source_id: int | None,
    resource_id: int,
    config: dict[str, Any],
    validation: dict[str, Any],
    candidate_count: int,
    duration_ms: int,
    execution_type: str = "resource_delivery_validation",
) -> None:
    if not config.get("samplingEnabled") or not _ingest_validation_actionable(config):
        return
    rejected_count = int(validation.get("rejectedCount") or 0)
    warning_count = int(validation.get("warningCount") or 0)
    configuration_warning = bool(
        config.get("integrityEnabled") and not config.get("integrityExecutable")
    )
    result_status = "failed" if rejected_count else "warning" if warning_count or configuration_warning else "success"
    now = datetime.now(timezone.utc)
    detail = {
        "requestId": context.request_id,
        "resourceId": resource_id,
        "candidateCount": candidate_count,
        "checkedCount": int(validation.get("sampleCount") or 0),
        "configSource": config.get("configSource"),
        "inheritSourceRules": config.get("inheritSourceRules"),
        "integrity": {
            "enabled": config.get("integrityEnabled") is True,
            "executable": config.get("integrityExecutable") is True,
            "algorithm": config.get("checksumAlgorithm") or "",
            "checkedCount": int(validation.get("integrityCheckedCount") or 0),
            "passedCount": int(validation.get("integrityPassedCount") or 0),
            "failedCount": int(validation.get("integrityFailedCount") or 0),
        },
        "warningCount": warning_count,
    }
    execute(
        """
        INSERT INTO security_ingest_logs
          (batch_code, execution_type, rule_version, started_at, finished_at,
           input_count, passed_count, rejected_count, duration_ms, result_status,
           error_summary, result_detail_json, data_source_id, api_resource_id,
           "createdAt", "updatedAt")
        VALUES
          (%(batch_code)s, %(execution_type)s, 1, %(started_at)s, %(finished_at)s,
           %(input_count)s, %(passed_count)s, %(rejected_count)s, %(duration_ms)s, %(result_status)s,
           %(error_summary)s, %(result_detail)s::jsonb, %(source_id)s, %(api_id)s,
           %(finished_at)s, %(finished_at)s)
        """,
        {
            "batch_code": f"INGEST-{now.strftime('%Y%m%d%H%M%S')}-{context.api.get('id') or resource_id}-{uuid4().hex[:8]}",
            "execution_type": execution_type,
            "started_at": datetime.fromtimestamp(
                max(0, now.timestamp() - duration_ms / 1000),
                tz=timezone.utc,
            ),
            "finished_at": now,
            "input_count": int(validation.get("sampleCount") or 0),
            "passed_count": int(validation.get("passedCount") or 0),
            "rejected_count": rejected_count,
            "duration_ms": duration_ms,
            "result_status": result_status,
            "error_summary": "源端数据未通过接入完整性校验" if rejected_count else None,
            "result_detail": json.dumps(detail, ensure_ascii=False),
            "source_id": source_id,
            "api_id": context.api.get("id"),
        },
    )


def resource_query(params, context: RuntimeContext) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    started_timer = time.perf_counter()
    config = _json_object(context.api.get("runtime_config_json"))
    field_map = {
        str(code).strip().upper(): str(column).strip()
        for code, column in _json_object(config.get("fieldMap") or config.get("field_map")).items()
        if str(code).strip() and str(column).strip()
    }
    table_name = str(config.get("table") or "").strip()
    if not table_name or not field_map:
        raise RuntimeDenied(
            "ROUTE_NOT_FOUND", request_id=context.request_id, api=context.api,
            subject=context.subject, policy=context.policy, client_ip=context.client_ip,
            query_days=context.query_days, requested_rows=context.requested_rows,
        )

    resource = fetch_one(
        "SELECT * FROM eco_data_resources WHERE id=%(id)s LIMIT 1",
        {"id": context.api.get("resource_id")},
    )
    if not resource:
        raise RuntimeDenied(
            "ROUTE_NOT_FOUND", request_id=context.request_id, api=context.api,
            subject=context.subject, policy=context.policy, client_ip=context.client_ip,
            query_days=context.query_days, requested_rows=context.requested_rows,
        )
    source = fetch_one(
        "SELECT * FROM security_data_sources WHERE id=%(id)s LIMIT 1",
        {"id": context.api.get("data_source_id")},
    ) or {}
    options = _json_object(source.get("connection_options_json"))
    dialect = str(options.get("dialect") or "postgresql").lower()
    quoted_table = _quote_identifier(table_name, dialect)
    for column in field_map.values():
        _quote_identifier(column, dialect)

    resource_fields = fetch_all(
        """
        SELECT field_code
        FROM eco_resource_security_fields
        WHERE resource_id=%(resource_id)s
        ORDER BY seq ASC NULLS LAST, id ASC
        """,
        {"resource_id": resource.get("id")},
    )
    validation_field_map = {
        str(item.get("field_code") or "").strip().upper(): str(item.get("field_code") or "").strip()
        for item in resource_fields
        if str(item.get("field_code") or "").strip()
    }
    validation_field_map.update(field_map)
    ingest_config = resolve_resource_ingest_validation(resource, source)

    requested = [item.strip().upper() for item in str(params.get("fields") or "").split(",") if item.strip()]
    default_fields = [str(item).upper() for item in _json_list(config.get("defaultFields") or config.get("default_fields"))]
    selected_codes = list(dict.fromkeys(requested or default_fields or list(field_map)))
    if not selected_codes or any(code not in field_map for code in selected_codes):
        raise PermissionError("FIELD_NOT_ALLOWED")

    validation_codes = _ingest_field_codes(ingest_config, validation_field_map)
    query_codes = list(dict.fromkeys([*selected_codes, *validation_codes]))
    select_columns = ", ".join(
        f"{_quote_identifier(validation_field_map[code], dialect)} AS {_quote_identifier(_camel_case(code.lower()), dialect)}"
        for code in query_codes
    )
    query_sql, query_parameters = validate_custom_query_sql(config.get("querySql") or config.get("query_sql"))
    conditions: list[str] = []
    parameters: dict[str, Any] = {}
    time_code = str(config.get("timeFieldCode") or config.get("time_field_code") or "").upper()
    region_code = str(config.get("regionFieldCode") or config.get("region_field_code") or "").upper()
    start_at = _parse_time(str(params.get("startAt") or ""))
    end_at = _parse_time(str(params.get("endAt") or ""))
    if time_code:
        if time_code not in field_map:
            raise ValueError("VALIDATION_ERROR")
        if start_at or end_at:
            if not start_at or not end_at or end_at <= start_at:
                raise ValueError("VALIDATION_ERROR")
            time_column = _quote_identifier(field_map[time_code], dialect)
            conditions.extend([f"{time_column} >= %(start_at)s", f"{time_column} < %(end_at)s"])
            parameters.update({"start_at": start_at, "end_at": end_at})
    region = str(params.get("regionCode") or "").strip()
    policy_regions = _json_list(context.policy.get("region_scope_json"))
    if policy_regions and not region:
        raise RuntimeDenied("REGION_REQUIRED", request_id=context.request_id, api=context.api, subject=context.subject, policy=context.policy, client_ip=context.client_ip)
    if policy_regions and not region_code:
        raise RuntimeDenied("REGION_FILTER_UNAVAILABLE", request_id=context.request_id, api=context.api, subject=context.subject, policy=context.policy, client_ip=context.client_ip)
    if region and region_code:
        if region_code not in field_map:
            raise ValueError("VALIDATION_ERROR")
        conditions.append(f"{_quote_identifier(field_map[region_code], dialect)} = %(region)s")
        parameters["region"] = region

    page = max(1, int(params.get("page") or 1))
    page_size = min(max(1, int(params.get("pageSize") or 100)), int(context.policy.get("max_rows") or 1000), 1000)
    if query_sql:
        default_params = _json_object(config.get("defaultParams") or config.get("default_params"))
        parameters = {
            name: params.get(name) if params.get(name) not in {None, ""} else default_params.get(name)
            for name in query_parameters
        }
        missing_params = [name for name, value in parameters.items() if value is None]
        if missing_params:
            raise ValueError(f"API 缺少查询参数：{', '.join(missing_params)}")
        parameters.update({"__api_limit": page_size, "__api_offset": (page - 1) * page_size})
        statement = (
            f"SELECT * FROM ({parameterize_custom_query_sql(query_sql)}) AS api_query "
            "LIMIT %(__api_limit)s OFFSET %(__api_offset)s"
        )
    else:
        parameters.update({"limit": page_size, "offset": (page - 1) * page_size})
        where_clause = f" WHERE {' AND '.join(conditions)}" if conditions else ""
        order_clause = f" ORDER BY {_quote_identifier(field_map[time_code], dialect)}" if time_code else ""
        statement = f"SELECT {select_columns} FROM {quoted_table}{where_clause}{order_clause} LIMIT %(limit)s OFFSET %(offset)s"

    with measurement_connection(context) as current, current.cursor() as cursor:
        cursor.execute(statement, parameters)
        raw_rows = cursor.fetchall()

    internal_rows: list[dict[str, Any]] = []
    rows: list[dict[str, Any]] = []
    for raw in raw_rows:
        source_row = dict(raw)
        source_lookup = {str(key).lower(): value for key, value in source_row.items()}
        internal_row: dict[str, Any] = {}
        for code, column in validation_field_map.items():
            aliases = (
                str(column).lower(),
                _camel_case(code.lower()).lower(),
                code.lower(),
            )
            matched_alias = next((alias for alias in aliases if alias in source_lookup), "")
            if not matched_alias:
                continue
            value = source_lookup[matched_alias]
            internal_row[code] = value
            internal_row[str(column)] = value
        internal_rows.append(internal_row)
        rows.append({
            _camel_case(code.lower()): _json_value(internal_row.get(code))
            for code in selected_codes
        })

    sampled_rows = (
        sample_ingest_rows(internal_rows, ingest_config)
        if _ingest_validation_actionable(ingest_config)
        else []
    )
    validation = validate_ingest_rows(
        sampled_rows,
        list(validation_field_map),
        ingest_config,
    )
    duration_ms = round((time.perf_counter() - started_timer) * 1000)
    record_resource_ingest_validation(
        context,
        int(source.get("id") or context.api.get("data_source_id"))
        if source.get("id") or context.api.get("data_source_id") else None,
        int(resource.get("id")),
        ingest_config,
        validation,
        len(internal_rows),
        duration_ms,
    )
    if int(validation.get("rejectedCount") or 0) > 0:
        raise RuntimeDenied(
            "INGEST_VALIDATION_FAILED", request_id=context.request_id, api=context.api,
            subject=context.subject, policy=context.policy, client_ip=context.client_ip,
            query_days=context.query_days, requested_rows=context.requested_rows,
            matched_labels=context.matched_labels, risk_factors=context.risk_factors,
            label_snapshot_version=context.label_snapshot_version,
        )

    mask_codes = {str(item).upper() for item in _json_list(config.get("maskFields") or config.get("mask_fields"))}
    if context.output_mode == "masked":
        for row in rows:
            for code in mask_codes:
                key = _camel_case(code.lower())
                if row.get(key) not in {None, ""}:
                    value = str(row[key])
                    row[key] = f"{value[:3]}***{value[-2:]}" if len(value) > 5 else "***"

    ingest_meta = {
        "executed": bool(
            ingest_config.get("samplingEnabled")
            and _ingest_validation_actionable(ingest_config)
        ),
        "configSource": ingest_config.get("configSource"),
        "candidateCount": len(internal_rows),
        "checkedCount": int(validation.get("sampleCount") or 0),
        "passedCount": int(validation.get("passedCount") or 0),
        "rejectedCount": int(validation.get("rejectedCount") or 0),
        "warningCount": int(validation.get("warningCount") or 0),
        "integrityEnabled": ingest_config.get("integrityEnabled") is True,
        "integrityExecutable": ingest_config.get("integrityExecutable") is True,
        "integrityCheckedCount": int(validation.get("integrityCheckedCount") or 0),
    }
    return rows, {
        "page": page,
        "pageSize": page_size,
        "returnedRows": len(rows),
        "ingestValidation": ingest_meta,
    }
def aggregate_measurements(params, context: RuntimeContext | None = None) -> list[dict[str, Any]]:
    archive = _measurement_archive(context)
    if archive is not None:
        return _archive_aggregate_measurements(params, context, archive)
    if context is not None and str(params.get("metric", "active_power")) != "active_power":
        raise _validation_denied(context)
    return _legacy_aggregate_measurements(params, context)


def _legacy_aggregate_measurements(params, context: RuntimeContext | None = None) -> list[dict[str, Any]]:
    region, start_at, end_at = _validate_range(params, context)
    with measurement_connection(context) as current, current.cursor() as cursor:
        cursor.execute(
            """
            SELECT region_code, date_trunc('hour', measurement_time) AS hour,
                   sum(active_power) AS power_sum, avg(active_power) AS power_average,
                   count(*) AS sample_count
            FROM measurement_demo.active_power_measurements
            WHERE region_code = %(region)s
              AND measurement_time >= %(start_at)s AND measurement_time < %(end_at)s
            GROUP BY region_code, date_trunc('hour', measurement_time)
            ORDER BY hour
            """,
            {"region": region, "start_at": start_at, "end_at": end_at},
        )
        rows = cursor.fetchall()
    return [
        {
            "regionCode": row["region_code"],
            "hour": _json_value(row["hour"]),
            "sum": _json_value(row["power_sum"]),
            "average": _json_value(row["power_average"]),
            "sampleCount": row["sample_count"],
        }
        for row in rows
    ]


def _archive_aggregate_measurements(
    params: dict[str, Any],
    context: RuntimeContext,
    archive: dict[str, Any],
) -> list[dict[str, Any]]:
    region, start_at, end_at = _validate_range(params, context)
    field_map = archive["fieldMap"]
    metric = str(params.get("metric") or "").strip().upper()
    value_code = metric or archive["valueFieldCode"]
    if not value_code:
        value_code = next((code for code in ("P_ACTIVE", "ACTIVE_POWER", "VALUE") if code in field_map), "")
    time_code = archive["timeFieldCode"]
    region_code = archive["regionFieldCode"]
    if (
        not value_code or value_code not in field_map
        or not time_code or time_code not in field_map
        or not region_code or region_code not in field_map
    ):
        raise ValueError("VALIDATION_ERROR")
    dialect = _archive_dialect(context)
    if dialect != "postgresql":
        raise ValueError("VALIDATION_ERROR")
    quoted_table = _quote_identifier(archive["table"], dialect)
    time_column = _quote_identifier(field_map[time_code], dialect)
    region_column = _quote_identifier(field_map[region_code], dialect)
    value_column = _quote_identifier(field_map[value_code], dialect)
    statement = (
        f"SELECT {region_column} AS region_code, date_trunc('hour', {time_column}) AS hour, "
        f"sum({value_column}) AS power_sum, avg({value_column}) AS power_average, count(*) AS sample_count "
        f"FROM {quoted_table} "
        f"WHERE {region_column} = %(region)s AND {time_column} >= %(start_at)s AND {time_column} < %(end_at)s "
        f"GROUP BY {region_column}, date_trunc('hour', {time_column}) ORDER BY hour"
    )
    with measurement_connection(context) as current, current.cursor() as cursor:
        cursor.execute(statement, {"region": region, "start_at": start_at, "end_at": end_at})
        rows = cursor.fetchall()
    return [
        {
            "regionCode": row["region_code"],
            "hour": _json_value(row["hour"]),
            "sum": _json_value(row["power_sum"]),
            "average": _json_value(row["power_average"]),
            "sampleCount": row["sample_count"],
        }
        for row in rows
    ]


def detail_measurements(params, context: RuntimeContext) -> tuple[list[dict[str, Any]], dict[str, int]]:
    archive = _measurement_archive(context)
    if archive is not None:
        return _archive_detail_measurements(params, context, archive)
    return _legacy_detail_measurements(params, context)


def _legacy_detail_measurements(params, context: RuntimeContext) -> tuple[list[dict[str, Any]], dict[str, int]]:
    region, start_at, end_at = _validate_range(params, context)
    mode = context.output_mode
    if mode not in {"detail", "masked"}:
        raise PermissionError("POLICY_NOT_FOUND")
    raw_fields = str(params.get("fields") or "").strip()
    if raw_fields:
        selected = list(dict.fromkeys(item.strip().lower() for item in raw_fields.split(",") if item.strip()))
    else:
        selected = DEFAULT_FIELDS
    if not selected or any(field not in FIELD_COLUMNS for field in selected):
        raise PermissionError("FIELD_NOT_ALLOWED")
    page = max(1, int(params.get("page") or 1))
    page_size = min(
        max(1, int(params.get("pageSize") or 100)),
        int(context.policy.get("max_rows") or 1000),
        1000,
    )
    offset = (page - 1) * page_size
    columns = sql.SQL(", ").join(sql.Identifier(FIELD_COLUMNS[field]) for field in selected)
    statement = sql.SQL(
        "SELECT {columns} FROM measurement_demo.active_power_measurements "
        "WHERE region_code = %(region)s "
        "AND measurement_time >= %(start_at)s AND measurement_time < %(end_at)s "
        "ORDER BY measurement_time, point_code LIMIT %(limit)s OFFSET %(offset)s"
    ).format(
        columns=columns,
    )
    with measurement_connection(context) as current, current.cursor() as cursor:
        cursor.execute(
            statement,
            {
                "region": region,
                "start_at": start_at,
                "end_at": end_at,
                "limit": page_size,
                "offset": offset,
            },
        )
        raw_rows = cursor.fetchall()
    rows = []
    for raw_row in raw_rows:
        row = {}
        for field in selected:
            value = _json_value(raw_row[field])
            if field == "point_code" and mode == "masked" and value:
                value = str(value)[:6] + "***"
            row[_camel_case(field)] = value
        rows.append(row)
    return rows, {"page": page, "pageSize": page_size, "returnedRows": len(rows)}


def _archive_detail_measurements(
    params: dict[str, Any],
    context: RuntimeContext,
    archive: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    region, start_at, end_at = _validate_range(params, context)
    mode = context.output_mode
    if mode not in {"detail", "masked"}:
        raise PermissionError("POLICY_NOT_FOUND")
    field_map = archive["fieldMap"]
    time_code = archive["timeFieldCode"]
    region_code = archive["regionFieldCode"]
    if not time_code or time_code not in field_map or not region_code or region_code not in field_map:
        raise ValueError("VALIDATION_ERROR")
    raw_fields = str(params.get("fields") or "").strip()
    if raw_fields:
        selected = list(dict.fromkeys(item.strip().upper() for item in raw_fields.split(",") if item.strip()))
    else:
        selected = archive["defaultFields"] or list(field_map)
    if not selected or any(code not in field_map for code in selected):
        raise PermissionError("FIELD_NOT_ALLOWED")
    page = max(1, int(params.get("page") or 1))
    page_size = min(
        max(1, int(params.get("pageSize") or 100)),
        int(context.policy.get("max_rows") or 1000),
        1000,
    )
    offset = (page - 1) * page_size
    dialect = _archive_dialect(context)
    quoted_table = _quote_identifier(archive["table"], dialect)
    select_columns = ", ".join(_quote_identifier(field_map[code], dialect) for code in selected)
    conditions = [f"{_quote_identifier(field_map[region_code], dialect)} = %(region)s"]
    parameters: dict[str, Any] = {
        "region": region,
        "start_at": start_at,
        "end_at": end_at,
        "limit": page_size,
        "offset": offset,
    }
    time_column = _quote_identifier(field_map[time_code], dialect)
    conditions.extend([f"{time_column} >= %(start_at)s", f"{time_column} < %(end_at)s"])
    order: list[str] = []
    order.append(time_column)
    point_code = archive["pointFieldCode"]
    if point_code and point_code in field_map:
        order.append(_quote_identifier(field_map[point_code], dialect))
    statement = (
        f"SELECT {select_columns} FROM {quoted_table} "
        f"WHERE {' AND '.join(conditions)} ORDER BY {', '.join(order)} "
        "LIMIT %(limit)s OFFSET %(offset)s"
    )
    with measurement_connection(context) as current, current.cursor() as cursor:
        cursor.execute(statement, parameters)
        raw_rows = cursor.fetchall()
    mask_codes = {str(code).upper() for code in archive["maskFields"]}
    rows = []
    for raw_row in raw_rows:
        row = {}
        for code in selected:
            column = field_map[code]
            value = _json_value(raw_row[column])
            if code in mask_codes and mode == "masked" and value not in {None, ""}:
                text = str(value)
                value = f"{text[:3]}***{text[-2:]}" if len(text) > 5 else "***"
            row[_camel_case(code.lower())] = value
        rows.append(row)
    return rows, {"page": page, "pageSize": page_size, "returnedRows": len(rows)}


def _homomorphic_denied(code: str, context: RuntimeContext) -> RuntimeDenied:
    return RuntimeDenied(
        code,
        request_id=context.request_id,
        api=context.api,
        subject=context.subject,
        policy=context.policy,
        client_ip=context.client_ip,
        query_days=context.query_days,
        requested_rows=context.requested_rows,
        matched_labels=context.matched_labels,
        risk_factors=context.risk_factors,
        label_snapshot_version=context.label_snapshot_version,
        security_actions=(*context.security_actions, "DENY"),
        security_snapshot=context.security_snapshot,
    )


def _context_denied(code: str, context: RuntimeContext, *, risk_score: int | None = None) -> RuntimeDenied:
    """Preserve the evaluated control chain when execution fails after authorization."""
    return RuntimeDenied(
        code,
        request_id=context.request_id,
        api=context.api,
        subject=context.subject,
        policy=context.policy,
        client_ip=context.client_ip,
        query_days=context.query_days,
        requested_rows=context.requested_rows,
        risk_score=risk_score,
        matched_labels=context.matched_labels,
        risk_factors=context.risk_factors,
        label_snapshot_version=context.label_snapshot_version,
        security_actions=(*context.security_actions, "DENY"),
        security_snapshot=context.security_snapshot,
    )


def _homomorphic_event(
    stage: str,
    result: str,
    message: str,
    *,
    request_id: str = "",
    duration_ms: int | None = None,
) -> dict[str, Any]:
    return {
        "id": f"{stage}-{uuid4()}",
        "time": datetime.now(timezone.utc).isoformat(),
        "stage": stage,
        "result": result,
        "message": message,
        "requestId": request_id,
        "durationMs": duration_ms,
    }


def _homomorphic_resource(context: RuntimeContext) -> dict[str, Any]:
    resource = fetch_one(
        "SELECT * FROM eco_data_resources WHERE id=%(id)s LIMIT 1",
        {"id": context.api.get("resource_id")},
    )
    if not resource or str(resource.get("resource_status") or "") != "enabled":
        raise _homomorphic_denied("ROUTE_NOT_FOUND", context)
    return resource


def _homomorphic_field(context: RuntimeContext, resource: dict[str, Any], field_code: str) -> dict[str, Any]:
    field = fetch_one(
        """
        SELECT * FROM eco_resource_security_fields
        WHERE resource_id=%(resource_id)s AND upper(field_code)=upper(%(field_code)s)
        LIMIT 1
        """,
        {"resource_id": resource.get("id"), "field_code": field_code},
    )
    if not field:
        raise _homomorphic_denied("FIELD_NOT_ALLOWED", context)
    data_type = str(field.get("data_type") or "").strip().lower()
    numeric_markers = ("int", "decimal", "numeric", "float", "double", "real", "number")
    if not any(marker in data_type for marker in numeric_markers):
        raise _homomorphic_denied("HOMOMORPHIC_FIELD_INVALID", context)
    return field


def _homomorphic_key(context: RuntimeContext, algorithm: str) -> dict[str, Any]:
    key = fetch_one(
        """
        SELECT * FROM security_crypto_keys
        WHERE subject_id=%(subject_id)s AND lower(algorithm_code)=%(algorithm)s
          AND key_status='enabled' AND valid_from <= %(now)s
          AND (valid_to IS NULL OR valid_to > %(now)s)
        ORDER BY valid_from DESC, id DESC
        LIMIT 1
        """,
        {
            "subject_id": context.subject.get("id"),
            "algorithm": algorithm.lower(),
            "now": datetime.now(timezone.utc),
        },
    )
    if not key:
        raise _homomorphic_denied("HOMOMORPHIC_UNAVAILABLE", context)
    return key


def _homomorphic_values(
    params: dict[str, Any],
    context: RuntimeContext,
    processing_path: str,
    field_code: str,
) -> list[int | float]:
    archive = _measurement_archive(context)
    scale = float((archive or {}).get("scales", {}).get(field_code.upper(), 1.0))
    if processing_path == "/internal/region-hourly":
        if archive is not None:
            raw_values = _read_archive_values(params, context, archive, field_code)
        else:
            raw_values = _legacy_region_hourly_values(params, context)
    else:
        query_params = {
            **params,
            "fields": field_code,
            "page": 1,
            "pageSize": 65,
        }
        rows, _ = resource_query(query_params, context)
        result_key = _camel_case(field_code.lower())
        raw_values = [row.get(result_key) for row in rows]

    values: list[int | float] = []
    for value in raw_values:
        if value is None:
            continue
        if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
            raise _homomorphic_denied("HOMOMORPHIC_FIELD_INVALID", context)
        number = float(value)
        if not math.isfinite(number):
            raise _homomorphic_denied("HOMOMORPHIC_FIELD_INVALID", context)
        if scale != 1.0:
            values.append(number * scale)
        elif isinstance(value, int):
            values.append(int(value))
        else:
            values.append(number)
    if not values:
        raise _homomorphic_denied("HOMOMORPHIC_NO_DATA", context)
    if len(values) > 64:
        raise _homomorphic_denied("HOMOMORPHIC_SAMPLE_LIMIT", context)
    return values


def _legacy_region_hourly_values(
    params: dict[str, Any],
    context: RuntimeContext,
) -> list[Any]:
    region, start_at, end_at = _validate_range(params, context)
    statement = sql.SQL(
        "SELECT active_power FROM measurement_demo.active_power_measurements "
        "WHERE region_code=%(region)s "
        "AND measurement_time >= %(start_at)s AND measurement_time < %(end_at)s "
        "ORDER BY measurement_time, point_code LIMIT 65"
    )
    with measurement_connection(context) as current, current.cursor() as cursor:
        cursor.execute(
            statement,
            {
                "region": region,
                "start_at": start_at,
                "end_at": end_at,
            },
        )
        return [row["active_power"] for row in cursor.fetchall()]


def _read_archive_values(
    params: dict[str, Any],
    context: RuntimeContext,
    archive: dict[str, Any],
    field_code: str,
) -> list[Any]:
    region, start_at, end_at = _validate_range(params, context)
    field_map = archive["fieldMap"]
    if field_code not in field_map:
        raise _homomorphic_denied("FIELD_NOT_ALLOWED", context)
    time_code = archive["timeFieldCode"]
    region_code = archive["regionFieldCode"]
    if not time_code or time_code not in field_map or not region_code or region_code not in field_map:
        raise _homomorphic_denied("VALIDATION_ERROR", context)
    dialect = _archive_dialect(context)
    quoted_table = _quote_identifier(archive["table"], dialect)
    value_column = _quote_identifier(field_map[field_code], dialect)
    time_column = _quote_identifier(field_map[time_code], dialect)
    region_column = _quote_identifier(field_map[region_code], dialect)
    conditions = [
        f"{region_column} = %(region)s",
        f"{time_column} >= %(start_at)s",
        f"{time_column} < %(end_at)s",
    ]
    parameters: dict[str, Any] = {"region": region, "start_at": start_at, "end_at": end_at}
    order = [time_column]
    point_code = archive["pointFieldCode"]
    if point_code and point_code in field_map:
        order.append(_quote_identifier(field_map[point_code], dialect))
    statement = (
        f"SELECT {value_column} AS value FROM {quoted_table} "
        f"WHERE {' AND '.join(conditions)} ORDER BY {', '.join(order)} LIMIT 65"
    )
    with measurement_connection(context) as current, current.cursor() as cursor:
        cursor.execute(statement, parameters)
        return [row["value"] for row in cursor.fetchall()]


def _create_homomorphic_task(
    context: RuntimeContext,
    resource: dict[str, Any],
    field_code: str,
    operation: str,
    algorithm: str,
    crypto_key: dict[str, Any],
    params: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    now = datetime.now(timezone.utc)
    task_code = f"HE-AUTO-{uuid4().hex[:20].upper()}"
    events = [
        _homomorphic_event("created", "success", "资源 API 请求命中密态策略，已自动创建任务。", request_id=context.request_id),
        _homomorphic_event("validation", "success", "访问主体、数据范围与数值字段校验通过。", request_id=context.request_id),
    ]
    summary = {
        "trigger": "resource-api-policy",
        "outputMode": "encrypted",
        "requestId": context.request_id,
        "resource": {
            "id": resource.get("id"),
            "code": resource.get("resource_code"),
            "name": resource.get("resource_name"),
        },
        "fieldCode": field_code,
        "operation": operation,
        "scope": {
            "startAt": params.get("startAt"),
            "endAt": params.get("endAt"),
            "regionCode": params.get("regionCode"),
            "organizationCode": params.get("organizationCode"),
        },
        "events": events,
        "logs": events,
    }
    task = fetch_one(
        """
        INSERT INTO security_confidential_tasks (
          task_code, task_name, scenario, task_status, risk_level, algorithm,
          source_domain, target_domain, progress, execution_summary_json, task_tags,
          operation, region_scope_json, organization_scope_json, measure_field_code,
          data_start_at, data_end_at, sample_count, idempotency_key, started_at,
          subject_id, api_resource_id, crypto_key_id, "createdAt", "updatedAt"
        ) VALUES (
          %(task_code)s, %(task_name)s, %(scenario)s, 'running', %(risk_level)s, %(algorithm)s,
          'data-resource', 'authorized-consumer', 10, %(summary)s::jsonb, %(tags)s::json,
          %(operation)s, %(regions)s::jsonb, %(organizations)s::jsonb, %(field_code)s,
          %(start_at)s, %(end_at)s, 0, %(idempotency_key)s, %(now)s,
          %(subject_id)s, %(api_id)s, %(key_id)s, %(now)s, %(now)s
        ) RETURNING *
        """,
        {
            "task_code": task_code,
            "task_name": f"{resource.get('resource_name') or '数据资源'}{field_code}{'平均值' if operation == 'mean' else '求和'}密态计算",
            "scenario": str(context.policy.get("scenario") or "resource-data-query"),
            "risk_level": context.level,
            "algorithm": algorithm.lower(),
            "summary": json.dumps(summary, ensure_ascii=False),
            "tags": json.dumps(["资源 API 触发", "自动密态计算", algorithm.upper()], ensure_ascii=False),
            "operation": operation,
            "regions": json.dumps([params.get("regionCode")] if params.get("regionCode") else [], ensure_ascii=False),
            "organizations": json.dumps([params.get("organizationCode")] if params.get("organizationCode") else [], ensure_ascii=False),
            "field_code": field_code,
            "start_at": _parse_time(str(params.get("startAt") or "")),
            "end_at": _parse_time(str(params.get("endAt") or "")),
            "idempotency_key": f"resource-api:{context.request_id}",
            "subject_id": context.subject.get("id"),
            "api_id": context.api.get("id"),
            "key_id": crypto_key.get("id"),
            "now": now,
        },
    ) or {}
    execute(
        """
        INSERT INTO security_confidential_task_resources (
          task_id, resource_id, resource_role, field_scope_json, relation_tags, "createdAt", "updatedAt"
        ) VALUES (
          %(task_id)s, %(resource_id)s, 'primary', %(field_scope)s::jsonb, %(tags)s::json, %(now)s, %(now)s
        )
        """,
        {
            "task_id": task.get("id"),
            "resource_id": resource.get("id"),
            "field_scope": json.dumps({"fields": [field_code]}, ensure_ascii=False),
            "tags": json.dumps(["服务端取数", "密态计算"], ensure_ascii=False),
            "now": now,
        },
    )
    return task, events


def _fail_homomorphic_task(
    task_id: int,
    summary: dict[str, Any],
    events: list[dict[str, Any]],
    message: str,
    started_timer: float,
) -> None:
    duration_ms = round((time.perf_counter() - started_timer) * 1000)
    failed_event = _homomorphic_event("failed", "failed", message, duration_ms=duration_ms)
    failed_events = [*events, failed_event]
    execute(
        """
        UPDATE security_confidential_tasks
        SET task_status='failed', progress=0, duration_ms=%(duration_ms)s,
            error_summary=%(message)s,
            execution_summary_json=%(summary)s::jsonb, "updatedAt"=%(now)s
        WHERE id=%(id)s
        """,
        {
            "id": task_id,
            "duration_ms": duration_ms,
            "message": message,
            "summary": json.dumps({**summary, "events": failed_events, "logs": failed_events}, ensure_ascii=False),
            "now": datetime.now(timezone.utc),
        },
    )


def _record_ingest_runtime_failure(error: RuntimeDenied, duration_ms: int) -> None:
    api = error.api or {}
    source_id = api.get("data_source_id")
    if not source_id:
        return
    now = datetime.now(timezone.utc)
    execute(
        """
        INSERT INTO security_ingest_logs
          (batch_code, execution_type, rule_version, started_at, finished_at,
           input_count, passed_count, rejected_count, duration_ms, result_status,
           error_summary, result_detail_json, data_source_id, api_resource_id,
           "createdAt", "updatedAt")
        VALUES
          (%(batch_code)s, 'resource_delivery_error', 1, %(started_at)s, %(finished_at)s,
           0, 0, 1, %(duration_ms)s, 'failed', %(error_summary)s,
           %(result_detail)s::jsonb, %(source_id)s, %(api_id)s,
           %(finished_at)s, %(finished_at)s)
        """,
        {
            "batch_code": f"INGEST-ERROR-{now.strftime('%Y%m%d%H%M%S')}-{api.get('id') or api.get('resource_id') or 'NA'}-{uuid4().hex[:8]}",
            "started_at": datetime.fromtimestamp(
                max(0, now.timestamp() - max(0, duration_ms) / 1000),
                tz=timezone.utc,
            ),
            "finished_at": now,
            "duration_ms": max(0, duration_ms),
            "error_summary": error.message,
            "result_detail": json.dumps(
                {
                    "requestId": error.request_id,
                    "resourceId": api.get("resource_id"),
                    "errorCode": error.code,
                    "stage": "source_read",
                },
                ensure_ascii=False,
            ),
            "source_id": source_id,
            "api_id": api.get("id"),
        },
    )


def _record_homomorphic_runtime_failure(error: RuntimeDenied, duration_ms: int) -> None:
    api = error.api or {}
    subject = error.subject or {}
    if not api or not subject:
        return
    idempotency_key = f"resource-api:{error.request_id}"
    existing = fetch_one(
        "SELECT id FROM security_confidential_tasks WHERE idempotency_key=%(key)s LIMIT 1",
        {"key": idempotency_key},
    )
    if existing:
        return
    now = datetime.now(timezone.utc)
    event = _homomorphic_event(
        "failed",
        "failed",
        error.message,
        request_id=error.request_id,
        duration_ms=max(0, duration_ms),
    )
    summary = {
        "trigger": "resource-api-policy",
        "outputMode": "encrypted",
        "requestId": error.request_id,
        "resource": {"id": api.get("resource_id")},
        "events": [event],
        "logs": [event],
        "failureCode": error.code,
    }
    execute(
        """
        INSERT INTO security_confidential_tasks (
          task_code, task_name, scenario, task_status, risk_level, algorithm,
          source_domain, target_domain, progress, execution_summary_json, task_tags,
          sample_count, idempotency_key, started_at, completed_at, duration_ms,
          error_summary, subject_id, api_resource_id, "createdAt", "updatedAt"
        ) VALUES (
          %(task_code)s, '同态加密请求异常', %(scenario)s, 'failed', %(risk_level)s, 'unresolved',
          'data-resource', 'authorized-consumer', 0, %(summary)s::jsonb, %(tags)s::json,
          0, %(idempotency_key)s, %(started_at)s, %(finished_at)s, %(duration_ms)s,
          %(error_summary)s, %(subject_id)s, %(api_id)s, %(finished_at)s, %(finished_at)s
        ) ON CONFLICT DO NOTHING
        """,
        {
            "task_code": f"HE-ERROR-{uuid4().hex[:20].upper()}",
            "scenario": str((error.policy or {}).get("scenario") or "resource-data-query"),
            "risk_level": risk_level(error.risk_score),
            "summary": json.dumps(summary, ensure_ascii=False),
            "tags": json.dumps(["资源 API 触发", "异常日志"], ensure_ascii=False),
            "idempotency_key": idempotency_key,
            "started_at": datetime.fromtimestamp(
                max(0, now.timestamp() - max(0, duration_ms) / 1000),
                tz=timezone.utc,
            ),
            "finished_at": now,
            "duration_ms": max(0, duration_ms),
            "error_summary": error.message,
            "subject_id": subject.get("id"),
            "api_id": api.get("id"),
        },
    )


def record_runtime_engine_exception(error: RuntimeDenied, duration_ms: int) -> None:
    if error.code == "UPSTREAM_UNAVAILABLE":
        _record_ingest_runtime_failure(error, duration_ms)
    output_mode = str((error.policy or {}).get("output_mode") or "")
    if output_mode == "encrypted":
        _record_homomorphic_runtime_failure(error, duration_ms)


async def execute_homomorphic_resource_request(
    params: dict[str, Any],
    context: RuntimeContext,
    processing_path: str,
) -> tuple[dict[str, Any], int]:
    if context.api.get("supports_homomorphic") is not True:
        raise _homomorphic_denied("HOMOMORPHIC_UNSUPPORTED", context)
    operation = str(params.get("operation") or "").strip().lower()
    if operation not in {"sum", "mean"}:
        raise _homomorphic_denied("VALIDATION_ERROR", context)
    default_field = "P_ACTIVE" if processing_path == "/internal/region-hourly" else ""
    field_code = str(params.get("fieldCode") or default_field).strip().upper()
    if not field_code:
        raise _homomorphic_denied("VALIDATION_ERROR", context)

    resource = _homomorphic_resource(context)
    field = _homomorphic_field(context, resource, field_code)
    data_type = str(field.get("data_type") or "").lower()
    algorithm = "BFV" if "int" in data_type and not any(marker in data_type for marker in ("point", "decimal")) else "CKKS"
    crypto_key = _homomorphic_key(context, algorithm)
    task, events = _create_homomorphic_task(
        context, resource, field_code, operation, algorithm, crypto_key, params,
    )
    task_id = int(task["id"])
    summary = _json_object(task.get("execution_summary_json"))
    started_timer = time.perf_counter()
    try:
        values = _homomorphic_values(params, context, processing_path, field_code)
        read_event = _homomorphic_event(
            "resource_read", "success", f"已在服务端按授权范围读取 {len(values)} 条数值样本。",
            request_id=context.request_id,
        )
        compute_event = _homomorphic_event(
            "compute", "pending", "原始数值已在内存中提交密态计算，不写入任务记录。",
            request_id=context.request_id,
        )
        events.extend([read_event, compute_event])
        execute(
            """
            UPDATE security_confidential_tasks
            SET progress=45, sample_count=%(sample_count)s,
                execution_summary_json=%(summary)s::jsonb, "updatedAt"=%(now)s
            WHERE id=%(id)s
            """,
            {
                "id": task_id,
                "sample_count": len(values),
                "summary": json.dumps({**summary, "sampleCount": len(values), "events": events, "logs": events}, ensure_ascii=False),
                "now": datetime.now(timezone.utc),
            },
        )
        async with httpx.AsyncClient(timeout=settings.connection_timeout_seconds) as client:
            response = await client.post(
                f"{settings.homomorphic_service_url.rstrip('/')}/v1/tasks/execute",
                json={
                    "taskCode": task.get("task_code"),
                    "scheme": algorithm,
                    "operation": operation,
                    "values": values,
                },
            )
            response.raise_for_status()
            payload = response.json()
        if not isinstance(payload, dict) or not isinstance(payload.get("resultSummary"), dict):
            raise ValueError("invalid homomorphic response")
    except RuntimeDenied as error:
        _fail_homomorphic_task(task_id, summary, events, error.message, started_timer)
        raise
    except (httpx.HTTPError, ValueError) as error:
        denied = _homomorphic_denied("HOMOMORPHIC_UNAVAILABLE", context)
        _fail_homomorphic_task(task_id, summary, events, denied.message, started_timer)
        raise denied from error

    duration_ms = round((time.perf_counter() - started_timer) * 1000)
    engine_request_id = str(payload.get("requestId") or "")
    result_summary = {
        "value": payload["resultSummary"].get("value"),
        "verificationPassed": payload["resultSummary"].get("verificationPassed") is True,
        "absoluteError": payload["resultSummary"].get("absoluteError"),
        "tolerance": payload["resultSummary"].get("tolerance"),
    }
    safe_result = {
        "requestId": engine_request_id,
        "status": "completed",
        "scheme": algorithm,
        "operation": operation,
        "resultSummary": result_summary,
        "durationMs": payload.get("durationMs"),
        "ciphertextCount": payload.get("ciphertextCount"),
    }
    result_hash = hashlib.sha256(
        json.dumps(safe_result, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()
    result_event = _homomorphic_event(
        "result", "success", "密态计算已完成，结果摘要已回传。",
        request_id=engine_request_id,
        duration_ms=duration_ms,
    )
    completed_events = [*events, result_event]
    completed_summary = {
        **summary,
        "sampleCount": len(values),
        "result": safe_result,
        "events": completed_events,
        "logs": completed_events,
    }
    now = datetime.now(timezone.utc)
    execute(
        """
        UPDATE security_confidential_tasks
        SET task_status='completed', progress=100, sample_count=%(sample_count)s,
            completed_at=%(now)s, duration_ms=%(duration_ms)s, error_summary=NULL,
            ciphertext_result_ref=%(result_ref)s, result_hash=%(result_hash)s,
            execution_summary_json=%(summary)s::jsonb, "updatedAt"=%(now)s
        WHERE id=%(id)s
        """,
        {
            "id": task_id,
            "sample_count": len(values),
            "now": now,
            "duration_ms": duration_ms,
            "result_ref": f"homomorphic-result:{task.get('task_code')}:{engine_request_id}",
            "result_hash": result_hash,
            "summary": json.dumps(completed_summary, ensure_ascii=False),
        },
    )
    return {
        "requestId": context.request_id,
        "taskCode": task.get("task_code"),
        "outputMode": "encrypted",
        "resource": completed_summary["resource"],
        "fieldCode": field_code,
        "operation": operation,
        "algorithm": algorithm,
        "sampleCount": len(values),
        "resultSummary": result_summary,
        "engineRequestId": engine_request_id,
        "durationMs": duration_ms,
    }, 1


async def execute_data_api(request, context: RuntimeContext) -> tuple[Any, int]:
    mode = str(context.api.get("access_mode") or "")
    processing_path = str(context.api.get("orchestrator_path") or "")
    if mode == "direct" and context.output_mode != "detail":
        raise RuntimeDenied(
            "TAG_CONSTRAINT_VIOLATION", request_id=context.request_id, api=context.api,
            subject=context.subject, policy=context.policy, client_ip=context.client_ip,
            query_days=context.query_days, requested_rows=context.requested_rows,
            risk_score=90, matched_labels=context.matched_labels,
            risk_factors=({
                "code": "directRouteIsolation",
                "label": "直连路由隔离",
                "score": 90,
                "detail": "直连数据服务无法执行脱敏、聚合或密态动作，已阻断原样转发",
            },),
            label_snapshot_version=context.label_snapshot_version,
            security_actions=(*context.security_actions, "DENY"),
            security_snapshot=context.security_snapshot,
        )
    if mode == "direct":
        upstream = str(context.api.get("upstream_url") or "")
        if not upstream.startswith(("http://", "https://")):
            raise _context_denied("UPSTREAM_UNAVAILABLE", context)
        try:
            forwarded_headers = {"accept": "application/json"}
            content_type = request.headers.get("content-type")
            if content_type:
                forwarded_headers["content-type"] = content_type
            async with httpx.AsyncClient(timeout=settings.connection_timeout_seconds) as client:
                response = await client.request(
                    request.method,
                    upstream,
                    params=list(request.query_params.multi_items()),
                    headers=forwarded_headers,
                    content=await request.body() if request.method == "POST" else None,
                )
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise _context_denied("UPSTREAM_UNAVAILABLE", context) from error
        return payload, len(payload) if isinstance(payload, list) else 1
    params: dict[str, Any] = dict(request.query_params)
    if request.method == "POST":
        try:
            body_params = await request.json()
        except ValueError as error:
            raise ValueError("VALIDATION_ERROR") from error
        if not isinstance(body_params, dict):
            raise ValueError("VALIDATION_ERROR")
        params.update(body_params)
    if context.output_mode == "encrypted":
        if processing_path not in {"/internal/region-hourly", "/internal/resource-query"}:
            raise _homomorphic_denied("HOMOMORPHIC_UNSUPPORTED", context)
        return await execute_homomorphic_resource_request(params, context, processing_path)
    if processing_path == "/internal/active-power":
        rows, meta = detail_measurements(params, context)
        meta.update(
            {"decision": "allow", "outputMode": context.output_mode, "riskLevel": context.level}
        )
        return {"requestId": context.request_id, "data": rows, "meta": meta}, len(rows)
    if processing_path == "/internal/region-hourly":
        if context.output_mode != "aggregate":
            raise _context_denied("VALIDATION_ERROR", context)
        rows = aggregate_measurements(params, context)
        return {
            "requestId": context.request_id,
            "data": rows,
            "meta": {
                "decision": "allow",
                "outputMode": context.output_mode,
                "riskLevel": context.level,
            },
        }, len(rows)
    if processing_path == "/internal/resource-query":
        if context.output_mode == "aggregate":
            rows = aggregate_measurements(params, context)
            return {
                "requestId": context.request_id,
                "data": rows,
                "meta": {
                    "decision": "allow",
                    "outputMode": context.output_mode,
                    "riskLevel": context.level,
                },
            }, len(rows)
        if context.output_mode not in {"detail", "masked"}:
            raise _context_denied("POLICY_NOT_FOUND", context)
        rows, meta = resource_query(params, context)
        meta.update({"decision": "allow", "outputMode": context.output_mode, "riskLevel": context.level})
        return {"requestId": context.request_id, "data": rows, "meta": meta}, len(rows)
    if processing_path == "/internal/push/switch-event":
        # 消息推送服务：接入档案与路径占位，演示环境不产生真实推送。
        config = _json_object(context.api.get("runtime_config_json"))
        return {
            "requestId": context.request_id,
            "status": "placeholder",
            "serviceType": "message_push",
            "topic": str(config.get("topic") or "switch-event"),
            "message": "开关变位消息推送通道已完成接入档案与路径占位，演示环境不产生真实推送。",
            "meta": {"decision": "allow", "outputMode": context.output_mode, "riskLevel": context.level},
        }, 0
    if processing_path == "/internal/model/line-relation":
        # 模型衍生服务：接入档案与路径占位，演示环境不执行真实模型。
        config = _json_object(context.api.get("runtime_config_json"))
        return {
            "requestId": context.request_id,
            "status": "placeholder",
            "serviceType": "model_service",
            "model": str(config.get("model") or "line-relation"),
            "message": "配网线变关系辨识模型服务已完成接入档案与路径占位，演示环境不执行真实模型。",
            "meta": {"decision": "allow", "outputMode": context.output_mode, "riskLevel": context.level},
        }, 0
    raise _context_denied("ROUTE_NOT_FOUND", context)


STREAM_CHANNEL_TYPES = {"stream_subscription", "topic_consumer"}
STREAM_SUBSCRIPTION_MODES = {"push", "pull", "batch"}


def open_stream_subscription(context: RuntimeContext) -> dict[str, Any]:
    """签发受控订阅租约，不在本地伪造或转发流式消息。"""
    channel_type = str(context.api.get("channel_type") or "query_service")
    if channel_type not in STREAM_CHANNEL_TYPES:
        raise _context_denied("ROUTE_NOT_FOUND", context)
    topic_name = str(context.api.get("topic_name") or "").strip()
    consumer_group = str(context.api.get("consumer_group") or "").strip()
    subscription_mode = str(context.api.get("subscription_mode") or "").strip()
    if not topic_name or not consumer_group or subscription_mode not in STREAM_SUBSCRIPTION_MODES:
        raise _context_denied("VALIDATION_ERROR", context)
    return {
        "requestId": context.request_id,
        "channelCode": str(context.api.get("api_code") or ""),
        "channelName": str(context.api.get("api_name") or ""),
        "channelType": channel_type,
        "topicName": topic_name,
        "consumerGroup": consumer_group,
        "subscriptionMode": subscription_mode,
        "decision": "allow",
        "outputMode": context.output_mode,
        "leaseSeconds": 300,
        "message": "订阅授权已签发；实际消息由已接入的数据中台适配器按此授权建立受控消费。",
    }


def record_allowed(context: RuntimeContext, returned_rows: int, duration_ms: int) -> None:
    now = datetime.now(timezone.utc)
    snapshot = context.security_snapshot or runtime_security_snapshot(context.policy, context.api)
    evidence = {
        "traceVersion": "runtime-v1",
        "matchedLabels": list(context.matched_labels),
        "riskFactors": list(context.risk_factors),
        "runtimeConfigVersion": context.policy.get("gateway_config_version"),
        "labelSnapshotVersion": context.label_snapshot_version,
        **security_control_evidence(
            context.policy,
            snapshot,
            context.security_actions,
            api=context.api,
            subject=context.subject,
            risk_factors=context.risk_factors,
            decision="allow",
            reason_code="POLICY_ALLOW",
        ),
        "runtimeTrace": runtime_trace(
            policy=context.policy,
            snapshot=snapshot,
            matched_labels=context.matched_labels,
            actions=context.security_actions,
            risk_factors=context.risk_factors,
            decision="allow",
            risk_score=context.risk_score,
            reason_code="POLICY_ALLOW",
        ),
    }
    execute(
        """
        INSERT INTO security_policy_decision_logs (
          request_id, subject_id, api_resource_id, policy_id,
          requested_output_mode, effective_output_mode, decision_result,
          decision_reason_code, decision_reason, risk_score, risk_level,
          client_ip, query_days, requested_rows, returned_rows, response_status,
          response_bytes, duration_ms, applied_limits_json, requested_at, "createdAt", "updatedAt"
        ) VALUES (
          %(request_id)s, %(subject_id)s, %(api_id)s, %(policy_id)s,
          %(output_mode)s, %(output_mode)s, 'allow', 'POLICY_ALLOW',
          '请求通过已发布访问策略校验', %(risk_score)s, %(risk_level)s,
          %(client_ip)s, %(query_days)s, %(requested_rows)s, %(returned_rows)s,
          200, 0, %(duration_ms)s, %(evidence)s::jsonb, %(now)s, %(now)s, %(now)s
        ) ON CONFLICT (request_id) DO NOTHING
        """,
        {
            "request_id": context.request_id,
            "subject_id": context.subject["id"],
            "api_id": context.api["id"],
            "policy_id": context.policy["id"],
            "output_mode": context.output_mode,
            "risk_score": context.risk_score,
            "risk_level": context.level,
            "client_ip": context.client_ip,
            "query_days": context.query_days,
            "requested_rows": context.requested_rows,
            "returned_rows": returned_rows,
            "duration_ms": max(0, duration_ms),
            "evidence": json.dumps(evidence, ensure_ascii=False),
            "now": now,
        },
    )


def record_denied(error: RuntimeDenied, duration_ms: int) -> None:
    now = datetime.now(timezone.utc)
    snapshot = error.security_snapshot or runtime_security_snapshot(error.policy or {}, error.api or {})
    evidence = {
        "traceVersion": "runtime-v1",
        "matchedLabels": error.matched_labels,
        "riskFactors": error.risk_factors,
        "runtimeConfigVersion": error.policy.get("gateway_config_version") if error.policy else None,
        "labelSnapshotVersion": error.label_snapshot_version,
        **security_control_evidence(
            error.policy or {},
            snapshot,
            error.security_actions or ("DENY", "AUDIT"),
            api=error.api,
            subject=error.subject,
            risk_factors=error.risk_factors,
            decision="deny",
            reason_code=error.code,
        ),
        "runtimeTrace": runtime_trace(
            policy=error.policy,
            snapshot=snapshot,
            matched_labels=error.matched_labels,
            actions=error.security_actions or ("DENY", "AUDIT"),
            risk_factors=error.risk_factors,
            decision="deny",
            risk_score=error.risk_score,
            reason_code=error.code,
        ),
    }
    with connection() as current, current.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO security_policy_decision_logs (
              request_id, subject_id, api_resource_id, policy_id,
              requested_output_mode, effective_output_mode, decision_result,
              decision_reason_code, decision_reason, risk_score, risk_level,
              client_ip, query_days, requested_rows, returned_rows, response_status,
              response_bytes, duration_ms, applied_limits_json, requested_at, "createdAt", "updatedAt"
            ) VALUES (
              %(request_id)s, %(subject_id)s, %(api_id)s, %(policy_id)s,
              %(output_mode)s, %(output_mode)s, 'deny', %(reason_code)s,
              %(reason)s, %(risk_score)s, %(risk_level)s, %(client_ip)s,
              %(query_days)s, %(requested_rows)s, 0, %(response_status)s,
              0, %(duration_ms)s, %(evidence)s::jsonb, %(now)s, %(now)s, %(now)s
            ) ON CONFLICT (request_id) DO NOTHING
            """,
            {
                "request_id": error.request_id,
                "subject_id": error.subject.get("id") if error.subject else None,
                "api_id": error.api.get("id") if error.api else None,
                "policy_id": error.policy.get("id") if error.policy else None,
                "output_mode": error.policy.get("output_mode") if error.policy else None,
                "reason_code": error.code,
                "reason": error.message,
                "risk_score": error.risk_score,
                "risk_level": risk_level(error.risk_score),
                "client_ip": error.client_ip,
                "query_days": error.query_days,
                "requested_rows": error.requested_rows,
                "response_status": error.status,
                "duration_ms": max(0, duration_ms),
                "evidence": json.dumps(evidence, ensure_ascii=False),
                "now": now,
            },
        )


def runtime_summary() -> dict[str, Any]:
    row = fetch_one(
        """
        SELECT
          (SELECT count(*) FROM security_data_sources WHERE connection_status <> 'disabled') AS sources,
          (SELECT count(*) FROM security_api_resources WHERE api_status = 'enabled' AND publish_status = 'success') AS apis,
          (SELECT count(*) FROM eco_resource_security_policies WHERE policy_kind = 'access_policy' AND policy_status = 'enabled' AND publish_status = 'success') AS policies,
          (SELECT count(*) FROM security_access_subjects WHERE subject_status = 'enabled') AS subjects,
          (SELECT count(*) FROM security_policy_decision_logs) AS calls
        """
    ) or {}
    return {key: int(value or 0) for key, value in row.items()}


SUPPORTED_ORCHESTRATOR_PATHS = {
    "",
    "/internal/active-power",
    "/internal/region-hourly",
    "/internal/resource-query",
    "/internal/push/switch-event",
    "/internal/model/line-relation",
}


def validate_api(api: dict[str, Any]) -> list[str]:
    errors = []
    channel_type = str(api.get("channel_type") or "query_service")
    gateway_path = str(api.get("gateway_path") or "")
    method = str(api.get("http_method") or "").upper()
    if channel_type in STREAM_CHANNEL_TYPES:
        if not gateway_path.startswith("/data-stream/"):
            errors.append("流式通道地址必须以 /data-stream/ 开头")
        if method != "POST":
            errors.append("流式通道的订阅授权方法必须为 POST")
        if not str(api.get("topic_name") or "").strip():
            errors.append("流式通道必须配置流式主题")
        if not str(api.get("consumer_group") or "").strip():
            errors.append("流式通道必须配置消费组")
        if str(api.get("subscription_mode") or "") not in STREAM_SUBSCRIPTION_MODES:
            errors.append("流式通道必须配置推送、拉取或批量订阅模式")
        return errors
    if channel_type != "query_service":
        return ["通道类型不受支持"]
    if not gateway_path.startswith("/data-api/"):
        errors.append("查询服务地址必须以 /data-api/ 开头")
    if method not in {"GET", "POST"}:
        errors.append("请求方法只支持 GET 或 POST")
    mode = str(api.get("access_mode") or "")
    if mode == "direct" and not str(api.get("upstream_url") or "").startswith(("http://", "https://")):
        errors.append("直接纳管模式必须配置有效上游地址")
    if mode in {"develop", "orchestrate"} and str(api.get("orchestrator_path") or "") not in SUPPORTED_ORCHESTRATOR_PATHS:
        errors.append("处理路径未绑定可用的数据处理能力")
    if mode not in {"direct", "develop", "orchestrate"}:
        errors.append("接入模式不受支持")
    return errors


def publish_api(api_id: int) -> dict[str, Any]:
    api = fetch_one("SELECT * FROM security_api_resources WHERE id = %(id)s", {"id": api_id})
    if not api:
        raise LookupError("数据服务通道不存在")
    errors = validate_api(api)
    runtime_config = _json_object(api.get("runtime_config_json"))
    source_id = api.get("data_source_id")
    is_stream_channel = str(api.get("channel_type") or "query_service") in STREAM_CHANNEL_TYPES
    if not is_stream_channel and str(api.get("access_mode") or "") in {"develop", "orchestrate"} and str(api.get("orchestrator_path") or "") not in {
        "/internal/active-power", "/internal/region-hourly", "/internal/push/switch-event", "/internal/model/line-relation",
    }:
        try:
            runtime_config, source_id = build_resource_runtime_config(api)
            api = {
                **api,
                "data_source_id": source_id,
                "orchestrator_path": "/internal/resource-query",
                "runtime_config_json": runtime_config,
            }
            verify_resource_runtime_config(api)
        except (ValueError, RuntimeDenied) as error:
            errors.append(str(error))
    now = datetime.now(timezone.utc)
    if errors:
        execute(
            "UPDATE security_api_resources SET publish_status='failed', publish_error=%(error)s, \"updatedAt\"=%(now)s WHERE id=%(id)s",
            {"id": api_id, "error": "；".join(errors), "now": now},
        )
        raise ValueError("；".join(errors))
    version = int(api.get("publish_version") or 0) + 1
    execute(
        """
        UPDATE security_api_resources
        SET api_status='enabled', publish_status='success', publish_version=%(version)s,
            published_at=%(now)s, publish_error=NULL, data_source_id=%(source_id)s,
            orchestrator_path=%(orchestrator_path)s, runtime_config_json=%(runtime_config)s::jsonb,
            "updatedAt"=%(now)s
        WHERE id=%(id)s
        """,
        {
            "id": api_id, "version": version, "now": now, "source_id": source_id,
            "orchestrator_path": api.get("orchestrator_path"),
            "runtime_config": json.dumps(runtime_config, ensure_ascii=False),
        },
    )
    return {"id": api_id, "publishStatus": "success", "publishVersion": version, "publishedAt": now.isoformat()}


def ensure_resource_api(resource_id: int) -> dict[str, Any]:
    resource = fetch_one("SELECT * FROM eco_data_resources WHERE id=%(id)s", {"id": resource_id})
    if not resource:
        raise LookupError("数据资源不存在")
    resource_code = str(resource.get("resource_code") or "").strip()
    resource_name = str(resource.get("resource_name") or "").strip()
    if not resource_code or not resource_name or not resource.get("data_source_id"):
        raise ValueError("请先完整维护资源编码、名称和数据源")
    token = re.sub(r"[^A-Za-z0-9_-]+", "-", resource_code).strip("-") or f"resource-{resource_id}"
    existing = fetch_one(
        "SELECT * FROM security_api_resources WHERE resource_id=%(resource_id)s ORDER BY id ASC LIMIT 1",
        {"resource_id": resource_id},
    )
    if existing and str(existing.get("channel_type") or "query_service") in STREAM_CHANNEL_TYPES:
        return {
            "id": int(existing["id"]),
            "created": False,
            "publishStatus": existing.get("publish_status"),
        }
    draft_api = {
        **(existing or {}),
        "resource_id": resource_id,
        "data_source_id": resource.get("data_source_id"),
        "runtime_config_json": {},
    }
    runtime_config, source_id = build_resource_runtime_config(draft_api)
    desired = {
        "api_code": f"API-{token}",
        "api_name": f"{resource_name}查询 API",
        "gateway_path": f"/data-api/resources/{token.lower()}",
        "data_source_id": source_id,
        "runtime_config_json": runtime_config,
        "protection_level": str(resource.get("protection_level") or "l2"),
        "supports_homomorphic": bool(existing and existing.get("supports_homomorphic"))
        or str(resource.get("protection_level") or "").lower() == "l3",
    }
    now = datetime.now(timezone.utc)
    if not existing:
        row = fetch_one(
            """
            INSERT INTO security_api_resources (
              api_code, api_name, channel_type, access_mode, http_method, upstream_url, orchestrator_path,
              gateway_path, protection_level, supports_row_filter, supports_field_filter,
              supports_aggregate, supports_homomorphic, api_status, publish_version,
              publish_status, publish_error, resource_id, data_source_id, runtime_config_json,
              "createdAt", "updatedAt"
            ) VALUES (
              %(api_code)s, %(api_name)s, 'query_service', 'develop', 'GET', NULL, '/internal/resource-query',
              %(gateway_path)s, %(protection_level)s, true, true, false, %(supports_homomorphic)s, 'draft', 0,
              'unpublished', NULL, %(resource_id)s, %(data_source_id)s, %(runtime_config)s::jsonb,
              %(now)s, %(now)s
            ) RETURNING *
            """,
            {
                **desired,
                "resource_id": resource_id,
                "runtime_config": json.dumps(runtime_config, ensure_ascii=False),
                "now": now,
            },
        ) or {}
        return {"id": int(row["id"]), "created": True, "publishStatus": row.get("publish_status")}

    config_changed = _json_object(existing.get("runtime_config_json")) != runtime_config
    identity_changed = any(str(existing.get(key) or "") != str(desired[key]) for key in ("api_code", "api_name", "gateway_path", "data_source_id", "protection_level", "supports_homomorphic"))
    if config_changed or identity_changed:
        fetch_one(
            """
            UPDATE security_api_resources
            SET api_code=%(api_code)s, api_name=%(api_name)s, channel_type='query_service', access_mode='develop', http_method='GET',
                upstream_url=NULL, orchestrator_path='/internal/resource-query', gateway_path=%(gateway_path)s,
                data_source_id=%(data_source_id)s, runtime_config_json=%(runtime_config)s::jsonb,
                protection_level=%(protection_level)s, supports_homomorphic=%(supports_homomorphic)s,
                api_status='draft', publish_status='unpublished', publish_error=NULL, "updatedAt"=%(now)s
            WHERE id=%(id)s
            RETURNING *
            """,
            {
                **desired,
                "id": existing["id"],
                "runtime_config": json.dumps(runtime_config, ensure_ascii=False),
                "now": now,
            },
        )
    return {
        "id": int(existing["id"]),
        "created": False,
        "publishStatus": "unpublished" if config_changed or identity_changed else existing.get("publish_status"),
    }


def unpublish_api(api_id: int) -> dict[str, Any]:
    row = fetch_one(
        """
        UPDATE security_api_resources
        SET api_status='disabled', publish_status='unpublished', publish_error=NULL, "updatedAt"=%(now)s
        WHERE id=%(id)s
        RETURNING id
        """,
        {"id": api_id, "now": datetime.now(timezone.utc)},
    )
    if not row:
        raise LookupError("API 资源不存在")
    return {"id": api_id, "publishStatus": "unpublished", "apiStatus": "disabled"}


def publish_policy(policy_id: int) -> dict[str, Any]:
    policy = fetch_one(
        """
        SELECT policy.*, subject.subject_status, subject.allowed_api_codes_json,
               api.api_code, api.api_status, api.publish_status AS api_publish_status,
               api.orchestrator_path, api.runtime_config_json
        FROM eco_resource_security_policies policy
        LEFT JOIN security_access_subjects subject ON subject.id = policy.subject_id
        LEFT JOIN security_api_resources api ON api.id = policy.api_resource_id
        WHERE policy.id = %(id)s AND policy.policy_kind = 'access_policy'
        """,
        {"id": policy_id},
    )
    if not policy:
        raise LookupError("访问策略不存在")
    errors = []
    for field, label in [
        ("policy_code", "策略编码"),
        ("scenario", "使用场景"),
        ("resource_id", "数据资源"),
        ("subject_id", "访问主体"),
        ("api_resource_id", "API 资源"),
        ("output_mode", "输出模式"),
    ]:
        if not policy.get(field):
            errors.append(f"{label}不能为空")
    if policy.get("subject_status") != "enabled":
        errors.append("访问主体未启用")
    if policy.get("api_status") != "enabled" or policy.get("api_publish_status") != "success":
        errors.append("API 资源尚未发布")
    allowed_api_codes = {str(item).strip().upper() for item in _json_list(policy.get("allowed_api_codes_json"))}
    if not allowed_api_codes:
        errors.append("访问主体的 API 授权清单不能为空")
    elif "*" not in allowed_api_codes and str(policy.get("api_code") or "").strip().upper() not in allowed_api_codes:
        errors.append("访问主体尚未在 API 授权清单中包含当前 API")
    if int(policy.get("max_requests_per_minute") or 0) <= 0:
        errors.append("每分钟请求上限必须大于 0")
    if not 1 <= int(policy.get("max_query_days") or 0) <= 31:
        errors.append("最大查询天数必须在 1 到 31 之间")
    if not 1 <= int(policy.get("max_rows") or 0) <= 100000:
        errors.append("最大返回行数必须在 1 到 100000 之间")
    policy_regions = [str(item).strip() for item in _json_list(policy.get("region_scope_json")) if str(item).strip()]
    if policy_regions:
        api_config = _json_object(policy.get("runtime_config_json"))
        processing_path = str(policy.get("orchestrator_path") or "")
        region_field_code = str(api_config.get("regionFieldCode") or api_config.get("region_field_code") or "").strip()
        query_sql, query_parameters = validate_custom_query_sql(api_config.get("querySql") or api_config.get("query_sql"))
        if processing_path == "/internal/resource-query" and not region_field_code:
            errors.append("区域范围已配置，但 API 未映射区域字段")
        if processing_path == "/internal/resource-query" and query_sql and "regionCode" not in query_parameters:
            errors.append("区域范围已配置，自定义 SQL 必须引用 :regionCode")
    rules = _json_object(policy.get("abnormal_access_rules_json"))
    for rule_name in DEFAULT_ABNORMAL_ACCESS_RULES:
        rule = rules.get(rule_name)
        if rule is None:
            continue
        if not isinstance(rule, dict) or str(rule.get("action") or "") not in {"deny", "allow"}:
            errors.append(f"异常访问规则 {rule_name} 的 action 必须是 deny 或 allow")
            continue
        if "enabled" in rule and not isinstance(rule.get("enabled"), bool):
            errors.append(f"异常访问规则 {rule_name} 的 enabled 必须是布尔值")
    now = datetime.now(timezone.utc)
    if errors:
        execute(
            "UPDATE eco_resource_security_policies SET publish_status='failed', publish_error=%(error)s, \"updatedAt\"=%(now)s WHERE id=%(id)s",
            {"id": policy_id, "error": "；".join(errors), "now": now},
        )
        raise ValueError("；".join(errors))
    version = int(policy.get("policy_version") or 0) + 1
    config_version = f"runtime-v{version}-{now.strftime('%Y%m%d%H%M%S')}"
    snapshot = build_policy_runtime_snapshot(policy, config_version)
    constraints = _json_object(snapshot.get("hardConstraints"))
    output_mode = str(policy.get("output_mode") or "detail")
    if constraints.get("aggregateOnly") and output_mode != "aggregate":
        errors.append("当前数据资源标签要求访问策略仅输出聚合结果")
    if constraints.get("encryptedOnly") and output_mode != "encrypted":
        errors.append("当前数据资源标签要求访问策略仅输出密态结果")
    if errors:
        execute(
            "UPDATE eco_resource_security_policies SET publish_status='failed', publish_error=%(error)s, \"updatedAt\"=%(now)s WHERE id=%(id)s",
            {"id": policy_id, "error": "；".join(errors), "now": now},
        )
        raise ValueError("；".join(errors))
    policy_detail = _json_object(policy.get("policy_detail_json"))
    policy_detail["runtimeSnapshot"] = snapshot
    execute(
        """
        UPDATE eco_resource_security_policies
        SET policy_status='enabled', publish_status='success', policy_version=%(version)s,
            gateway_config_version=%(config_version)s, published_at=%(now)s,
            policy_detail_json=%(policy_detail)s::jsonb,
            publish_error=NULL, "updatedAt"=%(now)s
        WHERE id=%(id)s
        """,
        {
            "id": policy_id,
            "version": version,
            "config_version": config_version,
            "policy_detail": json.dumps(policy_detail, ensure_ascii=False),
            "now": now,
        },
    )
    return {
        "id": policy_id,
        "publishStatus": "success",
        "policyVersion": version,
        "runtimeConfigVersion": config_version,
        "labelSnapshotVersion": config_version,
        "matchedLabels": snapshot.get("matchedLabels", []),
        "publishedAt": now.isoformat(),
    }
