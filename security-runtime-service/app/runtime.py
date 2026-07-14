from __future__ import annotations

import json
import re
import time
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
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
    calculate_risk,
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
DENIALS = {
    "AUTH_MISSING": (401, "缺少访问凭据", 100),
    "API_KEY_INVALID": (401, "API Key 校验失败", 100),
    "SIGNATURE_INVALID": (401, "访问凭据校验失败", 100),
    "REQUEST_EXPIRED": (401, "请求已过期", 100),
    "REPLAY_DETECTED": (409, "请求已处理，请勿重复提交", 100),
    "SUBJECT_DISABLED": (403, "访问主体不可用", 95),
    "API_NOT_AUTHORIZED": (403, "当前访问主体未获准访问该 API", 95),
    "POLICY_NOT_FOUND": (403, "当前主体未获得该服务授权", 90),
    "POLICY_EXPIRED": (403, "访问授权不在有效期内", 90),
    "IP_NOT_ALLOWED": (403, "当前网络来源不允许访问", 80),
    "FIELD_NOT_ALLOWED": (403, "请求包含未授权字段", 80),
    "RISK_REJECTED": (403, "当前请求因安全风险被拒绝", 70),
    "QUERY_RANGE_EXCEEDED": (422, "查询范围超过授权限制", 60),
    "ROW_LIMIT_EXCEEDED": (422, "请求数据量超过授权限制", 70),
    "OFF_HOURS": (403, "当前时间不在允许访问时段内", 70),
    "SCOPE_VIOLATION": (403, "请求的数据范围不在授权范围内", 80),
    "RATE_LIMITED": (429, "调用频率超过授权限制", 70),
    "VALIDATION_ERROR": (400, "请求参数不符合要求", 60),
    "ROUTE_NOT_FOUND": (404, "数据服务未发布或已停用", 40),
    "UPSTREAM_UNAVAILABLE": (502, "上游数据服务暂不可用", 50),
}

DEFAULT_ABNORMAL_ACCESS_RULES = {
    "offHours": {"enabled": True, "action": "deny", "riskScore": 70},
    "highFrequency": {"enabled": True, "action": "deny", "riskScore": 70},
    "queryRangeExceeded": {"enabled": True, "action": "deny", "riskScore": 60},
    "rowLimitExceeded": {"enabled": True, "action": "deny", "riskScore": 70},
    "scopeViolation": {"enabled": True, "action": "deny", "riskScore": 80},
    "behaviorAnomaly": {"enabled": True, "action": "risk", "riskScore": 20},
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
    if isinstance(value, datetime):
        return value.isoformat()
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


def abnormal_access_rule(policy: dict[str, Any], key: str) -> dict[str, Any]:
    default = DEFAULT_ABNORMAL_ACCESS_RULES[key]
    configured = _json_object(policy.get("abnormal_access_rules_json")).get(key)
    configured = configured if isinstance(configured, dict) else {}
    action = str(configured.get("action") or default["action"]).strip()
    if action not in {"deny", "risk", "allow"}:
        action = str(default["action"])
    return {
        "enabled": bool(configured.get("enabled", default["enabled"])),
        "action": action,
        "riskScore": max(0, min(100, int(configured.get("riskScore", default["riskScore"]) or 0))),
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
    resource_codes = [str(item.get("field_code") or "").strip().upper() for item in fields]
    resource_codes = list(dict.fromkeys(code for code in resource_codes if code))
    if not resource_codes:
        raise ValueError("数据资源尚未维护字段，无法发布 API")

    configured = _json_object(api.get("runtime_config_json"))
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
    } or {code: code for code in resource_codes if code in output_codes}
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

    def configured_or_detect(camel_name: str, snake_name: str, markers: tuple[str, ...]) -> str:
        configured_code = str(configured.get(camel_name) or configured.get(snake_name) or "").strip().upper()
        if configured_code:
            if configured_code not in field_map:
                raise ValueError(f"{camel_name} 未包含在字段映射中")
            return configured_code
        return next((code for code in field_map if any(marker in code for marker in markers)), "")

    return {
        "version": 1,
        "dialect": dialect,
        "table": table_name,
        "fieldMap": field_map,
        "defaultFields": default_fields,
        "maskFields": mask_fields,
        "timeFieldCode": configured_or_detect("timeFieldCode", "time_field_code", ("TIME", "DATE")),
        "regionFieldCode": configured_or_detect("regionFieldCode", "region_field_code", ("REGION",)),
        "organizationFieldCode": configured_or_detect("organizationFieldCode", "organization_field_code", ("ORGANIZATION", "ORG_CODE")),
    }, int(source_id)


def verify_resource_runtime_config(api: dict[str, Any]) -> None:
    config = _json_object(api.get("runtime_config_json"))
    source = fetch_one(
        "SELECT * FROM security_data_sources WHERE id=%(id)s LIMIT 1",
        {"id": api.get("data_source_id")},
    ) or {}
    dialect = str(_json_object(source.get("connection_options_json")).get("dialect") or "postgresql").lower()
    table_name = _quote_identifier(config.get("table"), dialect)
    columns = ", ".join(_quote_identifier(column, dialect) for column in _json_object(config.get("fieldMap")).values())
    if not columns:
        raise ValueError("运行字段映射不能为空")
    context = RuntimeContext("publish-check", api, {}, {}, 0, "management", 0, 0)
    with measurement_connection(context) as current, current.cursor() as cursor:
        cursor.execute(f"SELECT {columns} FROM {table_name} LIMIT 0")


def load_api(path: str, method: str) -> dict[str, Any] | None:
    return fetch_one(
        """
        SELECT * FROM security_api_resources
        WHERE gateway_path = %(path)s AND upper(http_method) = %(method)s
          AND api_status = 'enabled' AND publish_status = 'success'
        LIMIT 1
        """,
        {"path": path, "method": method.upper()},
    )


def load_subject(access_key: str) -> dict[str, Any] | None:
    return fetch_one(
        "SELECT * FROM security_access_subjects WHERE subject_code = %(code)s LIMIT 1",
        {"code": access_key},
    )


def load_subject_by_api_key(api_key: str) -> dict[str, Any] | None:
    if len(api_key) < 32:
        return None
    for subject in fetch_all("SELECT * FROM security_access_subjects WHERE subject_status = 'enabled'"):
        expected = settings.subject_secrets.get(str(subject.get("credential_ref") or ""), "")
        if api_key_matches(expected, api_key):
            return subject
    return None


def load_policy(subject_id: int, api_id: int, scenario: str) -> dict[str, Any] | None:
    return fetch_one(
        """
        SELECT policy.*, baseline.frequency_avg, baseline.frequency_stddev,
               baseline.query_days_avg, baseline.query_days_stddev,
               baseline.rows_avg, baseline.rows_stddev,
               baseline.normal_time_ranges_json AS baseline_time_ranges
        FROM eco_resource_security_policies policy
        LEFT JOIN security_behavior_baselines baseline
          ON baseline.subject_id = policy.subject_id
         AND baseline.api_resource_id = policy.api_resource_id
         AND baseline.baseline_status = 'enabled'
        WHERE policy.policy_kind = 'access_policy'
          AND policy.policy_status = 'enabled'
          AND policy.publish_status = 'success'
          AND policy.subject_id = %(subject_id)s
          AND policy.api_resource_id = %(api_id)s
          AND policy.scenario = %(scenario)s
        ORDER BY policy.policy_version DESC
        LIMIT 1
        """,
        {"subject_id": subject_id, "api_id": api_id, "scenario": scenario},
    )


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
    if settings.enforce_source_ip and not ip_allowed(address, _json_list(policy.get("source_ips_json"))):
        raise RuntimeDenied(
            "IP_NOT_ALLOWED",
            request_id=request_id,
            api=api,
            subject=subject,
            policy=policy,
            client_ip=address,
        )

    start_at = _parse_time(request.query_params.get("startAt"))
    end_at = _parse_time(request.query_params.get("endAt"))
    if start_at and end_at and end_at > start_at:
        query_days = (end_at - start_at).total_seconds() / 86400
    else:
        query_days = 0
    requested_rows = max(
        [
            int(request.query_params.get(name) or 0)
            for name in ("pageSize", "limit", "maxRows")
            if str(request.query_params.get(name) or "0").isdigit()
        ]
        or [0]
    )
    extra_risk = 0
    should_deny, risk_points = violation_risk(
        policy, "queryRangeExceeded", query_days > int(policy.get("max_query_days") or 1)
    )
    extra_risk += risk_points
    if should_deny:
        raise RuntimeDenied(
            "QUERY_RANGE_EXCEEDED",
            request_id=request_id,
            api=api,
            subject=subject,
            policy=policy,
            client_ip=address,
            query_days=query_days,
            requested_rows=requested_rows,
        )

    region = request.query_params.get("regionCode")
    organization = request.query_params.get("organizationCode")
    scope_violation = bool(
        region and _json_list(policy.get("region_scope_json"))
        and region not in _json_list(policy.get("region_scope_json"))
    ) or bool(
        organization and _json_list(policy.get("organization_scope_json"))
        and organization not in _json_list(policy.get("organization_scope_json"))
    )
    should_deny, risk_points = violation_risk(policy, "scopeViolation", scope_violation)
    extra_risk += risk_points
    if should_deny:
        raise RuntimeDenied(
            "SCOPE_VIOLATION", request_id=request_id, api=api, subject=subject, policy=policy,
            client_ip=address, query_days=query_days, requested_rows=requested_rows,
        )
    fields = request.query_params.get("fields")
    if fields:
        requested_fields = [item.strip() for item in fields.split(",") if item.strip()]
        runtime_field_map = _json_object(_json_object(api.get("runtime_config_json")).get("fieldMap"))
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

    rate_key = f"{subject['subject_code']}:{api['api_code']}:{datetime.now().strftime('%Y%m%d%H%M')}"
    frequency = request_memory.increment_rate(rate_key)
    should_deny, risk_points = violation_risk(
        policy, "highFrequency", frequency > int(policy.get("max_requests_per_minute") or 60)
    )
    extra_risk += risk_points
    if should_deny:
        raise RuntimeDenied(
            "RATE_LIMITED", request_id=request_id, api=api, subject=subject, policy=policy,
            client_ip=address, query_days=query_days, requested_rows=requested_rows,
        )
    allowed_time_ranges = _json_list(policy.get("allowed_time_ranges_json"))
    should_deny, risk_points = violation_risk(
        policy,
        "offHours",
        bool(allowed_time_ranges) and not in_time_ranges(datetime.now().astimezone(), allowed_time_ranges),
    )
    extra_risk += risk_points
    if should_deny:
        raise RuntimeDenied(
            "OFF_HOURS", request_id=request_id, api=api, subject=subject, policy=policy,
            client_ip=address, query_days=query_days, requested_rows=requested_rows,
        )
    should_deny, risk_points = violation_risk(
        policy, "rowLimitExceeded", requested_rows > int(policy.get("max_rows") or 1000)
    )
    extra_risk += risk_points
    if should_deny:
        raise RuntimeDenied(
            "ROW_LIMIT_EXCEEDED", request_id=request_id, api=api, subject=subject, policy=policy,
            client_ip=address, query_days=query_days, requested_rows=requested_rows,
        )
    behavior_rule = abnormal_access_rule(policy, "behaviorAnomaly")
    baseline = policy if policy.get("frequency_avg") is not None else None
    score = calculate_risk(
        now=datetime.now().astimezone(),
        allowed_time_ranges=allowed_time_ranges if abnormal_access_rule(policy, "offHours")["action"] == "risk" else [],
        frequency=frequency,
        query_days=query_days,
        requested_rows=requested_rows,
        max_rows=int(policy.get("max_rows") or 1000) if abnormal_access_rule(policy, "rowLimitExceeded")["action"] == "risk" else 2**31,
        baseline=baseline if behavior_rule["enabled"] and behavior_rule["action"] == "risk" else None,
    )
    score = min(100, score + extra_risk)
    threshold = int(policy.get("risk_threshold") or 70)
    if score >= threshold or score >= 70:
        raise RuntimeDenied(
            "RISK_REJECTED", request_id=request_id, api=api, subject=subject, policy=policy,
            client_ip=address, query_days=query_days, requested_rows=requested_rows, risk_score=score,
        )
    return RuntimeContext(
        request_id=request_id,
        api=api,
        subject=subject,
        policy=policy,
        risk_score=score,
        client_ip=address,
        query_days=query_days,
        requested_rows=requested_rows,
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


def resource_query(params, context: RuntimeContext) -> tuple[list[dict[str, Any]], dict[str, int]]:
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

    source = fetch_one(
        "SELECT * FROM security_data_sources WHERE id=%(id)s LIMIT 1",
        {"id": context.api.get("data_source_id")},
    ) or {}
    options = _json_object(source.get("connection_options_json"))
    dialect = str(options.get("dialect") or "postgresql").lower()
    quoted_table = _quote_identifier(table_name, dialect)
    for column in field_map.values():
        _quote_identifier(column, dialect)

    requested = [item.strip().upper() for item in str(params.get("fields") or "").split(",") if item.strip()]
    default_fields = [str(item).upper() for item in _json_list(config.get("defaultFields") or config.get("default_fields"))]
    selected_codes = list(dict.fromkeys(requested or default_fields or list(field_map)))
    if not selected_codes or any(code not in field_map for code in selected_codes):
        raise PermissionError("FIELD_NOT_ALLOWED")

    select_columns = ", ".join(
        f"{_quote_identifier(field_map[code], dialect)} AS {_quote_identifier(_camel_case(code.lower()), dialect)}"
        for code in selected_codes
    )
    conditions: list[str] = []
    parameters: dict[str, Any] = {}
    time_code = str(config.get("timeFieldCode") or config.get("time_field_code") or "").upper()
    region_code = str(config.get("regionFieldCode") or config.get("region_field_code") or "").upper()
    organization_code = str(config.get("organizationFieldCode") or config.get("organization_field_code") or "").upper()
    start_at = _parse_time(str(params.get("startAt") or ""))
    end_at = _parse_time(str(params.get("endAt") or ""))
    if time_code:
        if time_code not in field_map or not start_at or not end_at or end_at <= start_at:
            raise ValueError("VALIDATION_ERROR")
        time_column = _quote_identifier(field_map[time_code], dialect)
        conditions.extend([f"{time_column} >= %(start_at)s", f"{time_column} < %(end_at)s"])
        parameters.update({"start_at": start_at, "end_at": end_at})
    region = str(params.get("regionCode") or "").strip()
    if region and region_code:
        if region_code not in field_map:
            raise ValueError("VALIDATION_ERROR")
        conditions.append(f"{_quote_identifier(field_map[region_code], dialect)} = %(region)s")
        parameters["region"] = region
    organization = str(params.get("organizationCode") or "").strip()
    if organization and organization_code:
        if organization_code not in field_map:
            raise ValueError("VALIDATION_ERROR")
        conditions.append(f"{_quote_identifier(field_map[organization_code], dialect)} = %(organization)s")
        parameters["organization"] = organization

    page = max(1, int(params.get("page") or 1))
    page_size = min(max(1, int(params.get("pageSize") or 100)), int(context.policy.get("max_rows") or 1000), 1000)
    parameters.update({"limit": page_size, "offset": (page - 1) * page_size})
    where_clause = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    order_clause = f" ORDER BY {_quote_identifier(field_map[time_code], dialect)}" if time_code else ""
    statement = f"SELECT {select_columns} FROM {quoted_table}{where_clause}{order_clause} LIMIT %(limit)s OFFSET %(offset)s"

    with measurement_connection(context) as current, current.cursor() as cursor:
        cursor.execute(statement, parameters)
        raw_rows = cursor.fetchall()
    mask_codes = {str(item).upper() for item in _json_list(config.get("maskFields") or config.get("mask_fields"))}
    rows = []
    for raw in raw_rows:
        row = dict(raw)
        if context.output_mode == "masked":
            for code in mask_codes:
                key = _camel_case(code.lower())
                if row.get(key) not in {None, ""}:
                    text = str(row[key])
                    row[key] = f"{text[:3]}***{text[-2:]}" if len(text) > 5 else "***"
        rows.append({key: _json_value(value) for key, value in row.items()})
    return rows, {"page": page, "pageSize": page_size, "returnedRows": len(rows)}


def aggregate_measurements(params, context: RuntimeContext | None = None) -> list[dict[str, Any]]:
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


def detail_measurements(params, context: RuntimeContext) -> tuple[list[dict[str, Any]], dict[str, int]]:
    region, start_at, end_at = _validate_range(params, context)
    organization = str(params.get("organizationCode") or "").strip()
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
        "{organization_filter} "
        "AND measurement_time >= %(start_at)s AND measurement_time < %(end_at)s "
        "ORDER BY measurement_time, point_code LIMIT %(limit)s OFFSET %(offset)s"
    ).format(
        columns=columns,
        organization_filter=sql.SQL("AND organization_code = %(organization)s")
        if organization
        else sql.SQL(""),
    )
    with measurement_connection(context) as current, current.cursor() as cursor:
        cursor.execute(
            statement,
            {
                "region": region,
                "organization": organization,
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


async def execute_data_api(request, context: RuntimeContext) -> tuple[Any, int]:
    mode = str(context.api.get("access_mode") or "")
    processing_path = str(context.api.get("orchestrator_path") or "")
    if mode == "direct":
        upstream = str(context.api.get("upstream_url") or "")
        if not upstream.startswith(("http://", "https://")):
            raise RuntimeDenied(
                "UPSTREAM_UNAVAILABLE", request_id=context.request_id, api=context.api,
                subject=context.subject, policy=context.policy, client_ip=context.client_ip,
                query_days=context.query_days, requested_rows=context.requested_rows,
            )
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
            raise RuntimeDenied(
                "UPSTREAM_UNAVAILABLE", request_id=context.request_id, api=context.api,
                subject=context.subject, policy=context.policy, client_ip=context.client_ip,
                query_days=context.query_days, requested_rows=context.requested_rows,
            ) from error
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
    if processing_path == "/internal/active-power":
        rows, meta = detail_measurements(params, context)
        meta.update(
            {"decision": "allow", "outputMode": context.output_mode, "riskLevel": context.level}
        )
        return {"requestId": context.request_id, "data": rows, "meta": meta}, len(rows)
    if processing_path == "/internal/region-hourly":
        if context.output_mode != "aggregate" or params.get("metric", "active_power") != "active_power":
            raise RuntimeDenied(
                "VALIDATION_ERROR", request_id=context.request_id, api=context.api,
                subject=context.subject, policy=context.policy, client_ip=context.client_ip,
                query_days=context.query_days, requested_rows=context.requested_rows,
            )
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
        if context.output_mode not in {"detail", "masked"}:
            raise RuntimeDenied(
                "POLICY_NOT_FOUND", request_id=context.request_id, api=context.api,
                subject=context.subject, policy=context.policy, client_ip=context.client_ip,
                query_days=context.query_days, requested_rows=context.requested_rows,
            )
        rows, meta = resource_query(params, context)
        meta.update({"decision": "allow", "outputMode": context.output_mode, "riskLevel": context.level})
        return {"requestId": context.request_id, "data": rows, "meta": meta}, len(rows)
    raise RuntimeDenied(
        "ROUTE_NOT_FOUND", request_id=context.request_id, api=context.api, subject=context.subject,
        policy=context.policy, client_ip=context.client_ip, query_days=context.query_days,
        requested_rows=context.requested_rows,
    )


def record_allowed(context: RuntimeContext, returned_rows: int, duration_ms: int) -> None:
    now = datetime.now(timezone.utc)
    execute(
        """
        INSERT INTO security_policy_decision_logs (
          request_id, subject_id, api_resource_id, policy_id,
          requested_output_mode, effective_output_mode, decision_result,
          decision_reason_code, decision_reason, risk_score, risk_level,
          client_ip, query_days, requested_rows, returned_rows, response_status,
          response_bytes, duration_ms, requested_at, "createdAt", "updatedAt"
        ) VALUES (
          %(request_id)s, %(subject_id)s, %(api_id)s, %(policy_id)s,
          %(output_mode)s, %(output_mode)s, 'allow', 'POLICY_ALLOW',
          '请求通过已发布访问策略校验', %(risk_score)s, %(risk_level)s,
          %(client_ip)s, %(query_days)s, %(requested_rows)s, %(returned_rows)s,
          200, 0, %(duration_ms)s, %(now)s, %(now)s, %(now)s
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
            "now": now,
        },
    )


def record_denied(error: RuntimeDenied, duration_ms: int) -> None:
    now = datetime.now(timezone.utc)
    with connection() as current, current.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO security_policy_decision_logs (
              request_id, subject_id, api_resource_id, policy_id,
              requested_output_mode, effective_output_mode, decision_result,
              decision_reason_code, decision_reason, risk_score, risk_level,
              client_ip, query_days, requested_rows, returned_rows, response_status,
              response_bytes, duration_ms, requested_at, "createdAt", "updatedAt"
            ) VALUES (
              %(request_id)s, %(subject_id)s, %(api_id)s, %(policy_id)s,
              %(output_mode)s, %(output_mode)s, 'deny', %(reason_code)s,
              %(reason)s, %(risk_score)s, %(risk_level)s, %(client_ip)s,
              %(query_days)s, %(requested_rows)s, 0, %(response_status)s,
              0, %(duration_ms)s, %(now)s, %(now)s, %(now)s
            ) ON CONFLICT (request_id) DO NOTHING RETURNING id
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
                "now": now,
            },
        )
        row = cursor.fetchone()
        if row and error.risk_score >= 70:
            cursor.execute(
                """
                INSERT INTO security_risk_events (
                  event_code, risk_type, risk_score, risk_level, risk_reason,
                  action_taken, event_status, decision_log_id, "createdAt", "updatedAt"
                ) VALUES (
                  %(event_code)s, %(risk_type)s, %(risk_score)s, %(risk_level)s,
                  %(reason)s, 'deny', 'pending', %(decision_id)s, %(now)s, %(now)s
                ) ON CONFLICT (event_code) DO NOTHING
                """,
                {
                    "event_code": f"RISK-{error.request_id}",
                    "risk_type": error.code.lower(),
                    "risk_score": error.risk_score,
                    "risk_level": risk_level(error.risk_score),
                    "reason": error.message,
                    "decision_id": row["id"],
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
          (SELECT count(*) FROM security_policy_decision_logs) AS calls,
          (SELECT count(*) FROM security_risk_events WHERE event_status <> 'closed') AS risks
        """
    ) or {}
    return {key: int(value or 0) for key, value in row.items()}


def validate_api(api: dict[str, Any]) -> list[str]:
    errors = []
    if not str(api.get("gateway_path") or "").startswith("/data-api/"):
        errors.append("发布路径必须以 /data-api/ 开头")
    if str(api.get("http_method") or "").upper() not in {"GET", "POST"}:
        errors.append("请求方法只支持 GET 或 POST")
    mode = str(api.get("access_mode") or "")
    if mode == "direct" and not str(api.get("upstream_url") or "").startswith(("http://", "https://")):
        errors.append("直接纳管模式必须配置有效上游地址")
    if mode in {"develop", "orchestrate"} and str(api.get("orchestrator_path") or "") not in {
        "",
        "/internal/active-power",
        "/internal/region-hourly",
        "/internal/resource-query",
    }:
        errors.append("处理路径未绑定可用的数据处理能力")
    if mode not in {"direct", "develop", "orchestrate"}:
        errors.append("接入模式不受支持")
    return errors


def publish_api(api_id: int) -> dict[str, Any]:
    api = fetch_one("SELECT * FROM security_api_resources WHERE id = %(id)s", {"id": api_id})
    if not api:
        raise LookupError("API 资源不存在")
    errors = validate_api(api)
    runtime_config = _json_object(api.get("runtime_config_json"))
    source_id = api.get("data_source_id")
    if str(api.get("access_mode") or "") in {"develop", "orchestrate"} and str(api.get("orchestrator_path") or "") not in {
        "/internal/active-power", "/internal/region-hourly",
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


def publish_policy(policy_id: int) -> dict[str, Any]:
    policy = fetch_one(
        """
        SELECT policy.*, subject.subject_status, subject.allowed_api_codes_json,
               api.api_code, api.api_status, api.publish_status AS api_publish_status
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
    if "*" not in allowed_api_codes and str(policy.get("api_code") or "").strip().upper() not in allowed_api_codes:
        errors.append("访问主体尚未在 API 授权清单中包含当前 API")
    if int(policy.get("max_requests_per_minute") or 0) <= 0:
        errors.append("每分钟请求上限必须大于 0")
    if not 1 <= int(policy.get("max_query_days") or 0) <= 31:
        errors.append("最大查询天数必须在 1 到 31 之间")
    if not 1 <= int(policy.get("max_rows") or 0) <= 100000:
        errors.append("最大返回行数必须在 1 到 100000 之间")
    if not 1 <= int(policy.get("risk_threshold") or 0) <= 100:
        errors.append("风险阈值必须在 1 到 100 之间")
    rules = _json_object(policy.get("abnormal_access_rules_json"))
    for rule_name in DEFAULT_ABNORMAL_ACCESS_RULES:
        rule = rules.get(rule_name)
        if rule is not None and (
            not isinstance(rule, dict)
            or str(rule.get("action") or "") not in {"deny", "risk", "allow"}
        ):
            errors.append(f"异常访问规则 {rule_name} 的 action 必须是 deny、risk 或 allow")
    now = datetime.now(timezone.utc)
    if errors:
        execute(
            "UPDATE eco_resource_security_policies SET publish_status='failed', publish_error=%(error)s, \"updatedAt\"=%(now)s WHERE id=%(id)s",
            {"id": policy_id, "error": "；".join(errors), "now": now},
        )
        raise ValueError("；".join(errors))
    version = int(policy.get("policy_version") or 0) + 1
    config_version = f"runtime-v{version}-{now.strftime('%Y%m%d%H%M%S')}"
    execute(
        """
        UPDATE eco_resource_security_policies
        SET policy_status='enabled', publish_status='success', policy_version=%(version)s,
            gateway_config_version=%(config_version)s, published_at=%(now)s,
            publish_error=NULL, "updatedAt"=%(now)s
        WHERE id=%(id)s
        """,
        {"id": policy_id, "version": version, "config_version": config_version, "now": now},
    )
    return {
        "id": policy_id,
        "publishStatus": "success",
        "policyVersion": version,
        "runtimeConfigVersion": config_version,
        "publishedAt": now.isoformat(),
    }
